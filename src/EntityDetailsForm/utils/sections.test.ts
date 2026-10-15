import { describe, it, expect } from 'vitest';
import { resolveSections, tocSections } from './sections';
import type { FieldSpec } from '../types';

const FIELDS: Record<string, FieldSpec> = {
  name: { kind: 'name', path: ['name', 'value'] },
  range: { kind: 'number', path: ['range'], patched: true },
  count: { kind: 'number', path: ['count'] },
};

const keys = (sections: ReturnType<typeof resolveSections>) =>
  sections.map(s => [s.label, s.fields.map(f => f.key)]);

describe('resolveSections — patched display', () => {
  it('keeps patched fields unless told to hide them', () => {
    expect(keys(resolveSections(FIELDS))).toEqual([['', ['name', 'range', 'count']]]);
    expect(keys(resolveSections(FIELDS, undefined, 'plain'))).toEqual([
      ['', ['name', 'range', 'count']],
    ]);
  });

  it("'hide' drops them with no layout", () => {
    expect(keys(resolveSections(FIELDS, undefined, 'hide'))).toEqual([['', ['name', 'count']]]);
  });

  it("'hide' drops a section left empty, so no heading or tab is drawn over nothing", () => {
    const layout = { General: ['name'], Future: ['range'], Size: ['count', 'range'] };
    expect(keys(resolveSections(FIELDS, layout, 'hide'))).toEqual([
      ['General', ['name']],
      ['Size', ['count']],
    ]);
  });
});

describe('tocSections — what a table of contents can navigate', () => {
  const layout = { General: ['name'], Future: ['range'], Size: ['count'] };

  it('lists a stacked form’s sections, in page order', () => {
    expect(tocSections(FIELDS, layout, 'stacked')).toEqual(['General', 'Future', 'Size']);
  });

  it('lists nothing for a tabbed form, or when variant is omitted (the form defaults to tabs)', () => {
    expect(tocSections(FIELDS, layout, 'tabs')).toEqual([]);
    expect(tocSections(FIELDS, layout)).toEqual([]);
  });

  it('lists nothing for a single section — there is nothing to navigate between', () => {
    expect(tocSections(FIELDS, { Only: ['name', 'count'] }, 'stacked')).toEqual([]);
    expect(tocSections(FIELDS, undefined, 'stacked')).toEqual([]);
  });

  it('follows the patched display, so a hidden section is not listed', () => {
    expect(tocSections(FIELDS, layout, 'stacked', 'hide')).toEqual(['General', 'Size']);
  });
});
