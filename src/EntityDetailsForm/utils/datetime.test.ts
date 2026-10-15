import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fromLocalInput, sameInstant, toLocalInput } from './datetime';

// Pinned to a non-UTC zone: under UTC, local and stored times coincide and an
// offset bug would pass. Node re-reads TZ on assignment.
const ZONE = 'Europe/Oslo';
let prevTz: string | undefined;
beforeAll(() => {
  prevTz = process.env.TZ;
  process.env.TZ = ZONE;
});
afterAll(() => {
  process.env.TZ = prevTz;
});

describe('toLocalInput', () => {
  it('shows the stored instant in local time, not the sliced UTC digits', () => {
    expect(toLocalInput('2020-01-15T00:00:00Z')).toBe('2020-01-15T01:00');
    expect(toLocalInput('2020-07-15T00:00:00Z')).toBe('2020-07-15T02:00'); // DST
  });

  it('honours an explicit offset', () => {
    expect(toLocalInput('2020-01-15T00:00:00-05:00')).toBe('2020-01-15T06:00');
  });

  it('keeps non-zero seconds so an untouched round trip is exact', () => {
    expect(toLocalInput('2020-01-15T00:00:30Z')).toBe('2020-01-15T01:00:30');
  });

  it('renders empty for absent values and slices an unparseable string', () => {
    expect(toLocalInput(undefined)).toBe('');
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('')).toBe('');
    expect(toLocalInput('not a dateXXXXXXXXXX')).toBe('not a dateXXXXXX');
  });
});

describe('fromLocalInput', () => {
  it('writes the local wall-clock time back as an explicit UTC instant', () => {
    expect(fromLocalInput('2020-01-15T01:01')).toBe('2020-01-15T00:01:00Z');
    expect(fromLocalInput('2020-07-15T02:00')).toBe('2020-07-15T00:00:00Z');
  });

  it('clears to undefined', () => {
    expect(fromLocalInput('')).toBeUndefined();
  });

  it('round-trips a stored UTC timestamp unchanged', () => {
    for (const iso of ['2020-01-15T00:00:00Z', '2022-09-01T00:00:30Z', '2020-07-15T23:59:00Z']) {
      expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    }
  });
});

describe('sameInstant', () => {
  it('equates offsets naming one instant', () => {
    expect(sameInstant('2020-01-15T01:00:00+01:00', '2020-01-15T00:00:00Z')).toBe(true);
    expect(sameInstant('2020-01-15T00:00:00.000Z', '2020-01-15T00:00:00Z')).toBe(true);
  });

  it('tells different instants apart', () => {
    expect(sameInstant('2020-01-15T00:01:00Z', '2020-01-15T00:00:00Z')).toBe(false);
  });

  it('never equates a zone-less or non-timestamp string', () => {
    expect(sameInstant('2020-01-15T00:00', '2020-01-15T00:00:00Z')).toBe(false);
    expect(sameInstant('2020-01-15', '2020-01-15')).toBe(false); // a === b decides that, not this
  });
});
