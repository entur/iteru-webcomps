import { describe, it, expect } from 'vitest';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { defaultCollectionQuery, type CollectionQuery } from '../types';
import { applyQuery } from './applyQuery';
import { resolveColumns } from './columns';

const FIELDS: Record<string, FieldSpec> = {
  netexId: { kind: 'text', path: ['netexId'] },
  name: { kind: 'name', path: ['name'] },
  transportMode: { kind: 'enum', path: ['transportMode'] },
  length: { kind: 'number', path: ['length'] },
  lowFloor: { kind: 'switch', path: ['lowFloor'] },
  fareClass: { kind: 'enum', path: ['passengerCapacity', 'fareClass'] },
};
const COLS = resolveColumns(FIELDS);
const FF = {
  name: { arg: 'name', op: 'contains' },
  transportMode: { arg: 'transportModes', op: 'anyOf' },
} as const;

const ROWS = [
  { netexId: 'T:1', name: { value: 'Flirt' }, transportMode: 'rail', length: 74, lowFloor: true, passengerCapacity: { fareClass: 'first' } },
  { netexId: 'T:2', name: { value: 'Urbino' }, transportMode: 'bus', length: 12, lowFloor: false, passengerCapacity: null },
  { netexId: 'T:3', name: null, transportMode: 'rail', length: null },
  { netexId: 'T:4', name: { value: 'coradia' }, transportMode: 'tram', length: 100, lowFloor: true },
];

const q = (over: Partial<CollectionQuery>): CollectionQuery => ({ ...defaultCollectionQuery, ...over });
const ids = (over: Partial<CollectionQuery>, mode?: 'client' | 'server') =>
  applyQuery(ROWS, COLS, FF, q(over), mode).rows.map(r => r.netexId);

describe('applyQuery', () => {
  it('returns everything for the default query, in input order', () => {
    expect(ids({})).toEqual(['T:1', 'T:2', 'T:3', 'T:4']);
  });

  it('ANDs filters across fields', () => {
    expect(ids({ filters: { transportMode: ['rail'] } })).toEqual(['T:1', 'T:3']);
    expect(ids({ filters: { transportMode: ['rail'], name: 'fli' } })).toEqual(['T:1']);
  });

  it('skips the filter step in server mode but still searches', () => {
    expect(ids({ filters: { transportMode: ['rail'] } }, 'server')).toEqual(['T:1', 'T:2', 'T:3', 'T:4']);
    expect(ids({ filters: { transportMode: ['rail'] }, search: 'urb' }, 'server')).toEqual(['T:2']);
  });

  it('ignores a filter on a field that is not filterable or not a column', () => {
    expect(ids({ filters: { length: '12', ghost: 'x' } })).toEqual(['T:1', 'T:2', 'T:3', 'T:4']);
  });

  it('searches text-like columns, hoisted leaves included, case-insensitively', () => {
    expect(ids({ search: 'FIRST' })).toEqual(['T:1']);
    expect(ids({ search: 't:3' })).toEqual(['T:3']);
    expect(ids({ search: '(' })).toEqual([]);
  });

  it('does not search numbers or switches', () => {
    expect(ids({ search: '74' })).toEqual([]);
    expect(ids({ search: 'yes' })).toEqual([]);
  });

  it('sorts numbers numerically and text case-insensitively', () => {
    expect(ids({ sort: { field: 'length', dir: 'asc' } })).toEqual(['T:2', 'T:1', 'T:4', 'T:3']);
    expect(ids({ sort: { field: 'name', dir: 'asc' } })).toEqual(['T:4', 'T:1', 'T:2', 'T:3']);
  });

  it('keeps missing values last in both directions', () => {
    expect(ids({ sort: { field: 'length', dir: 'desc' } })).toEqual(['T:4', 'T:1', 'T:2', 'T:3']);
    expect(ids({ sort: { field: 'name', dir: 'desc' } })).toEqual(['T:2', 'T:1', 'T:4', 'T:3']);
  });

  it('ignores a sort on an unknown field', () => {
    expect(ids({ sort: { field: 'ghost', dir: 'asc' } })).toEqual(['T:1', 'T:2', 'T:3', 'T:4']);
  });

  it('pages the result and reports the unpaged total', () => {
    const out = applyQuery(ROWS, COLS, FF, q({ pageSize: 3, page: 1 }));
    expect(out.rows.map(r => r.netexId)).toEqual(['T:4']);
    expect(out.total).toBe(4);
    expect(out.page).toBe(1);
  });

  it('clamps a page past the end to the last page', () => {
    const out = applyQuery(ROWS, COLS, FF, q({ pageSize: 3, page: 9, filters: { transportMode: ['rail'] } }));
    expect(out.page).toBe(0);
    expect(out.rows.map(r => r.netexId)).toEqual(['T:1', 'T:3']);
  });

  it('handles no rows and a non-positive page size', () => {
    expect(applyQuery([], COLS, FF, q({ page: 3 }))).toEqual({ rows: [], total: 0, page: 0 });
    expect(applyQuery(ROWS, COLS, FF, q({ pageSize: 0 })).rows).toHaveLength(4);
  });

  it('does not mutate its input', () => {
    const before = [...ROWS];
    applyQuery(ROWS, COLS, FF, q({ sort: { field: 'length', dir: 'asc' } }));
    expect(ROWS).toEqual(before);
  });
});
