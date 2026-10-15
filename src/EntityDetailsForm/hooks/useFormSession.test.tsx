import { StrictMode, Suspense, use, useState, type ReactNode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  useFormSession,
  useSessionConnection,
  type FormSession,
  type SectionNav,
  type SessionState,
} from './useFormSession';

const LIVE: SessionState = { sections: ['A', 'B'], dirty: true, saving: false, editable: true };

let latest: FormSession;
let hostRenders = 0;

/** Host: owns the session and hands it to whatever it renders. */
const Host = ({ children }: { children: (s: FormSession) => ReactNode }) => {
  const session = useFormSession();
  latest = session;
  hostRenders++;
  return <>{children(session)}</>;
};

/** Stands in for a generated wrapper's record half. */
const Fake = ({
  session,
  state = LIVE,
  save = () => {},
  cancel = () => {},
  onNav,
}: {
  session: FormSession;
  state?: SessionState;
  save?: () => void;
  cancel?: () => void;
  onNav?: (nav: SectionNav) => void;
}) => {
  const nav = useSessionConnection(session, { ...state, save, cancel });
  onNav?.(nav);
  return null;
};

afterEach(() => {
  hostRenders = 0;
  vi.restoreAllMocks();
});

describe('useFormSession', () => {
  it('is idle with no form connected: no sections, footer disabled, actions inert', () => {
    render(<Host>{() => null}</Host>);
    expect(latest.toc.sections).toEqual([]);
    expect(latest.toc.active).toBeUndefined();
    expect(latest.footer).toMatchObject({ dirty: false, saving: false, disabled: true });
    expect(latest.editable).toBe(false);
    expect(() => latest.footer.onSave()).not.toThrow();
    expect(() => latest.footer.onCancel()).not.toThrow();
  });

  it('publishes a connected form’s state, and follows it when it changes', () => {
    const { rerender } = render(<Host>{s => <Fake session={s} />}</Host>);
    expect(latest.toc.sections).toEqual(['A', 'B']);
    expect(latest.toc.active).toBe('A');
    expect(latest.footer).toMatchObject({ dirty: true, saving: false, disabled: false });
    expect(latest.editable).toBe(true);

    rerender(<Host>{s => <Fake session={s} state={{ ...LIVE, dirty: false, saving: true }} />}</Host>);
    expect(latest.footer).toMatchObject({ dirty: false, saving: true });
  });

  it('onSave / onCancel reach the latest functions, not the ones seen at connect', () => {
    const [save1, save2, cancel1, cancel2] = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const { rerender } = render(<Host>{s => <Fake session={s} save={save1} cancel={cancel1} />}</Host>);
    rerender(<Host>{s => <Fake session={s} save={save2} cancel={cancel2} />}</Host>);

    act(() => latest.footer.onSave());
    // A real save commits its pending flag; the spies don't, so commit here to
    // release the one-action-per-commit latch.
    rerender(<Host>{s => <Fake session={s} save={save2} cancel={cancel2} />}</Host>);
    act(() => latest.footer.onCancel());
    expect(save2).toHaveBeenCalledOnce();
    expect(cancel2).toHaveBeenCalledOnce();
    expect(save1).not.toHaveBeenCalled();
    expect(cancel1).not.toHaveBeenCalled();
  });

  it('does not forward save or cancel while the form is not editable', () => {
    const [save, cancel] = [vi.fn(), vi.fn()];
    const { rerender } = render(
      <Host>{s => <Fake session={s} state={{ ...LIVE, editable: false }} save={save} cancel={cancel} />}</Host>
    );

    act(() => latest.footer.onSave());
    act(() => latest.footer.onCancel());
    expect(save).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();

    rerender(<Host>{s => <Fake session={s} save={save} cancel={cancel} />}</Host>);
    act(() => latest.footer.onSave());
    expect(save).toHaveBeenCalledOnce();
  });

  it('forwards save / cancel only when editable, dirty and not saving', () => {
    const [save, cancel] = [vi.fn(), vi.fn()];
    const fire = () => {
      act(() => latest.footer.onSave());
      act(() => latest.footer.onCancel());
    };
    const { rerender } = render(
      <Host>{s => <Fake session={s} state={{ ...LIVE, dirty: false }} save={save} cancel={cancel} />}</Host>
    );
    fire();
    expect(save).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();

    rerender(<Host>{s => <Fake session={s} state={{ ...LIVE, saving: true }} save={save} cancel={cancel} />}</Host>);
    fire();
    expect(save).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();

    const live = () => <Host>{s => <Fake session={s} save={save} cancel={cancel} />}</Host>;
    rerender(live());
    act(() => latest.footer.onSave());
    rerender(live()); // release the one-action-per-commit latch, as a real save's commit does
    act(() => latest.footer.onCancel());
    expect(save).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('returns to idle when the form unmounts', () => {
    const { rerender } = render(<Host>{s => <Fake session={s} />}</Host>);
    rerender(<Host>{() => null}</Host>);
    expect(latest.toc.sections).toEqual([]);
    expect(latest.footer.disabled).toBe(true);
    expect(latest.editable).toBe(false);
  });

  it('carries the section pair: a TOC pick reaches the form, a form report reaches the TOC', () => {
    let nav: SectionNav = {};
    render(<Host>{s => <Fake session={s} onNav={n => (nav = n)} />}</Host>);
    // Nothing requested yet: the form must not scroll on mount.
    expect(nav.activeSection).toBeUndefined();

    act(() => latest.toc.onSelect('B'));
    expect(nav.activeSection).toBe('B');
    expect(latest.toc.active).toBe('B');

    act(() => nav.onActiveSectionChange!('A'));
    expect(latest.toc.active).toBe('A');
  });

  it('reconnecting (a record switch) clears the section, so the TOC restarts at the top', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let nav: SectionNav = {};
    const { rerender } = render(
      <Host>{s => <Fake key="one" session={s} onNav={n => (nav = n)} />}</Host>
    );
    act(() => latest.toc.onSelect('B'));
    rerender(<Host>{s => <Fake key="two" session={s} onNav={n => (nav = n)} />}</Host>);
    expect(nav.activeSection).toBeUndefined();
    expect(latest.toc.active).toBe('A');
    expect(warn).not.toHaveBeenCalled();
  });

  it('a replacement form never sees the previous form’s section, not even on its first render', () => {
    // useSectionSpy seeds its "already reported" ref from the first-render value,
    // so a stale section there would silence the spy for that section.
    const seen: (string | undefined)[] = [];
    const { rerender } = render(<Host>{s => <Fake key="one" session={s} />}</Host>);
    act(() => latest.toc.onSelect('B'));
    rerender(
      <Host>{s => <Fake key="two" session={s} onNav={n => seen.push(n.activeSection)} />}</Host>
    );
    expect(seen[0]).toBeUndefined();
    expect(seen.at(-1)).toBeUndefined();
  });

  it('forwards at most one action per commit — a repeat Save or a Cancel in the same tick is dropped', () => {
    const save = vi.fn();
    const cancel = vi.fn();
    const { rerender } = render(<Host>{s => <Fake session={s} save={save} cancel={cancel} />}</Host>);
    act(() => {
      latest.footer.onSave();
      latest.footer.onSave();
      latest.footer.onCancel();
    });
    expect(save).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();

    // The next commit releases the latch (a real save commits its pending flag).
    rerender(<Host>{s => <Fake session={s} save={save} cancel={cancel} />}</Host>);
    act(() => latest.footer.onCancel());
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('warns when a second form connects while one is live — the later one wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const later = vi.fn();
    render(
      <Host>
        {s => (
          <>
            <Fake session={s} />
            <Fake session={s} save={later} />
          </>
        )}
      </Host>
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[FormSession]'));
    act(() => latest.footer.onSave());
    expect(later).toHaveBeenCalledOnce();
  });

  it('does not warn under StrictMode’s effect replay (same form reconnecting)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <StrictMode>
        <Host>{s => <Fake session={s} />}</Host>
      </StrictMode>
    );
    expect(warn).not.toHaveBeenCalled();
    expect(latest.footer.disabled).toBe(false);
  });

  it('a save-function change does not re-render the host (typing must stay local)', () => {
    let bump: () => void = () => {};
    /** A form whose save identity changes on every render, as handleSave does per edit. */
    const Typing = ({ session }: { session: FormSession }) => {
      const [n, setN] = useState(0);
      bump = () => setN(x => x + 1);
      useSessionConnection(session, { ...LIVE, save: () => void n, cancel: () => {} });
      return null;
    };
    render(<Host>{s => <Typing session={s} />}</Host>);
    const before = hostRenders;
    act(() => bump());
    act(() => bump());
    expect(hostRenders).toBe(before);
  });

  it('a form with no session neither connects nor wires the section pair', () => {
    let nav: SectionNav = { activeSection: 'x' };
    const Alone = () => {
      nav = useSessionConnection(undefined, { ...LIVE, save: () => {}, cancel: () => {} });
      return null;
    };
    render(<Alone />);
    expect(nav).toEqual({});
  });

  it('goes idle while a connected form is hidden by Suspense, and reconnects when it reveals', async () => {
    const Record = ({ session, promise }: { session: FormSession; promise: Promise<void> }) => {
      use(promise);
      useSessionConnection(session, { ...LIVE, save: () => {}, cancel: () => {} });
      return null;
    };
    const tree = (promise: Promise<void>) => (
      <Host>
        {s => (
          <Suspense fallback={null}>
            <Record session={s} promise={promise} />
          </Suspense>
        )}
      </Host>
    );
    const resolved = () => {
      const p = Promise.resolve();
      return p;
    };
    const first = resolved();
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(tree(first));
      await first;
    });
    await waitFor(() => expect(latest.editable).toBe(true));
    expect(latest.footer.disabled).toBe(false);

    await act(async () => {
      view.rerender(tree(new Promise<void>(() => {})));
    });
    expect(latest.editable).toBe(false);
    expect(latest.footer.disabled).toBe(true);
    expect(latest.toc.sections).toEqual([]);

    const again = resolved();
    await act(async () => {
      view.rerender(tree(again));
      await again;
    });
    await waitFor(() => expect(latest.editable).toBe(true));
  });
});
