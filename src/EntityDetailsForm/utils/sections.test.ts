import { describe, it, expect } from 'vitest';
import { resolveSections } from './sections';
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
