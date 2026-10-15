/**
 * `SobekProvider` — ambient session inputs for every data-aware component in
 * this library.
 *
 * The provider is **mandatory**: `useSobekCtx()` throws when no provider is
 * above. `endpoint` / `headers` / `getHeaders` / `dataOwnerRef` were removed
 * from the generated wrapper props in favour of this single source of truth.
 */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

export interface SobekCtx {
  /** GraphQL endpoint of the sobek instance. */
  endpoint: string;
  /** Static headers sent with every request. */
  headers?: Record<string, string>;
  /** Dynamic headers, resolved per request (wins over `headers`). */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Tenant discriminator, e.g. `NOG:Authority:cP4aPiJ7c39`. Plain string —
   *  the library has no knowledge of the host's Organisation shape. */
  dataOwnerRef: string;
}

const SobekContext = createContext<SobekCtx | undefined>(undefined);

/**
 * Typed provider. `value` is required and non-optional, so a host threading a
 * possibly-undefined session is a compile error rather than a render-time throw
 * from deep inside a consumer. Memoized per field, so an inline object literal
 * no longer re-renders every consumer on each host render.
 *
 * @param props.value Ambient session inputs.
 * @param props.children Subtree that may use data-aware components.
 * @returns The provider element.
 */
export function SobekProvider({
  value,
  children,
}: {
  value: SobekCtx;
  children: ReactNode;
}) {
  const { endpoint, headers, getHeaders, dataOwnerRef } = value;
  const ctx = useMemo(
    () => ({ endpoint, headers, getHeaders, dataOwnerRef }),
    [endpoint, headers, getHeaders, dataOwnerRef]
  );
  return <SobekContext.Provider value={ctx}>{children}</SobekContext.Provider>;
}

export function useSobekCtx(): SobekCtx {
  const ctx = useContext(SobekContext);
  if (ctx === undefined) {
    throw new Error(
      'iteru-webcomps: this component must be rendered inside a <SobekProvider>'
    );
  }
  return ctx;
}
