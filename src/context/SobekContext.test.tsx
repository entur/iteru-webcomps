/**
 * Tests for `SobekProvider` / `useSobekCtx`.
 *
 * The provider is mandatory — the hook throws a named message when no provider
 * is above, so a host that forgets it fails loudly instead of silently hitting
 * a default endpoint with no data owner.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SobekProvider, useSobekCtx, type SobekCtx } from './SobekContext';

describe('useSobekCtx', () => {
  it('throws a named message when no SobekProvider is above', () => {
    expect(() => renderHook(() => useSobekCtx())).toThrow(
      'iteru-webcomps: this component must be rendered inside a <SobekProvider>'
    );
  });

  it('returns the context value when wrapped in a SobekProvider', () => {
    const value: SobekCtx = {
      endpoint: 'http://sobek.test/graphql',
      dataOwnerRef: 'NOG:Authority:test',
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SobekProvider value={value}>{children}</SobekProvider>
    );
    const { result } = renderHook(() => useSobekCtx(), { wrapper });
    // Not identity: the provider memoizes a fresh object per field, so an inline
    // literal from the host doesn't re-render every consumer.
    expect(result.current).toEqual(value);
  });

  it('keeps the context value stable across re-renders with an inline literal', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SobekProvider
        value={{ endpoint: 'http://sobek.test/graphql', dataOwnerRef: 'NOG:Authority:test' }}
      >
        {children}
      </SobekProvider>
    );
    const { result, rerender } = renderHook(() => useSobekCtx(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
