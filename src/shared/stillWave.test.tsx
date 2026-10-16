import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SectionToc } from '../SectionToc';
import { FormSkeleton } from '../EntityDetailsForm/components/FormSkeleton';
import { BusView } from '../stories/BusView';
import { REDUCED_MOTION_QUERY } from './motion';

// jsdom has no WebGL; a loading BusView never reaches the stage anyway.
vi.mock('@entur/iteru-3dbus', () => ({}));

/** Every CSS rule emotion injected, as text (jsdom has no media matching).
 *  Injected styles outlive a test, so a rule only counts for the classes the
 *  rendered tree carries. */
const injectedCss = () => [...document.querySelectorAll('style')].map(s => s.textContent ?? '').join('\n');
const MEDIA = `@media ${REDUCED_MOTION_QUERY}`;

/** The selectors whose wave stops under reduced motion, scoped to `root`'s classes. */
const stilled = (root: HTMLElement): string[] => {
  const mine = new Set([...root.querySelectorAll('*')].flatMap(e => [...e.classList]));
  return injectedCss()
    .split(MEDIA)
    .slice(1)
    .flatMap(b => [...b.matchAll(/([^{}]+)\{[^{}]*\banimation:none[^{}]*\}/g)].map(m => m[1]))
    .filter(sel => mine.has(sel.match(/^\.([\w-]+)/)?.[1] ?? ''));
};

// MUI's wave runs on the skeleton's ::after, and `animation` is not inherited:
// a guard on the root alone leaves the shimmer running.
describe('reduced motion stops the skeleton wave', () => {
  it.each([
    ['SectionToc list', () => <SectionToc sections={['A', 'B']} onSelect={() => {}} loading />],
    ['SectionToc dropdown', () => <SectionToc sections={['A', 'B']} onSelect={() => {}} variant="dropdown" loading />],
    ['FormSkeleton', () => <FormSkeleton fields={{ name: { kind: 'name', path: ['name', 'value'] } }} />],
    [
      'BusView',
      () => <BusView result={null} loading mode="3d" onModeChange={() => {}} motion="orbit" onMotionChange={() => {}} />,
    ],
  ])('%s', (_n, ui) => {
    const { container } = render(ui());
    const still = stilled(container);
    expect(still.length).toBeGreaterThan(0); // this tree's guard is found at all
    expect(still.some(sel => /\.MuiSkeleton-root::after/.test(sel))).toBe(true);
  });
});
