import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SectionToc } from '../SectionToc';
import { FormSkeleton } from '../EntityDetailsForm/components/FormSkeleton';
import { REDUCED_MOTION_QUERY } from './motion';

/** Every CSS rule emotion injected, as text (jsdom has no media matching). */
const injectedCss = () => [...document.querySelectorAll('style')].map(s => s.textContent ?? '').join('\n');

/** The reduced-motion blocks' bodies: what applies under `prefers-reduced-motion`. */
const reducedBlocks = (css: string) =>
  [...css.matchAll(new RegExp(`@media ${REDUCED_MOTION_QUERY.replace(/[()]/g, '\\$&')}\\{([^@]*?)\\}\\}`, 'g'))].map(m => m[1]);

// MUI's wave runs on the skeleton's ::after, and `animation` is not inherited:
// a guard on the root alone leaves the shimmer running.
describe('reduced motion stops the skeleton wave', () => {
  it.each([
    ['SectionToc list', () => <SectionToc sections={['A', 'B']} onSelect={() => {}} loading />],
    ['SectionToc dropdown', () => <SectionToc sections={['A', 'B']} onSelect={() => {}} variant="dropdown" loading />],
    ['FormSkeleton', () => <FormSkeleton fields={{ name: { kind: 'name', path: ['name', 'value'] } }} />],
  ])('%s', (_n, ui) => {
    render(ui());
    const still = reducedBlocks(injectedCss()).filter(b => /animation:none/.test(b));
    expect(still.length).toBeGreaterThan(0); // the guard is found at all
    expect(still.some(b => /\.MuiSkeleton-root::after/.test(b))).toBe(true);
  });
});
