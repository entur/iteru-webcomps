import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, waitFor, act, type RenderResult } from '@testing-library/react';
import { Suspense, useEffect, type ReactNode } from 'react';
import type { UseEntityFormProps } from './useEntityForm';
import { useEntityForm, useEntityResource } from './useEntityForm';
import type { FieldSpec } from '../types';
import { SobekProvider, type SobekCtx } from '../../context/SobekContext';

const mockFns = vi.hoisted(() => ({
  request: vi.fn(),
  /** Records every `new GraphQLClient(endpoint, config)` — one per request now,
   *  so the headers a request went out with are visible per call. */
  ctor: vi.fn(),
}));

vi.mock('graphql-request', () => ({
  __esModule: true,
  GraphQLClient: vi.fn().mockImplementation(function (this: any, endpoint: string, cfg: unknown) {
    mockFns.ctor(endpoint, cfg);
    this.request = mockFns.request;
  }),
}));

const vehicleDoc = { kind: 'Document' } as any;
const mutationDoc = { kind: 'Document' } as any;

const ENDPOINT = 'http://test';
const OWNER_REF = 'NOG:Authority:test';
const OTHER_REF = 'NOG:Authority:other';
const TRAM = { netexId: 'VEH:1', name: { value: 'Tram' } };
const BUS = { netexId: 'VEH:2', name: { value: 'Bus' } };

const fields: Record<string, FieldSpec> = {
  netexId: { kind: 'text', path: ['netexId'] },
  name: { kind: 'name', path: ['name'] },
  version: { kind: 'text', path: ['version'], serverManaged: true },
  dataOwnerRef: { kind: 'text', path: ['dataOwnerRef'], locked: true },
};

/**
 * Stand-in for the generated `<Entity>InputKeys` mask. Mirrors `fields` minus
 * the server-managed `version`, which the live Input type would not carry.
 */
const wireKeys = { netexId: 1, name: 1, dataOwnerRef: 1 };

/** Wraps an entity in the query's `vehicles.content[0]` result envelope. */
const envelope = (entity: unknown) => ({ vehicles: { content: [entity] } });

/** Headers the client was constructed with for the nth request (1-based). */
const headersOfCall = (n: number) =>
  (mockFns.ctor.mock.calls[n - 1]?.[1] as { headers: Record<string, string> })?.headers;

/**
 * The ambient session inputs the hooks read. Tests mutate this between renders
 * (then re-render) to simulate the host re-rendering the provider.
 */
let ctx: SobekCtx;

/** What a test passes: the hook's props minus the resource, plus the id. */
type TestProps = Omit<UseEntityFormProps, 'resource'> & { netexId?: string };

/** The last committed hook return — `null` while the form is suspended. */
type Api = ReturnType<typeof useEntityForm>;
const api: { current: Api } = { current: null as unknown as Api };

/** Captures the hook return on commit only, as RTL's own `renderHook` does. */
const Probe = ({ hookProps }: { hookProps: UseEntityFormProps }) => {
  const r = useEntityForm(hookProps);
  useEffect(() => { api.current = r; });
  return null;
};

/**
 * The shape the generated wrapper has: the resource is started *above* the
 * boundary and the form reads it inside. Testing the two hooks apart from that
 * arrangement would test something no consumer can build.
 */
const Harness = ({ p }: { p: TestProps }) => {
  const { netexId, ...config } = p;
  const resource = useEntityResource<any>(config, netexId);
  return (
    <Suspense fallback={null}>
      <Probe hookProps={{ ...config, resource }} />
    </Suspense>
  );
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <SobekProvider value={ctx}>{children}</SobekProvider>
);

/**
 * Builds hook props with the standard Vehicle query/mutation config.
 *
 * Every call mints fresh object literals — matching a host that passes inline
 * props each render, which the hooks must tolerate without re-loading.
 *
 * @param {Partial<TestProps>} over - per-test overrides (netexId, callbacks…).
 * @returns {TestProps} props ready for the harness.
 */
const mkProps = (over: Partial<TestProps> = {}): TestProps => ({
  fields,
  query: {
    document: vehicleDoc,
    variables: (id: string, dataOwnerRef: string) => ({
      filter: { netexIds: [id], dataOwnerRef },
    }),
    resultPath: ['vehicles', 'content', 0] as const,
  },
  mutation: {
    document: mutationDoc,
    resultPath: ['createOrUpdateVehicle'] as const,
    inputKeys: wireKeys,
  },
  ...over,
});

/**
 * Mount the form inside an **awaited** `act`.
 *
 * A render that suspends parks its retry on the act queue, and a synchronous
 * `act` — which is what RTL's bare `render` uses — has already exited by then,
 * so the tree never resumes. Awaiting the scope that contains the suspending
 * render is the supported pattern, which is why every mount and every record
 * switch below goes through one of these two helpers.
 */
const mount = async (props: TestProps) => {
  let utils!: RenderResult;
  await act(async () => { utils = render(<Harness p={props} />, { wrapper }); });
  return {
    result: api,
    rerender: (next: TestProps) => utils.rerender(<Harness p={next} />),
  };
};

/** Re-render with new props, awaiting the suspension a record switch causes. */
const swap = async (
  rerender: (p: TestProps) => void,
  props: TestProps,
): Promise<void> => {
  await act(async () => { rerender(props); });
};

/** Let a pending microtask chain (a settled load, a save's two hops) drain. */
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

/**
 * Press Save and let the action run to completion.
 *
 * The save is a React 19 Action, so `saving` is the transition's pending flag —
 * released when the async body settles, which is a queued update like any
 * other and needs an awaited `act` to reach the test.
 */
const save = async (): Promise<void> => {
  await act(async () => {
    api.current.handleSave();
    await new Promise(r => setTimeout(r, 0));
  });
};

describe('useEntityForm', () => {
  beforeEach(() => {
    mockFns.request.mockReset();
    mockFns.ctor.mockReset();
    api.current = null as unknown as Api;
    ctx = { endpoint: ENDPOINT, dataOwnerRef: OWNER_REF };
  });

  it('throws when no SobekProvider is above', () => {
    // The resource hook is the first to touch the session, so it is the one
    // that throws — before a request can be built with an undefined endpoint.
    expect(() =>
      renderHook(() => useEntityResource(mkProps(), 'VEH:1'))
    ).toThrow('iteru-webcomps: this component must be rendered inside a <SobekProvider>');
  });

  it('loads an entity on mount when netexId is provided', async () => {
    mockFns.request.mockResolvedValueOnce(envelope(TRAM));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));

    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current.value).toEqual(TRAM);
    expect(result.current.load).toBe('ok');
    expect(result.current.errors).toEqual({});
    expect(mockFns.request).toHaveBeenCalledWith(vehicleDoc, {
      filter: { netexIds: ['VEH:1'], dataOwnerRef: OWNER_REF },
    });
  });

  it('does not commit at all while the record is in flight', async () => {
    // The structural replacement for the old `loading === true`, and the reason
    // a not-found branch can no longer flash: there is no first commit to flash
    // on. The boundary holds its fallback, and the hook has not returned.
    mockFns.request.mockReturnValueOnce(new Promise(() => {}));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));

    expect(result.current).toBeNull();
  });

  it('keeps the loaded value when netexId is removed (create mode preserves edits)', async () => {
    mockFns.request.mockResolvedValueOnce(envelope(TRAM));

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    await waitFor(() => expect(result.current?.value).toEqual(TRAM));

    await swap(rerender, mkProps());

    // Removing netexId no longer wipes state: there is no key, so no request and
    // nothing to suspend on, and the entity the server last handed back is still
    // what the form holds.
    expect(result.current.value).toEqual(TRAM);
    expect(result.current.load).toBe('idle');
  });

  it('invalidates an in-flight load when switching to create mode', async () => {
    let resolveLoad: (data: unknown) => void = () => {};
    mockFns.request.mockImplementationOnce(
      () => new Promise(resolve => {
        resolveLoad = resolve;
      })
    );

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    expect(result.current).toBeNull();

    // Host drops netexId (edit -> create) while the load is still in flight.
    await swap(rerender, mkProps());
    expect(result.current.value).toBeUndefined();

    // The late response belongs to the abandoned edit form. Nothing reads its
    // promise any more, so it repopulates nothing — no epoch check involved.
    act(() => resolveLoad(envelope(TRAM)));
    await settle();

    expect(result.current.value).toBeUndefined();
    expect(result.current.load).toBe('idle');
  });

  it('does not load when netexId is omitted', async () => {
    const { result } = await mount(mkProps());

    expect(result.current.value).toBeUndefined();
    expect(result.current.load).toBe('idle');
    expect(mockFns.request).not.toHaveBeenCalled();
  });

  it('surfaces the server message on load failure, to state and to onError', async () => {
    const onError = vi.fn();
    mockFns.request.mockRejectedValueOnce({
      response: {
        errors: [
          { message: 'Not found', path: ['vehicles'] },
        ],
      },
    });

    const { result } = await mount(mkProps({ netexId: 'VEH:99', onError }));

    await waitFor(() => expect(result.current).not.toBeNull());
    // A failed load is a settled *value*, not a rejected promise: rethrowing it
    // out of `use()` would hit an error boundary and unmount the form.
    expect(result.current.load).toBe('error');
    // The load half mirrors the save half: the server's own words reach the
    // host, not a constant that flattens 401/403/404/socket-drop into one string.
    expect(result.current.errors).toEqual({ __init: 'Not found' });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(['Not found']));
    expect(result.current.value).toBeUndefined();
  });

  it('falls back to a constant when a load failure carries no GraphQL errors', async () => {
    const onError = vi.fn();
    mockFns.request.mockRejectedValueOnce(new Error('boom'));

    const { result } = await mount(mkProps({ netexId: 'VEH:99', onError }));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.errors).toEqual({ __init: 'Failed to load' });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(['Failed to load']));
  });

  it('joins multiple load errors for display but hands onError the array', async () => {
    const onError = vi.fn();
    mockFns.request.mockRejectedValueOnce({
      response: {
        errors: [{ message: 'Unauthorized' }, { message: 'Token expired' }],
      },
    });

    const { result } = await mount(mkProps({ netexId: 'VEH:99', onError }));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.errors).toEqual({ __init: 'Unauthorized; Token expired' });
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(['Unauthorized', 'Token expired'])
    );
  });

  it('reports a failed load to onError exactly once', async () => {
    const onError = vi.fn();
    mockFns.request.mockRejectedValueOnce(new Error('boom'));

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:99', onError }));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    // Re-rendering re-reads the same settled result; the host must not hear
    // about the same failure again on every render of the form.
    await swap(rerender, mkProps({ netexId: 'VEH:99', onError }));
    act(() => result.current.setValue({ netexId: 'VEH:99' } as any));
    await settle();

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not call onError for a load retired before it failed', async () => {
    const onError = vi.fn();
    let rejectLoad: (e: unknown) => void = () => {};
    mockFns.request.mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        rejectLoad = reject;
      })
    );

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1', onError }));

    expect(result.current).toBeNull();

    // Host drops netexId (edit -> create) while the load is still in flight.
    await swap(rerender, mkProps({ onError }));

    // The failure belongs to the abandoned edit form. Its result is never read,
    // so there is no callback to suppress and no guard to get wrong.
    act(() => rejectLoad(new Error('boom')));
    await settle();

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({});
  });

  it('waits for async getHeaders, then merges dynamic over static headers', async () => {
    let resolveHeaders: (h: Record<string, string>) => void = () => {};
    ctx = {
      ...ctx,
      // `Authorization` here must lose to the dynamic value below.
      headers: { 'Client-Name': 'hathor', Authorization: 'static-fallback' },
      getHeaders: () =>
        new Promise<Record<string, string>>(resolve => {
          resolveHeaders = resolve;
        }),
    };

    mockFns.request.mockResolvedValueOnce(envelope(TRAM));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));

    // Nothing has been requested while the dynamic headers are pending, and the
    // form has not committed either.
    expect(result.current).toBeNull();
    expect(mockFns.request).not.toHaveBeenCalled();

    act(() => resolveHeaders({ Authorization: 'Bearer token' }));

    await waitFor(() => expect(mockFns.request).toHaveBeenCalled());
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current.value).toEqual(TRAM);
    // Headers go to the constructor of a client built for this request — there
    // is no long-lived client to mutate, so a token refresh mid-flight cannot
    // re-header a request that is already out.
    expect(mockFns.ctor).toHaveBeenLastCalledWith(ENDPOINT, {
      headers: { 'Client-Name': 'hathor', Authorization: 'Bearer token' },
    });
    expect(mockFns.request).toHaveBeenCalledWith(vehicleDoc, {
      filter: { netexIds: ['VEH:1'], dataOwnerRef: OWNER_REF },
    });
  });

  it('gives each request its own client, so a refreshed token cannot re-header an older one', async () => {
    let token = 0;
    ctx = { ...ctx, getHeaders: () => ({ Authorization: `Bearer ${++token}` }) };

    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockResolvedValueOnce({ createOrUpdateVehicle: 'VEH:1' })
      .mockResolvedValueOnce(envelope(TRAM));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.setValue({ ...TRAM, name: { value: 'Edited' } } as any));
    await save();
    expect(result.current.saving).toBe(false);

    // Two clients, two header sets. The old shared-client `setHeaders` could
    // only ever hold the last one.
    expect(mockFns.ctor).toHaveBeenCalledTimes(2);
    expect(headersOfCall(1)).toEqual({ Authorization: 'Bearer 1' });
    expect(headersOfCall(2)).toEqual({ Authorization: 'Bearer 2' });
  });

  it('ignores headers/getHeaders identity churn (no reload, edits preserved)', async () => {
    mockFns.request.mockResolvedValue(envelope(TRAM));

    // Fresh inline literals every render — exactly what the README recommends.
    const churnCtx = () => {
      ctx = {
        endpoint: ENDPOINT,
        dataOwnerRef: OWNER_REF,
        headers: { 'Client-Name': 'hathor' },
        getHeaders: () => ({ Authorization: 'Bearer token' }),
      };
    };
    churnCtx();

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    await waitFor(() => expect(result.current?.value).toEqual(TRAM));
    expect(mockFns.request).toHaveBeenCalledTimes(1);

    act(() => result.current.setValue({ netexId: 'VEH:1', name: { value: 'Edited' } } as any));

    churnCtx();
    await swap(rerender, mkProps({ netexId: 'VEH:1' }));
    churnCtx();
    await swap(rerender, mkProps({ netexId: 'VEH:1' }));
    await settle();

    // Neither headers nor getHeaders is part of the key, so no identity churn
    // can reach the load. They are read fresh on the next request instead.
    expect(mockFns.request).toHaveBeenCalledTimes(1);
    expect(result.current.value).toEqual({ netexId: 'VEH:1', name: { value: 'Edited' } });
  });

  it('re-fires the load when dataOwnerRef changes (org switch)', async () => {
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockResolvedValueOnce(envelope(BUS));

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    await waitFor(() => expect(result.current?.value).toEqual(TRAM));
    expect(mockFns.request).toHaveBeenCalledTimes(1);

    // Host switches organisation — same endpoint, new dataOwnerRef.
    ctx = { endpoint: ENDPOINT, dataOwnerRef: OTHER_REF };
    await swap(rerender, mkProps({ netexId: 'VEH:1' }));

    await waitFor(() => expect(mockFns.request).toHaveBeenCalledTimes(2));
    expect(mockFns.request).toHaveBeenNthCalledWith(2, vehicleDoc, {
      filter: { netexIds: ['VEH:1'], dataOwnerRef: OTHER_REF },
    });
    await waitFor(() => expect(result.current.value).toEqual(BUS));
  });

  it('ignores a stale response when netexId changes', async () => {
    let resolveA: (data: unknown) => void = () => {};

    mockFns.request
      .mockImplementationOnce(
        () => new Promise(resolve => {
          resolveA = resolve;
        })
      )
      .mockResolvedValueOnce(envelope(BUS));

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    expect(result.current).toBeNull();

    await swap(rerender, mkProps({ netexId: 'VEH:2' }));

    // Resolve the newer request first.
    await waitFor(() => expect(result.current?.value).toEqual(BUS));

    // Now resolve the stale request for VEH:1.
    act(() => resolveA(envelope(TRAM)));
    await settle();

    // The stale response belongs to a key the form no longer reads.
    expect(result.current.value).toEqual(BUS);
    expect(result.current.errors).toEqual({});
  });

  it('does not read another tenant’s record when the org switches mid-load', async () => {
    let resolveA: (data: unknown) => void = () => {};

    mockFns.request
      .mockImplementationOnce(
        () => new Promise(resolve => {
          resolveA = resolve;
        })
      )
      .mockResolvedValueOnce(envelope(BUS));

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));
    expect(result.current).toBeNull();

    ctx = { endpoint: ENDPOINT, dataOwnerRef: OTHER_REF };
    await swap(rerender, mkProps({ netexId: 'VEH:1' }));

    await waitFor(() => expect(result.current?.value).toEqual(BUS));

    // Same netexId, different tenant — the key carries dataOwnerRef, so the
    // first org's row cannot land in the second org's form.
    act(() => resolveA(envelope(TRAM)));
    await settle();

    expect(result.current.value).toEqual(BUS);
  });

  it('discards an in-progress edit when the record changes', async () => {
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockResolvedValueOnce(envelope(BUS));

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current?.value).toEqual(TRAM));

    act(() => result.current.setValue({ ...TRAM, name: { value: 'Edited' } } as any));
    await swap(rerender, mkProps({ netexId: 'VEH:2' }));

    // A draft belongs to the record it was typed into. Carrying it across would
    // mask the new record with the previous one's edits.
    await waitFor(() => expect(result.current.value).toEqual(BUS));
    expect(result.current.dirty).toBe(false);
  });

  it('releases saving when the record switches mid-save', async () => {
    const savedTram = { netexId: 'VEH:1', name: { value: 'Tram Saved' } };
    let resolveMutation: (data: unknown) => void = () => {};

    // Routed rather than queued: React holds a suspended update while an Action
    // is pending, so the order the two requests go out in is React's to choose.
    mockFns.request.mockImplementation((doc: unknown, vars: any) => {
      if (doc === mutationDoc) return new Promise(resolve => { resolveMutation = resolve; });
      return Promise.resolve(
        vars.filter.netexIds[0] === 'VEH:2' ? envelope(BUS) : envelope(savedTram)
      );
    });

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    act(() => result.current.setValue({ netexId: 'VEH:1', name: { value: 'Edited' } } as any));
    act(() => { result.current.handleSave(); });
    expect(result.current.saving).toBe(true);

    // A netexId change lands while the mutation is still out.
    await swap(rerender, mkProps({ netexId: 'VEH:2' }));

    act(() => resolveMutation({ createOrUpdateVehicle: 'VEH:1' }));
    await settle();

    // The transition owns the flag, so it is released when the action settles —
    // there is no branch left that could strand it.
    expect(result.current.saving).toBe(false);
    // …and the save's refetch is tagged with the key it started under, so it
    // cannot overwrite the record the form moved to.
    await waitFor(() => expect(result.current.value).toEqual(BUS));
  });

  it('does not let a save landing after a switch into create mode clobber the draft', async () => {
    // The one record switch that does *not* suspend: create mode has no key, so
    // it commits immediately instead of being deferred behind the pending
    // Action. Everything the save's completion writes has to be guarded on the
    // key still being the one on screen, not just the `saved` tag.
    const savedTram = { netexId: 'VEH:1', name: { value: 'Tram Saved' } };
    const fresh = { name: { value: 'Brand New' } };
    let resolveMutation: (data: unknown) => void = () => {};

    mockFns.request.mockImplementation((doc: unknown) => {
      if (doc === mutationDoc) return new Promise(resolve => { resolveMutation = resolve; });
      return Promise.resolve(envelope(savedTram));
    });

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    act(() => result.current.setValue({ netexId: 'VEH:1', name: { value: 'Edited' } } as any));
    act(() => { result.current.handleSave(); });

    // Host drops netexId while the mutation is out, and the user starts a new
    // entity in the create form that appears.
    await swap(rerender, mkProps());
    act(() => result.current.setValue(fresh as any));

    act(() => resolveMutation({ createOrUpdateVehicle: 'VEH:1' }));
    await settle();

    expect(result.current.value).toEqual(fresh);
    expect(result.current.dirty).toBe(true);
  });

  it('does not resurrect a post-save baseline when the record is revisited', async () => {
    // `saved` outliving its record would win over the refetch on the way back:
    // the form would display — and diff against — what this session saved
    // rather than what the server now holds.
    const savedTram = { netexId: 'VEH:1', name: { value: 'Tram Saved' } };
    const elsewhere = { netexId: 'VEH:1', name: { value: 'Tram Changed Elsewhere' } };

    let tramLoads = 0;
    mockFns.request.mockImplementation((doc: unknown, vars: any) => {
      if (doc === mutationDoc) return Promise.resolve({ createOrUpdateVehicle: 'VEH:1' });
      if (vars.filter.netexIds[0] === 'VEH:2') return Promise.resolve(envelope(BUS));
      tramLoads += 1;
      return Promise.resolve(envelope(tramLoads === 1 ? TRAM : tramLoads === 2 ? savedTram : elsewhere));
    });

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));

    act(() => result.current.setValue({ netexId: 'VEH:1', name: { value: 'Edited' } } as any));
    await save();
    expect(result.current.value).toEqual(savedTram);

    await swap(rerender, mkProps({ netexId: 'VEH:2' }));
    await waitFor(() => expect(result.current.value).toEqual(BUS));

    await swap(rerender, mkProps({ netexId: 'VEH:1' }));

    await waitFor(() => expect(result.current.value).toEqual(elsewhere));
    expect(result.current.dirty).toBe(false);
  });

  it('surfaces a fallback error when a save fails with no GraphQL errors', async () => {
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      // Transport failure: a bare Error, no `response.errors` to normalize.
      .mockRejectedValueOnce(new Error('Failed to fetch'));

    const onError = vi.fn();

    const { result } = await mount(mkProps({ netexId: 'VEH:1', onError }));

    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.setValue({ ...TRAM, name: { value: 'Edited' } } as any));
    await save();
    expect(result.current.saving).toBe(false);

    expect(onError).toHaveBeenCalledWith(['Failed to save']);
  });

  it('saves, returns the id, and refetches (stamping dataOwnerRef from context)', async () => {
    const updated = { netexId: 'VEH:1', name: { value: 'Tram Updated' } };

    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockResolvedValueOnce({ createOrUpdateVehicle: 'VEH:1' })
      .mockResolvedValueOnce(envelope(updated));

    const onSaved = vi.fn();
    const onError = vi.fn();

    const { result } = await mount(mkProps({ netexId: 'VEH:1', onSaved, onError }));

    await waitFor(() => expect(result.current).not.toBeNull());

    // Simulate an edit — including a garbage dataOwnerRef, which must not leak
    // into the payload: the wire value is stamped from context at the edge.
    act(() => result.current.setValue({ ...updated, dataOwnerRef: 'GARBAGE' } as any));
    expect((result.current.value as any)?.name?.value).toBe('Tram Updated');

    await save();
    expect(result.current.saving).toBe(false);

    expect(mockFns.request).toHaveBeenNthCalledWith(2, mutationDoc, {
      input: { ...updated, dataOwnerRef: OWNER_REF },
    });
    // Post-save refetch filters on the context dataOwnerRef too — otherwise
    // the reload returns zero rows and blanks the form after a successful save.
    expect(mockFns.request).toHaveBeenNthCalledWith(3, vehicleDoc, {
      filter: { netexIds: ['VEH:1'], dataOwnerRef: OWNER_REF },
    });
    expect(result.current.value).toEqual(updated);
    expect(onSaved).toHaveBeenCalledWith('VEH:1');
    expect(onError).not.toHaveBeenCalled();
  });

  it('adopts the created entity as the baseline when saving in create mode', async () => {
    const created = { netexId: 'VEH:9', name: { value: 'New Tram' } };
    mockFns.request
      .mockResolvedValueOnce({ createOrUpdateVehicle: 'VEH:9' })
      .mockResolvedValueOnce(envelope(created));

    const onSaved = vi.fn();
    const { result } = await mount(mkProps({ onSaved }));

    act(() => result.current.setValue({ name: { value: 'New Tram' } } as any));
    expect(result.current.dirty).toBe(true);

    await save();
    expect(result.current.saving).toBe(false);

    // Create mode has no record key, so the save records its result under that
    // same absence — the created entity becomes the baseline with no reload.
    expect(result.current.value).toEqual(created);
    expect(result.current.dirty).toBe(false);
    expect(onSaved).toHaveBeenCalledWith('VEH:9');
  });

  it('reports the loaded entity to onChange, before any edit', async () => {
    mockFns.request.mockResolvedValueOnce(envelope(TRAM));
    const onChange = vi.fn();

    const { result } = await mount(mkProps({ netexId: 'VEH:1', onChange }));
    await waitFor(() => expect(result.current).not.toBeNull());

    // A host header must be able to show the loaded name without waiting for a
    // keystroke, so this fires on the load, not only on user edits.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(TRAM));
  });

  it('reports each edit to onChange', async () => {
    mockFns.request.mockResolvedValueOnce(envelope(TRAM));
    const onChange = vi.fn();

    const { result } = await mount(mkProps({ netexId: 'VEH:1', onChange }));
    await waitFor(() => expect(result.current).not.toBeNull());

    const edited = { ...TRAM, name: { value: 'Tram Two' } };
    act(() => result.current.setValue(edited as any));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(edited));
  });

  it('flags dirty on an edit and clean again when it is reverted', async () => {
    mockFns.request.mockResolvedValueOnce(envelope(TRAM));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.dirty).toBe(false);

    act(() => result.current.setValue({ ...TRAM, name: { value: 'Edited' } } as any));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    act(() => result.current.setValue(TRAM as any));
    await waitFor(() => expect(result.current.dirty).toBe(false));
  });

  it('re-baselines on a successful save, so a saved form is clean', async () => {
    const updated = { netexId: 'VEH:1', name: { value: 'Tram Updated' } };
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockResolvedValueOnce({ createOrUpdateVehicle: 'VEH:1' })
      .mockResolvedValueOnce(envelope(updated));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.setValue(updated as any));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    await save();
    expect(result.current.saving).toBe(false);

    expect(result.current.dirty).toBe(false);
    // No second load: the save's own refetch is the new baseline.
    expect(mockFns.request).toHaveBeenCalledTimes(3);
  });

  it('reset discards edits back to the loaded entity', async () => {
    mockFns.request.mockResolvedValueOnce(envelope(TRAM));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.setValue({ ...TRAM, name: { value: 'Edited' } } as any));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    act(() => result.current.reset());

    // In-place discard: no remount, so the host keeps its scroll position and
    // the form does not re-fetch what it already has.
    expect(result.current.value).toEqual(TRAM);
    expect(result.current.dirty).toBe(false);
    expect(mockFns.request).toHaveBeenCalledTimes(1);
  });

  it('takes no onDirtyChange — dirty is read from the hook (and the session)', () => {
    // @ts-expect-error the option is gone; hosts read `dirty` via useFormSession
    const gone: Pick<UseEntityFormProps, 'onDirtyChange'> = {};
    expect(gone).toEqual({});
  });

  it('reset reverts to the post-save baseline, not the originally loaded entity', async () => {
    const saved = { netexId: 'VEH:1', name: { value: 'Tram Updated' } };
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockResolvedValueOnce({ createOrUpdateVehicle: 'VEH:1' })
      .mockResolvedValueOnce(envelope(saved));

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.setValue(saved as any));
    await save();
    expect(result.current.saving).toBe(false);

    act(() => result.current.setValue({ ...saved, name: { value: 'Third' } } as any));
    act(() => result.current.reset());

    // Cancel means "back to what the server holds", which a save moved forward.
    expect(result.current.value).toEqual(saved);
    expect(result.current.dirty).toBe(false);
  });

  it('reset clears the errors a rejected save left behind', async () => {
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockRejectedValueOnce({
        response: {
          errors: [{ message: 'too long', path: ['input', 'name'] }],
        },
      });

    const { result } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current).not.toBeNull());

    act(() => result.current.setValue({ ...TRAM, name: { value: 'Edited' } } as any));
    await save();
    expect(result.current.errors).not.toEqual({});

    act(() => result.current.reset());

    // The messages describe values that no longer exist — leaving them inline
    // marks the restored entity as invalid.
    expect(result.current.errors).toEqual({});
  });

  it('reset keeps a load error, which outlives the edits it did not come from', async () => {
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockRejectedValueOnce(new Error('boom'));

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1' }));
    await waitFor(() => expect(result.current?.value).toEqual(TRAM));

    // A *re*load — switching netexId, or an org switch — fails without clearing
    // the entity already on screen, so `__init` and a value do coexist.
    await swap(rerender, mkProps({ netexId: 'VEH:2' }));
    await waitFor(() => expect(result.current.load).toBe('error'));
    expect(result.current.value).toEqual(TRAM);

    act(() => result.current.reset());

    // `__init` is derived from the load, not from the edit session, so a discard
    // cannot drop it: `load` stays 'error' and consumers keep a message to show.
    expect(result.current.load).toBe('error');
    expect(result.current.errors.__init).toBe('Failed to load');
  });

  it('reports undefined to onChange when a load settles with no rows', async () => {
    // Why `onChange` is typed `E | undefined`: switching a mounted form to an id
    // that has no record leaves the host showing the previous record's values
    // unless it hears about the miss.
    const onChange = vi.fn();
    mockFns.request
      .mockResolvedValueOnce(envelope(TRAM))
      .mockResolvedValueOnce({ vehicles: { content: [] } });

    const { result, rerender } = await mount(mkProps({ netexId: 'VEH:1', onChange }));
    await waitFor(() => expect(result.current?.value).toBeDefined());

    await swap(rerender, mkProps({ netexId: 'VEH:2', onChange }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(undefined));
    expect(result.current.load).toBe('ok');
  });

});
