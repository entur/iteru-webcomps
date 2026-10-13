import { describe, it, expect } from 'vitest';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { resolveCard, resolveColumns } from './columns';

const FIELDS: Record<string, FieldSpec> = {
  netexId: { kind: 'text', path: ['netexId'] },
  name: { kind: 'name', path: ['name'] },
  transportMode: { kind: 'enum', path: ['transportMode'], options: ['bus', 'rail'] },
  range: { kind: 'number', path: ['range'], patched: true },
  vehicles: { kind: 'grid', path: ['vehicles'], serverManaged: true },
  length: { kind: 'number', path: ['length'] },
};

describe('resolveColumns', () => {
  it('defaults to every eligible field in registry order, humanized', () => {
    expect(resolveColumns(FIELDS).map(c => [c.key, c.label])).toEqual([
      ['netexId', 'Netex id'],
      ['name', 'Name'],
      ['transportMode', 'Transport mode'],
      ['length', 'Length'],
    ]);
  });

  it('never yields a patched or a grid field, even when asked for', () => {
    expect(resolveColumns(FIELDS, ['range', 'vehicles', 'name']).map(c => c.key)).toEqual(['name']);
  });

  it('honours whitelist order and per-entry labels', () => {
    const cols = resolveColumns(FIELDS, [{ field: 'length', label: 'Lengde' }, 'netexId']);
    expect(cols.map(c => [c.key, c.label])).toEqual([['length', 'Lengde'], ['netexId', 'Netex id']]);
  });

  it('drops keys the registry does not know', () => {
    expect(resolveColumns(FIELDS, ['nope', 'name']).map(c => c.key)).toEqual(['name']);
  });
});

describe('resolveCard', () => {
  const cols = resolveColumns(FIELDS);

  it('defaults to name as title and the other columns as fields', () => {
    const card = resolveCard(FIELDS, cols);
    expect(card.title?.key).toBe('name');
    expect(card.subtitle).toBeUndefined();
    expect(card.fields.map(c => c.key)).toEqual(['netexId', 'transportMode', 'length']);
  });

  it('falls back to the first column when there is no name', () => {
    const noName = cols.filter(c => c.key !== 'name');
    expect(resolveCard(FIELDS, noName).title?.key).toBe('netexId');
  });

  it('resolves an explicit card against the registry, not the column whitelist', () => {
    const card = resolveCard(FIELDS, resolveColumns(FIELDS, ['name']), {
      title: 'name',
      subtitle: 'netexId',
      fields: ['length', 'range'],
    });
    expect(card.subtitle?.key).toBe('netexId');
    expect(card.fields.map(c => c.key)).toEqual(['length']);
  });

  it('survives an empty column list', () => {
    expect(resolveCard(FIELDS, [])).toEqual({ title: undefined, subtitle: undefined, fields: [] });
  });
});
