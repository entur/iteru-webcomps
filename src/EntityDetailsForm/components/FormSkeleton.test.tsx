/**
 * The skeleton's whole claim is that its shape is *derived*, never hand-tuned:
 * the same `FIELDS` + `layout` that draw the real form draw the placeholders,
 * so a new entity or an edited layout reshapes both at once. These pin that
 * derivation — row counts come from the registry, never from a literal.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormSkeleton, FormArrival } from './FormSkeleton';
import { PATCH_MARK_COL_PX } from '../utils/sections';
import type { FieldSpec, Layout } from '../types';

const FIELDS: Record<string, FieldSpec> = {
  name: { kind: 'name', path: ['name', 'value'] },
  count: { kind: 'number', path: ['count'] },
  active: { kind: 'switch', path: ['active'] },
  vehicles: { kind: 'grid', path: ['vehicles'], serverManaged: true },
};

const TWO_SECTIONS: Layout = { General: ['name', 'count'], Fleet: ['vehicles'] };

const rows = (c: HTMLElement) => c.querySelectorAll('[data-nmr-skeleton="field"]');
const tabs = (c: HTMLElement) => c.querySelectorAll('[data-nmr-skeleton="tab"]');
const px = (el: Element) => parseFloat(getComputedStyle(el).height);

describe('FormSkeleton', () => {
  it('draws one placeholder per registry field when there is no layout', () => {
    const { container } = render(<FormSkeleton fields={FIELDS} />);

    // Derived from the registry — adding a field to FIELDS adds a row here,
    // with no count to keep in sync.
    expect(rows(container)).toHaveLength(Object.keys(FIELDS).length);
  });

  it('follows the layout whitelist, so an omitted field gets no placeholder', () => {
    const { container } = render(<FormSkeleton fields={FIELDS} layout={{ General: ['name'] }} />);

    expect(rows(container)).toHaveLength(1);
  });

  it("narrows only a marked field's placeholder, as the form narrows its control", () => {
    const patchedFields = { ...FIELDS, count: { ...FIELDS.count, patched: true } };
    const { container } = render(<FormSkeleton fields={patchedFields} />);
    const gap = (key: string) =>
      getComputedStyle(
        [...rows(container)][Object.keys(FIELDS).indexOf(key)]
      ).marginRight;

    expect(gap('count')).toBe(`${PATCH_MARK_COL_PX}px`);
    expect(gap('name')).toBe('0px');
  });

  it("drops a patched field's placeholder when the form hides it", () => {
    const patchedFields = { ...FIELDS, count: { ...FIELDS.count, patched: true } };
    const { container } = render(<FormSkeleton fields={patchedFields} patched="hide" />);

    expect(rows(container)).toHaveLength(Object.keys(FIELDS).length - 1);
  });

  it('stands in for the tab bar, showing only the active section’s rows', () => {
    const { container } = render(<FormSkeleton fields={FIELDS} layout={TWO_SECTIONS} />);

    // One tab per section, and — like the form — a single panel's worth of rows.
    expect(tabs(container)).toHaveLength(2);
    expect(rows(container)).toHaveLength(2);
  });

  it('draws every section at once when stacked, with no tab bar', () => {
    const { container } = render(
      <FormSkeleton fields={FIELDS} layout={TWO_SECTIONS} variant="stacked" />
    );

    expect(tabs(container)).toHaveLength(0);
    expect(rows(container)).toHaveLength(3);
  });

  it('shapes each placeholder by kind, so a grid stands taller than a text row', () => {
    // Uniform bars would jump the layout when the real controls land — the
    // point of shaping is that they do not.
    const { container } = render(<FormSkeleton fields={FIELDS} layout={{ All: ['name', 'vehicles'] }} />);
    const [text, grid] = Array.from(rows(container));

    expect(px(grid)).toBeGreaterThan(px(text));
  });

  it('announces itself as busy, in English by default', () => {
    render(<FormSkeleton fields={FIELDS} />);

    const status = screen.getByRole('status', { name: 'Loading form' });
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('takes a localized label — the library ships no i18n runtime', () => {
    render(<FormSkeleton fields={FIELDS} ariaLabel="Laster skjema" />);

    expect(screen.getByRole('status', { name: 'Laster skjema' })).toBeInTheDocument();
  });

  it('lets a host restyle the block — its sx wins over the defaults', () => {
    const { container } = render(<FormSkeleton fields={FIELDS} sx={{ padding: '7px' }} />);

    expect(getComputedStyle(container.firstElementChild as HTMLElement).padding).toBe('7px');
  });
});

describe('FormArrival', () => {
  it('renders what it wraps', () => {
    render(
      <FormArrival>
        <p>Loaded</p>
      </FormArrival>
    );

    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });

  it('fades the arriving form in, but stands down under reduced motion', () => {
    const { container } = render(
      <FormArrival>
        <p>Loaded</p>
      </FormArrival>
    );

    // jsdom resolves the `animation` shorthand but does not expand it into
    // longhands, so `animationName` reads empty here — assert the shorthand.
    expect(getComputedStyle(container.firstElementChild as HTMLElement).animation).toMatch(
      /nmrFormArrive/
    );
    // The guard has to reach the stylesheet, not just the component: a fade is
    // exactly the motion `prefers-reduced-motion` exists to suppress.
    const css = Array.from(document.querySelectorAll('style'))
      .map(s => s.textContent ?? '')
      .join('');
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});
