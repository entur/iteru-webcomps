/**
 * Small hooks the host stories share. Not part of the library.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** An element's border-box size in px. */
export type Size = { w: number; h: number };

/**
 * Live border-box size of the element the returned ref lands on. React 19
 * runs the ref's returned cleanup on detach, so the observer goes with it.
 *
 * @param settleMs commit a new size only once it has held this long (0 = every
 *   change) — for consumers that redo real work per size, like a PNG shot
 * @returns a callback ref and the current size (0 × 0 until measured)
 */
export const useSize = (
  settleMs = 0,
): [(el: HTMLElement | null) => (() => void) | undefined, Size] => {
  const [size, setSize] = useSettledState<Size>({ w: 0, h: 0 }, settleMs);
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return undefined;
      let first = true;
      const ro = new ResizeObserver(([e]) => {
        const { inlineSize: w, blockSize: h } = e.borderBoxSize[0];
        setSize({ w: Math.round(w), h: Math.round(h) }, first); // the first measure is never held back
        first = false;
      });
      ro.observe(el);
      return () => ro.disconnect();
    },
    [setSize],
  );
  return [ref, size];
};

/**
 * State whose updates commit only once they have held still for `ms` — so a
 * burst (keystrokes, a resize drag) costs one render, not one per change.
 *
 * @param initial the value before any update
 * @param ms      how long an update must hold before it commits
 * @returns the committed value, and `set(next, now?)`; `now` commits at once
 */
export const useSettledState = <T,>(
  initial: T,
  ms: number,
): [T, (next: T, now?: boolean) => void] => {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = useCallback(
    (next: T, now = false) => {
      clearTimeout(timer.current);
      if (now || ms <= 0) setValue(next);
      else timer.current = setTimeout(() => setValue(next), ms);
    },
    [ms],
  );
  return [value, set];
};
