/**
 * The form session: the outlet a host uses to place a data-aware form's chrome.
 *
 * The generated wrappers render the form only. The host creates a session,
 * hands it to the form, and spreads `session.toc` into `SectionToc` and
 * `session.footer` into `EditFooter` wherever its layout wants them. The wrapper
 * fills the session through `useSessionConnection`, keyed by a symbol this
 * package never re-exports, so hosts can read the session but not write to it.
 */
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Key for the wrapper's connection channel. Exported only so the declaration
 *  of `FormSession` can name it (TS4033 otherwise); never re-exported from the
 *  package index, so hosts cannot reach the channel. */
export const LINK = Symbol('FormSession.link');
const WARN_SECOND = '[FormSession] a second form connected while one is live; the later one wins';

/** `SectionToc`'s required props. */
export interface FormSessionToc {
  sections: string[];
  active?: string;
  onSelect: (section: string) => void;
}

/** `EditFooter`'s state props; `labels`, `slotProps` and `sx` stay the host's own. */
export interface FormSessionFooter {
  dirty: boolean;
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/** What a connected form publishes. */
export interface SessionState {
  sections: string[];
  dirty: boolean;
  saving: boolean;
  editable: boolean;
}

/** The connected form's actions. */
export interface SessionActions {
  save: () => void;
  cancel: () => void;
}

/** The section pair `useSessionConnection` hands to the presentation. */
export type SectionNav = {
  activeSection?: string;
  onActiveSectionChange?: (section: string) => void;
};

/** The wrapper's side of a session. Internal — not re-exported from the package. */
export interface Channel {
  connect: (id: string, actions: SessionActions) => void;
  disconnect: (id: string) => void;
  publish: (id: string, state: SessionState) => void;
  /** A form's scroll spy reports the section it is reading. */
  report: (id: string, section: string) => void;
}

/** The section, tagged with the form it belongs to (`null`: none connected). A
 *  form is only ever handed a section tagged with its own id, so a replacement
 *  never sees its predecessor's — not even on its first render. */
interface Selection {
  by: string | null;
  section?: string;
}

export interface FormSession {
  /** Spread into `<SectionToc>`. */
  toc: FormSessionToc;
  /** Spread into `<EditFooter>`. */
  footer: FormSessionFooter;
  /** A form is connected, showing its record, and in edit mode. */
  editable: boolean;
  /** Wrapper-only channel; not part of the host API. */
  readonly [LINK]: { channel: Channel; selection: Selection };
}

const IDLE: SessionState = { sections: [], dirty: false, saving: false, editable: false };

/**
 * Create a session for one data-aware form and the chrome placed around it.
 *
 * @returns the session: `toc` and `footer` to spread, `editable` to gate on
 */
export function useFormSession(): FormSession {
  const [state, setState] = useState<SessionState>(IDLE);
  // One piece of state for both directions, as a host held it before: the TOC
  // requests a section, the form's spy reports one, and the spy ignores its own
  // reports coming back.
  const [selection, setSelection] = useState<Selection>({ by: null });
  const owner = useRef<string | null>(null);
  const actions = useRef<SessionActions | null>(null);

  const channel = useMemo<Channel>(
    () => ({
      connect: (id, next) => {
        if (owner.current !== null && owner.current !== id) console.warn(WARN_SECOND);
        owner.current = id;
        actions.current = next;
        setSelection({ by: id }); // a new record's TOC starts at its first section
      },
      disconnect: id => {
        if (owner.current !== id) return;
        owner.current = null;
        actions.current = null;
        setSelection({ by: null });
        setState(IDLE);
      },
      publish: (id, next) => {
        if (owner.current === id) setState(next);
      },
      report: (id, section) => {
        if (owner.current === id) setSelection({ by: id, section });
      },
    }),
    []
  );

  const onSave = useCallback(() => actions.current?.save(), []);
  const onCancel = useCallback(() => actions.current?.cancel(), []);
  const onSelect = useCallback((s: string) => setSelection({ by: owner.current, section: s }), []);

  const { section } = selection;
  const active = section !== undefined && state.sections.includes(section) ? section : state.sections[0];
  return {
    toc: { sections: state.sections, active, onSelect },
    footer: { dirty: state.dirty, saving: state.saving, disabled: !state.editable, onSave, onCancel },
    editable: state.editable,
    [LINK]: { channel, selection },
  };
}

/**
 * Connect a data-aware form to its host's session (generated wrappers only).
 *
 * Publishes `state` whenever one of its values changes — the sections compared
 * as JSON, so a fresh array of the same labels publishes nothing — and keeps the
 * latest `save` / `cancel` in a ref, so their per-edit identity churn never
 * reaches host state. Disconnects on unmount.
 *
 * @param session the host's session, or `undefined` for a form without one
 * @param state what the form publishes, plus its save / cancel actions
 * @returns the section pair for the presentation; `{}` without a session
 */
export function useSessionConnection(
  session: FormSession | undefined,
  state: SessionState & SessionActions
): SectionNav {
  const link = session?.[LINK];
  const channel = link?.channel;
  const id = useId();

  const latest = useRef<SessionActions & Pick<SessionState, 'editable' | 'dirty' | 'saving'>>(state);
  // Set when an action is forwarded, released by the next commit. `saving` only
  // reaches `latest` on that commit, so without the latch a second Save in the
  // same tick (a double-click, a doubled shortcut) would start a second
  // mutation. A forwarded action always commits: the form is dirty, so it has a
  // value, so `handleSave` starts its transition; `reset` drops the draft.
  const acted = useRef(false);
  useLayoutEffect(() => {
    acted.current = false;
    latest.current = {
      save: state.save,
      cancel: state.cancel,
      editable: state.editable,
      dirty: state.dirty,
      saving: state.saving,
    };
  });

  useLayoutEffect(() => {
    if (!channel) return undefined;
    // Same contract as the footer: inert unless editable and dirty, locked while
    // saving — and one action per commit (see `acted`).
    const forward = (action: 'save' | 'cancel') => () => {
      const { editable, dirty, saving } = latest.current;
      if (!editable || !dirty || saving || acted.current) return;
      acted.current = true;
      latest.current[action]();
    };
    channel.connect(id, { save: forward('save'), cancel: forward('cancel') });
    return () => channel.disconnect(id);
  }, [channel, id]);

  // JSON, not a delimiter: a layout key is any string.
  const sectionsKey = JSON.stringify(state.sections);
  const { dirty, saving, editable } = state;
  useLayoutEffect(() => {
    channel?.publish(id, { sections: JSON.parse(sectionsKey) as string[], dirty, saving, editable });
  }, [channel, id, sectionsKey, dirty, saving, editable]);

  const onActiveSectionChange = useCallback(
    (section: string) => channel?.report(id, section),
    [channel, id]
  );
  return link
    ? { activeSection: link.selection.by === id ? link.selection.section : undefined, onActiveSectionChange }
    : {};
}
