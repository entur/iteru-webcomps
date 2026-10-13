import { useEffect, useRef, type RefCallback } from 'react';

/** The band a section must cross to count as "in view": the top 40% of the
 *  viewport. Narrower than the whole viewport so a section only takes over once
 *  it is actually being read, not when its heading peeks in at the bottom. */
const SPY_ROOT_MARGIN = '0px 0px -60% 0px';
/** Released by `scrollend` in practice; the timer covers a request that needs no
 *  scrolling at all (already in place), where that event never fires. */
const SCROLL_SETTLE_MS = 1000;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export interface SectionSpyOptions {
  /** Section labels, in document order. */
  labels: readonly string[];
  /** Off → no observer, no scrolling (the variants that aren't a scroll surface). */
  enabled: boolean;
  /** The section the host wants in view. */
  active?: string;
  /** Reports the section the reader has scrolled to. */
  onActiveChange?: (label: string) => void;
}

/**
 * Two-way link between stacked sections and whatever navigates them (a table of
 * contents, typically). Out: an `IntersectionObserver` reports the first section
 * inside the reading band. In: a changed `active` scrolls that section into view.
 *
 * The two would feed each other — a requested scroll passes every section on the
 * way, and each would be reported back as the new `active` — so the observer is
 * muted until the scroll settles, and an `active` the hook itself reported is
 * never scrolled to.
 *
 * @param options labels, the enabled flag, and the controlled pair
 * @returns `register(label)` — the ref callback for that section's element
 */
export function useSectionSpy({
  labels,
  enabled,
  active,
  onActiveChange,
}: SectionSpyOptions): (label: string) => RefCallback<HTMLElement> {
  const nodes = useRef(new Map<string, HTMLElement>());
  // Seeded with the mount-time `active`, so mounting never scrolls the page: the
  // prop is a request only once it *changes*.
  const reported = useRef(active);
  const muted = useRef(false);
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => { onActiveChangeRef.current = onActiveChange; }, [onActiveChange]);

  const order = labels.join('\n');

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    const ordered = order.split('\n');
    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          const label = (e.target as HTMLElement).dataset.section ?? '';
          if (e.isIntersecting) inBand.add(label);
          else inBand.delete(label);
        });
        if (muted.current) return;
        const next = ordered.find(l => inBand.has(l));
        if (next === undefined || next === reported.current) return;
        reported.current = next;
        onActiveChangeRef.current?.(next);
      },
      { rootMargin: SPY_ROOT_MARGIN }
    );
    ordered.map(l => nodes.current.get(l)).forEach(n => n && observer.observe(n));
    return () => observer.disconnect();
  }, [enabled, order]);

  useEffect(() => {
    if (!enabled || active === undefined || active === reported.current) return;
    const node = nodes.current.get(active);
    if (!node) return;
    reported.current = active;
    muted.current = true;
    const release = () => { muted.current = false; };
    // Capture: `scrollend` does not bubble out of a nested scroll container.
    window.addEventListener('scrollend', release, { capture: true, once: true });
    const timer = setTimeout(release, SCROLL_SETTLE_MS);
    node.scrollIntoView?.({
      behavior: window.matchMedia?.(REDUCED_MOTION).matches ? 'auto' : 'smooth',
      block: 'start',
    });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scrollend', release, { capture: true });
      // Torn down mid-scroll (a second request, or StrictMode's replay): forget
      // the claim, so whatever `active` holds next is honoured rather than
      // mistaken for something already in view.
      if (muted.current) reported.current = undefined;
      release();
    };
  }, [enabled, active]);

  return label => node => {
    if (node) nodes.current.set(label, node);
    else nodes.current.delete(label);
  };
}
