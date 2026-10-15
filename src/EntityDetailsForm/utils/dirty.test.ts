import { describe, expect, it } from 'vitest';
import { isDirty } from './dirty';

describe('isDirty', () => {
  it('is false for a value identical to its baseline', () => {
    expect(isDirty({ netexId: 'X', weight: 12 }, { netexId: 'X', weight: 12 })).toBe(false);
  });

  it('is true when a scalar changed', () => {
    expect(isDirty({ weight: 13 }, { weight: 12 })).toBe(true);
  });

  it('compares nested objects structurally, not by reference', () => {
    expect(isDirty({ name: { value: 'FLIRT' } }, { name: { value: 'FLIRT' } })).toBe(false);
    expect(isDirty({ name: { value: 'FLIRT' } }, { name: { value: 'Talent' } })).toBe(true);
  });

  it('ignores key order', () => {
    expect(isDirty({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });

  // The normalizeForDirty rule, moved off the host: a Switch that has never
  // been touched reports `false`, while a null-backed flag projects to
  // `undefined`. Toggling on then off must land back on clean.
  it('treats a false switch as equal to an absent baseline', () => {
    expect(isDirty({ lowFloor: false }, {})).toBe(false);
  });

  it('treats a cleared text field as equal to an absent baseline', () => {
    expect(isDirty({ euroClass: '' }, {})).toBe(false);
  });

  it('treats null as equal to an absent baseline', () => {
    expect(isDirty({ euroClass: null }, {})).toBe(false);
  });

  it('compares zoned timestamps by instant, not by spelling', () => {
    expect(isDirty({ t: '2020-01-15T00:00:00Z' }, { t: '2020-01-15T01:00:00+01:00' })).toBe(false);
    expect(isDirty({ t: '2020-01-15T00:01:00Z' }, { t: '2020-01-15T00:00:00Z' })).toBe(true);
  });

  // Guard against over-normalizing: 0 is a real value a user can mean.
  it('does not treat a zero as absent', () => {
    expect(isDirty({ weight: 0 }, {})).toBe(true);
    expect(isDirty({ weight: 0 }, { weight: 12 })).toBe(true);
  });

  it('still reports a switch turned off against a true baseline', () => {
    expect(isDirty({ lowFloor: false }, { lowFloor: true })).toBe(true);
  });

  it('reports a first edit in create mode, where there is no baseline', () => {
    expect(isDirty({ name: { value: 'New' } }, undefined)).toBe(true);
    expect(isDirty(undefined, undefined)).toBe(false);
  });

  it('compares arrays element-wise', () => {
    expect(isDirty({ fuelTypes: ['DIESEL'] }, { fuelTypes: ['DIESEL'] })).toBe(false);
    expect(isDirty({ fuelTypes: ['DIESEL'] }, { fuelTypes: ['PETROL'] })).toBe(true);
    expect(isDirty({ fuelTypes: [] }, {})).toBe(false);
  });
});
