import { use, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { GraphQLClient } from 'graphql-request';
import { useSobekCtx } from '../../context/SobekContext';
import type { FieldSpec } from '../types';
import { toInputEntity } from '../utils/toInput';
import { reduceToSobekInput } from '../utils/reduceToSobekInput';
import { normalizeEntityErrors } from '../utils/normalizeErrors';
import { isDirty } from '../utils/dirty';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

// Last-resort messages for failures that yield no usable message (transport
// errors, malformed responses, an empty `errors` array). Whenever the server
// does send messages they win, on both halves — these only fill the silence,
// and when they do they reach the host through `onError`. Note that `onError`
// carries *general* errors only: a save rejected purely on field validation
// routes to `errors` for inline display and fires no callback.
const LOAD_ERR = 'Failed to load', SAVE_ERR = 'Failed to save';

// Registry key of the tenant discriminator. Stamped onto the write payload only
// when the entity actually carries it as a `locked` field (see handleSave).
const OWNER_FIELD = 'dataOwnerRef';

// Create mode has no record, so it has no key — and a form with no key issues
// no request and never suspends. `use()` is the one hook that may be called
// conditionally, which is what lets one hook serve both modes.
const CREATE_KEY = '';

// Stable empty map, so a cleared `errors` doesn't mint a new identity per render.
const NO_ERRORS: Record<string, string> = {};

export interface EntityFormConfig {
  fields: Record<string, FieldSpec>;
  query: {
    document: TypedDocumentNode<any, any>;
    variables: (netexId: string, dataOwnerRef: string) => unknown;
    resultPath: readonly (string | number)[];
  };
  mutation: {
    document: TypedDocumentNode<any, any>;
    resultPath: readonly (string | number)[];
    /** Generated wire-key mask for `<Entity>Input` — see `reduceToSobekInput`. */
    inputKeys: Record<string, unknown>;
  };
}

export interface UseEntityFormProps<E = any> extends EntityFormConfig {
  /**
   * The record's load, from {@link useEntityResource} — `null` in create mode.
   * It is a prop rather than something this hook starts for itself because the
   * promise must be held by a component that does *not* suspend; see the note
   * on `useEntityResource`.
   */
  resource: EntityResource<E> | null;
  onSaved?: (netexId: string) => void;
  onError?: (generalErrors: string[]) => void;
  /**
   * Every change to the form's entity, including the initial load and the
   * post-save refetch — not just user edits. Read-only observation: the hook
   * stays the source of truth, so feeding the value back in as a prop is not
   * supported. Read the returned `dirty` to detect *edits*.
   */
  onChange?: (value: any) => void;
}

/**
 * Settled-ness of the load, for consumers that must tell a missing record from
 * a failed one. There is no `'pending'`: the record is read with `use()`, so a
 * form with a pending load has not committed — the nearest `<Suspense>` is
 * showing its fallback instead, and this hook has not returned at all.
 */
export type LoadPhase = 'idle' | 'ok' | 'error';

/**
 * A settled load. Deliberately a *value*, not a rejected promise: `use()` would
 * rethrow a rejection into the nearest error boundary, which unmounts the form
 * and takes any in-progress edits with it. Failure is data, so a failed reload
 * can sit beside an editable entity exactly as it did before.
 */
type Loaded<E> = { ok: true; entity: E | undefined } | { ok: false; messages: string[] };

/** Read a value out of a response by the config's `resultPath`. */
const pluck = (data: unknown, path: readonly (string | number)[]): any =>
  path.reduce<any>((o, k) => o?.[k], data);

/**
 * Merge static and dynamic headers for one request.
 *
 * Resolved per request rather than held in state: state made every inline
 * `headers`/`getHeaders` literal mint a new identity, and re-reading `getHeaders`
 * here is what picks up a refreshed token.
 *
 * @param stat static headers from context
 * @param dyn dynamic header source from context; wins over `stat`
 * @returns the merged header map
 */
const resolveHeaders = async (
  stat?: Record<string, string>,
  dyn?: () => Record<string, string> | Promise<Record<string, string>>,
): Promise<Record<string, string>> => {
  const base = stat ? { ...stat } : {};
  if (!dyn) return base;
  try {
    return { ...base, ...(await dyn()) };
  } catch {
    // Failure to load dynamic headers should not silently block the form.
    // Fall back to static headers; downstream requests will fail visibly.
    return base;
  }
};

/**
 * One record's load, tagged with the identity that asked for it.
 *
 * That tag is what replaced the epoch counter: a response is applied because
 * the key that asked for it is still the current one, not because a counter
 * agrees. It carries the tenant and the endpoint as well as the id, so a row
 * fetched under one org can never land in a form showing another.
 */
export interface EntityResource<E> {
  key: string;
  load: Promise<Loaded<E>>;
}

/**
 * Start — and hold — the load for one record.
 *
 * **Must be called above the `<Suspense>` boundary the form reads behind.**
 * `use()` needs the same promise object on every attempt at a render, and a
 * component that suspends on its *first* render is discarded whole, hooks
 * included: a ref inside the suspending component cannot survive to hold it.
 * The component that renders the boundary never suspends, so its ref can. That
 * is the entire reason this is a second hook and not three lines of the first.
 *
 * @param config the entity's static query/mutation wiring
 * @param netexId record to load; omitted → create mode, which loads nothing
 * @returns the record's resource, or `null` in create mode
 */
export function useEntityResource<E>(
  config: EntityFormConfig,
  netexId?: string,
): EntityResource<E> | null {
  // Ambient session inputs from the provider — the hook requires it (the throw
  // is intended). None of them are ref-guarded: nothing here runs off an
  // effect's dependency list, so a provider re-render with fresh inline
  // literals cannot re-fire a load or clobber in-progress edits.
  const { endpoint, headers, getHeaders, dataOwnerRef } = useSobekCtx();
  const { query } = config;
  const key = netexId ? `${endpoint}|${dataOwnerRef}|${netexId}` : CREATE_KEY;

  const slot = useRef<EntityResource<E> | null>(null);
  if (key === CREATE_KEY) {
    // Dropped rather than kept, so that returning to a record refetches it
    // instead of replaying the response the form left with.
    slot.current = null;
  } else if (slot.current?.key !== key) {
    /** Fetch the record. Never rejects — see {@link Loaded}. */
    const load = (async (): Promise<Loaded<E>> => {
      try {
        const client = new GraphQLClient(endpoint, {
          headers: await resolveHeaders(headers, getHeaders),
        });
        const data = await client.request(query.document, query.variables(netexId!, dataOwnerRef));
        return { ok: true, entity: pluck(data, query.resultPath) as E | undefined };
      } catch (e) {
        // Empty registry by design: the query takes a netexId, not an `input`,
        // so there are no field paths to route to and every message is general.
        const { generalErrors } = normalizeEntityErrors(e, {});
        return { ok: false, messages: generalErrors.length ? generalErrors : [LOAD_ERR] };
      }
    })();
    slot.current = { key, load };
  }
  return slot.current;
}

// Internal hook — accepts generic E to type the returned entity shape.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function useEntityForm<E>(props: UseEntityFormProps<E>) {
  const { fields, query, mutation, resource, onSaved, onError, onChange } = props;
  // Session inputs for the *save* half. The load half reads its own copy in
  // `useEntityResource`, above the boundary.
  const { endpoint, headers, getHeaders, dataOwnerRef } = useSobekCtx();

  const key = resource?.key ?? CREATE_KEY;

  // Suspends until the record settles. A load left behind by a netexId change —
  // or by a switch into create mode — resolves into a render nobody performs,
  // which is the whole of the staleness story on this half.
  const res = resource ? use(resource.load) : undefined;

  // Last entity the server actually handed back. Read only when there is no
  // current one: a *failed* reload and a switch into create mode both have to
  // leave the record on screen rather than blank the form. A ref, not state —
  // it is written from the render that already produced the value, and read
  // only on renders some other change has triggered.
  const held = useRef<E | undefined>(undefined);
  if (res?.ok) held.current = res.entity;

  // The key the form is showing *now*. A save's Action captured its key when it
  // started, so asking whether that key is still current needs a live read —
  // which is what a ref is, and what the closure cannot be.
  const keyRef = useRef(key);
  keyRef.current = key;

  // What a save moved forward, tagged with the key it belongs to. That tag is
  // the save's staleness guard, by identity: a save landing after the form
  // switched records writes under a key nobody reads.
  const [saved, setSaved] = useState<{ key: string; entity: E | undefined } | null>(null);
  const [draft, setDraft] = useState<E | undefined>(undefined);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>(NO_ERRORS);

  // Discard the draft when the record changes — a new record must not be
  // masked by the previous one's edits. Not when the *host* drops netexId
  // (edit -> create), which is documented to preserve in-progress edits.
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    // Dropped on *every* key change, create mode included: `saved` is the
    // server's last word on one record, and it outranks the load in `baseline`.
    // Kept across a switch it would win over the refetch on the way back — the
    // form would show, and diff against, what this session saved rather than
    // what the server now holds.
    setSaved(null);
    if (key !== CREATE_KEY) {
      setDraft(undefined);
      setSaveErrors(NO_ERRORS);
    }
  }

  // The server's last word on the record now on screen, and the edited value
  // over it. This pair replaces the reducer's `value`/`baseline`: an untouched
  // form *is* its baseline, so a load or a save leaves it clean with nothing
  // to re-baseline.
  const baseline = saved?.key === key ? saved.entity : res?.ok ? res.entity : held.current;
  const value = draft ?? baseline;
  const dirty = useMemo(() => isDirty(value, baseline), [value, baseline]);

  const load: LoadPhase = !res ? 'idle' : res.ok ? 'ok' : 'error';

  // Load messages render as one line; the host gets them unjoined via `onError`.
  const errors = useMemo(
    () => (res && !res.ok ? { ...saveErrors, __init: res.messages.join('; ') } : saveErrors),
    [res, saveErrors],
  );

  const setValue = useCallback((v: E | undefined) => setDraft(v), []);

  // Cancel an edit session in place. The alternative hosts use today — remount
  // the form under a new `key` — throws away the loaded entity and re-fetches
  // it; this restores the baseline the hook already holds. `errors.__init` is
  // not cleared: it is derived from the load, and a failed *re*load describes
  // the record, not the edit session being discarded.
  const reset = useCallback(() => {
    setDraft(undefined);
    setSaveErrors(NO_ERRORS);
  }, []);

  // Host callbacks fire from effects below, so they are ref-held: an inline
  // arrow in a dependency list would re-fire on every render.
  const onErrorRef = useRef(onError);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // A failed load reaches the host once per record. `res` is the settled result
  // for the current key, so a retired or superseded load — whose result nobody
  // reads — cannot pop an error for a form that has already moved on.
  useEffect(() => {
    if (res && !res.ok) onErrorRef.current?.(res.messages);
  }, [res]);

  // Report value changes to the host, guarded on the previous value so a
  // re-render that did not move the form stays silent.
  //
  // `prevValue` starts at `undefined`, not at `value`: the first commit already
  // carries the loaded record (there is no pre-load commit to miss any more),
  // so seeding it with `value` would swallow the load the host is listening
  // for. A create-mode mount still stays silent — undefined has not moved.
  const prevValue = useRef<E | undefined>(undefined);
  useEffect(() => {
    if (prevValue.current === value) return;
    prevValue.current = value;
    onChangeRef.current?.(value);
  }, [value]);

  // Save + refetch, as a React 19 Action: `saving` is the transition's own
  // pending flag, held for the whole async body and released when it settles.
  // That is what retires the `SAVE_SETTLED` dispatch and the `mounted` ref —
  // React owns both the flag and the unmounted case.
  const [saving, startSave] = useTransition();

  const handleSave = useCallback(() => {
    if (!value) return;
    startSave(async () => {
      try {
        const client = new GraphQLClient(endpoint, {
          headers: await resolveHeaders(headers, getHeaders),
        });
        // dataOwnerRef is stamped from context at the wire edge, never sourced
        // from form state — a value loaded under one org must never be written
        // back under another. Driven by the registry, not by the key: an entity
        // whose Input has no dataOwnerRef (or where distill derived it as
        // serverManaged) must not get one, or every save fails validation.
        // `fields` is distilled from the patched schema, so it can yield keys the
        // live schema has never heard of; the mask is read from the live schema
        // and drops them here, at the wire edge, leaving the form model intact.
        const writable = reduceToSobekInput(toInputEntity(value, fields), mutation.inputKeys);
        const input = fields[OWNER_FIELD]?.locked
          ? { ...writable, [OWNER_FIELD]: dataOwnerRef }
          : writable;
        const data = await client.request(mutation.document, { input });
        const returnedId: string = pluck(data, mutation.resultPath);

        const refreshedData = await client.request(
          query.document,
          query.variables(returnedId, dataOwnerRef),
        );
        const refreshed = pluck(refreshedData, query.resultPath) as E | undefined;

        // The mutation committed on the server, so the host hears about it
        // wherever the form has moved to meanwhile.
        onSaved?.(returnedId);

        // Everything below writes the state of the form on screen, so none of
        // it may run for a record the form has left. Tagging `setSaved` alone
        // was not enough: the one switch that does not suspend — edit into
        // create mode — commits while the Action is still out, and the writes
        // then landed on a form the save knows nothing about.
        if (keyRef.current !== key) return;

        held.current = refreshed;
        // Tagged with the key this save started under, so a form that switched
        // records meanwhile ignores it. In create mode that key is CREATE_KEY,
        // which is how a created entity becomes the baseline with no reload.
        setSaved({ key, entity: refreshed });
        setDraft(undefined);
        setSaveErrors(NO_ERRORS);
      } catch (e) {
        const { fieldErrors, generalErrors } = normalizeEntityErrors(e, fields);
        // Same guard as the success path: field errors describe the entity that
        // was sent, so they must not paint onto whatever record replaced it.
        if (keyRef.current === key) setSaveErrors(fieldErrors);
        // Transport/unknown errors carry no GraphQL error array — without a
        // fallback the save would fail entirely silently.
        const general =
          generalErrors.length || Object.keys(fieldErrors).length ? generalErrors : [SAVE_ERR];
        if (general.length) onErrorRef.current?.(general);
      }
    });
  }, [
    value,
    key,
    endpoint,
    headers,
    getHeaders,
    dataOwnerRef,
    fields,
    query,
    mutation,
    onSaved,
  ]);

  return { value, setValue, reset, saving, load, dirty, errors, handleSave };
}
