import { describe, it, expect } from 'vitest';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { formatValue, rawValue, rowId } from './values';

const spec = (kind: FieldSpec['kind'], ...path: string[]): FieldSpec => ({ kind, path });

describe('rawValue', () => {
  it('reads a top-level and a hoisted leaf by path', () => {
    const row = { length: 12, passengerCapacity: { fareClass: 'firstClass' } };
    expect(rawValue(row, spec('number', 'length'))).toBe(12);
    expect(rawValue(row, spec('enum', 'passengerCapacity', 'fareClass'))).toBe('firstClass');
  });

  it('unwraps a name field to its value leaf', () => {
    expect(rawValue({ name: { lang: 'en', value: 'Flirt' } }, spec('name', 'name'))).toBe('Flirt');
  });

  it('yields undefined through a null parent or a null name', () => {
    expect(rawValue({ passengerCapacity: null }, spec('enum', 'passengerCapacity', 'fareClass'))).toBeUndefined();
    expect(rawValue({ name: null }, spec('name', 'name'))).toBeUndefined();
  });
});

describe('formatValue', () => {
  it('renders null and undefined as an empty string', () => {
    expect(formatValue({}, spec('text', 'x'))).toBe('');
    expect(formatValue({ x: null }, spec('number', 'x'))).toBe('');
  });

  it('keeps zero and false visible', () => {
    expect(formatValue({ x: 0 }, spec('number', 'x'))).toBe('0');
    expect(formatValue({ x: false }, spec('switch', 'x'), { yes: 'Ja', no: 'Nei' })).toBe('Nei');
    expect(formatValue({ x: true }, spec('switch', 'x'))).toBe('Yes');
  });

  it('joins a multi-enum and drops null members', () => {
    expect(formatValue({ x: ['a', null, 'b'] }, spec('enumMulti', 'x'))).toBe('a, b');
    expect(formatValue({ x: null }, spec('enumMulti', 'x'))).toBe('');
  });

  it('trims an ISO timestamp to a date or a minute', () => {
    const row = { x: '2024-03-05T14:07:59.000Z' };
    expect(formatValue(row, spec('date', 'x'))).toBe('2024-03-05');
    expect(formatValue(row, spec('datetime', 'x'))).toBe('2024-03-05 14:07');
  });
});

describe('rowId', () => {
  it('prefers netexId, then id, then the index', () => {
    expect(rowId({ netexId: 'A', id: 1 }, 5)).toBe('A');
    expect(rowId({ id: 1 }, 5)).toBe(1);
    expect(rowId({}, 5)).toBe(5);
    expect(rowId(null, 5)).toBe(5);
  });
});
