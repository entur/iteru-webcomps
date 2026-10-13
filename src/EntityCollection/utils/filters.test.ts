import { describe, it, expect } from 'vitest';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { asList, asText, matchesFilter, toSobekFilter } from './filters';

const NAME: FieldSpec = { kind: 'name', path: ['name'] };
const MODE: FieldSpec = { kind: 'enum', path: ['transportMode'] };
const PROP: FieldSpec = { kind: 'enumMulti', path: ['propulsionTypes'] };
const row = { name: { value: 'Stadler FLIRT' }, transportMode: 'rail', propulsionTypes: ['electric', null] };

describe('coercion', () => {
  it('turns either shape into a list or a text', () => {
    expect(asList('a')).toEqual(['a']);
    expect(asList('')).toEqual([]);
    expect(asList(undefined)).toEqual([]);
    expect(asList(['a', 'b'])).toEqual(['a', 'b']);
    expect(asText(['a', 'b'])).toBe('a b');
    expect(asText(undefined)).toBe('');
  });
});

describe('matchesFilter', () => {
  it('contains: case-insensitive substring, trimmed', () => {
    expect(matchesFilter(row, NAME, 'contains', '  flirt ')).toBe(true);
    expect(matchesFilter(row, NAME, 'contains', 'coradia')).toBe(false);
  });

  it('anyOf: a scalar in the set, or any member of a list in the set', () => {
    expect(matchesFilter(row, MODE, 'anyOf', ['bus', 'rail'])).toBe(true);
    expect(matchesFilter(row, MODE, 'anyOf', ['bus'])).toBe(false);
    expect(matchesFilter(row, PROP, 'anyOf', ['electric'])).toBe(true);
  });

  it('an empty condition matches everything', () => {
    expect(matchesFilter(row, NAME, 'contains', '   ')).toBe(true);
    expect(matchesFilter(row, MODE, 'anyOf', [])).toBe(true);
  });

  it('coerces a value of the wrong shape instead of throwing', () => {
    expect(matchesFilter(row, MODE, 'anyOf', 'rail')).toBe(true);
    expect(matchesFilter(row, NAME, 'contains', ['flirt'])).toBe(true);
  });

  it('a missing value fails a non-empty condition', () => {
    expect(matchesFilter({ name: null }, NAME, 'contains', 'x')).toBe(false);
    expect(matchesFilter({}, MODE, 'anyOf', ['rail'])).toBe(false);
  });
});

describe('toSobekFilter', () => {
  const FF = {
    name: { arg: 'name', op: 'contains' },
    transportMode: { arg: 'transportModes', op: 'anyOf' },
  } as const;

  it('renames fields to their filter args', () => {
    expect(toSobekFilter({ name: ' flirt ', transportMode: ['rail'] }, FF)).toEqual({
      name: 'flirt',
      transportModes: ['rail'],
    });
  });

  it('omits empty conditions and unknown fields', () => {
    expect(toSobekFilter({ name: '', transportMode: [], length: '12' }, FF)).toEqual({});
  });
});
