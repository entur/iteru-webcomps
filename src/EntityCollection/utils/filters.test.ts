import { describe, it, expect } from 'vitest';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import type { Column } from '../types';
import { resolveColumns } from './columns';
import {
  activeFilterColumns,
  asList,
  asText,
  chipText,
  cleanList,
  isEmptyCondition,
  matchesFilter,
  toSobekFilter,
  withFilter,
} from './filters';

/** The column a collection would build for one registry entry. */
const col = (key: string, spec: FieldSpec): Column => resolveColumns({ [key]: spec })[0];

const NAME = col('name', { kind: 'name', path: ['name'] });
const MODE = col('transportMode', { kind: 'enum', path: ['transportMode'] });
const PROP = col('propulsionTypes', { kind: 'enumMulti', path: ['propulsionTypes'] });
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

describe('matchesFilter on the identity field', () => {
  const ID = col('netexId', { kind: 'text', path: ['netexId'] });
  const vt = { netexId: 'VEH:VehicleType:1004' };

  it('matches the compact ::NUM form and the bare number', () => {
    expect(matchesFilter(vt, ID, 'anyOf', ['::1004'])).toBe(true);
    expect(matchesFilter(vt, ID, 'anyOf', ['1004'])).toBe(true);
  });

  it('still matches the full namespaced id, as a fallback', () => {
    expect(matchesFilter(vt, ID, 'anyOf', ['VEH:VehicleType:1004'])).toBe(true);
  });

  it('does not match a different number, a prefix of it, or another namespace', () => {
    expect(matchesFilter(vt, ID, 'anyOf', ['::100'])).toBe(false);
    expect(matchesFilter(vt, ID, 'anyOf', ['04'])).toBe(false);
    expect(matchesFilter(vt, ID, 'anyOf', ['VEH:DeckPlan:1004'])).toBe(false);
  });

  it('keeps last-segment matching to the identity field', () => {
    const MODE_ANY = col('code', { kind: 'text', path: ['code'] });
    expect(matchesFilter({ code: 'A:B:1004' }, MODE_ANY, 'anyOf', ['1004'])).toBe(false);
  });
});

describe('isEmptyCondition', () => {
  it('treats blank text and lists of blanks as empty', () => {
    expect(isEmptyCondition(undefined)).toBe(true);
    expect(isEmptyCondition('  ')).toBe(true);
    expect(isEmptyCondition([])).toBe(true);
    expect(isEmptyCondition(['', ' '])).toBe(true);
    expect(isEmptyCondition(['a'])).toBe(false);
    expect(isEmptyCondition('a')).toBe(false);
  });

  it('keeps a list of blanks out of the sobek filter, as chips and matching already do', () => {
    expect(toSobekFilter({ netexId: [''] }, { netexId: { arg: 'netexIds', op: 'anyOf' } })).toEqual({});
  });
});

describe('editing helpers', () => {
  it('sets and removes one condition', () => {
    expect(withFilter({ a: 'x' }, 'b', ['y'])).toEqual({ a: 'x', b: ['y'] });
    expect(withFilter({ a: 'x', b: 'y' }, 'a', undefined)).toEqual({ b: 'y' });
  });

  it('trims typed entries and drops blanks and repeats', () => {
    expect(cleanList([' a ', '', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('shows a condition through the column entry rule', () => {
    const id = col('netexId', { kind: 'text', path: ['netexId'] });
    expect(chipText(['VEH:VehicleType:1004', '7'], id.entryLabel)).toBe('::1004, ::7');
    expect(chipText(' fli ')).toBe('fli');
  });

  it('lists only filterable columns with a non-empty condition', () => {
    const ff = { name: { arg: 'name', op: 'contains' }, transportMode: { arg: 'transportModes', op: 'anyOf' } } as const;
    const active = activeFilterColumns([NAME, MODE, PROP], ff, { name: 'x', transportMode: [], propulsionTypes: ['e'] });
    expect(active.map(c => c.key)).toEqual(['name']);
  });
});
