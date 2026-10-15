import { describe, it, expect } from 'vitest';
import { validate } from '@entur/iteru-3dbus/core';
import { doorHints, toBusInput, type BusInput } from './toBusInput';
import { vehicleSeed, vehicleTypeSeed } from '../stories/initDataSets';
import type { Vehicle, VehicleType } from '../entities';

const VOLVO = vehicleTypeSeed['VEH:VehicleType:1'];
const BUSNORDIC = vehicleTypeSeed['VEH:VehicleType:2'];
const CITARO = vehicleTypeSeed['VEH:VehicleType:3'];

const inpOf = (vt: Partial<VehicleType>, v?: Partial<Vehicle>): BusInput => {
  const r = toBusInput(vt, v);
  if (!r.ok) throw new Error(`missing: ${r.missing.join(', ')}`);
  return r.inp;
};

describe('toBusInput — seeds', () => {
  it.each([
    ['Volvo 8900 LE', VOLVO],
    ['Citaro G', CITARO],
    ['BusNordic I:15 DD', BUSNORDIC],
  ])('%s passes 3dbus validate', (_n, vt) => {
    expect(validate(inpOf(vt))).toEqual([]);
  });

  it('passes validate for every seeded Vehicle over its type', () => {
    for (const v of Object.values(vehicleSeed)) {
      const vt = vehicleTypeSeed[v.transportType?.netexId ?? ''];
      const r = toBusInput(vt, v);
      expect(r.ok && validate(r.inp)).toEqual([]);
    }
  });

  it('reports a missing make instead of inventing one', () => {
    expect(toBusInput({ ...BUSNORDIC, manufacturer: undefined })).toEqual({ ok: false, missing: ['manufacturer'] });
  });
});

describe('toBusInput — mapping', () => {
  it('converts metres to integer mm at this edge only', () => {
    const inp = inpOf(CITARO);
    expect(inp).toMatchObject({
      width_mm: 2550,
      height_mm: 3100,
      roof_equipment_mm: 250,
      tyre: { diameter_mm: 950 },
      sections: [
        { length_mm: 10600, axles_mm: [2700, 8600] },
        { length_mm: 7000, axles_mm: [4700], bellows_ahead_mm: 600 },
      ],
    });
  });

  it.each([
    [1, 'rigid'],
    [2, 'articulated'],
    [3, 'bi_articulated'],
  ])('derives body from %i section(s): %s', (n, body) => {
    const sections = Array.from({ length: n }, () => ({ length: 6, axles: [1, 5] }));
    expect(inpOf({ ...VOLVO, sections }).body).toBe(body);
  });

  it('takes brand, model and size from the type, and the drawn entity’s name for the display', () => {
    const inp = inpOf(VOLVO, { name: { value: 'Unit 9' }, operationalNumber: '9' });
    expect(inp).toMatchObject({
      brand: 'Volvo',
      model: '8900 LE',
      front_display: 'Unit 9',
      meta: { netex_vehicle_type_ref: 'VEH:VehicleType:1', fleet_number: '9' },
    });
    expect(inpOf(VOLVO).front_display).toBe('Volvo 8900 LE 12.4 m');
  });

  it("lets a Vehicle's geometry win, and falls back to the type's per value", () => {
    const own = { baseColor: '#000000', tyreDiameter: 1, sections: [{ length: 9, axles: [2, 7] }] };
    expect(inpOf(VOLVO, own)).toMatchObject({
      base_color: { hex: '#000000' },
      tyre: { diameter_mm: 1000 },
      sections: [{ length_mm: 9000 }],
      roof_equipment_mm: 0,
    });
    expect(inpOf(VOLVO, {})).toMatchObject({ base_color: { hex: '#E9ECEC' }, tyre: { diameter_mm: 1044 } });
  });

  it('sends the placeholder enums, and no undefined keys', () => {
    const inp = inpOf({ ...VOLVO, roofEquipment: undefined, netexId: 'not-a-ref' });
    expect(inp).toMatchObject({ bus_class: 'I', floor_type: 'low_floor' });
    expect(Object.values(inp)).not.toContain(undefined);
    expect(inp).not.toHaveProperty('roof_equipment_mm');
    expect(inp).not.toHaveProperty('meta');
  });

  it('lists every required source that is empty, as registry keys', () => {
    expect(toBusInput({})).toEqual({
      ok: false,
      missing: ['manufacturer', 'modelName', 'width', 'height', 'tyreDiameter', 'baseColor', 'sections'],
    });
    // A name stands in for a model name; blank text counts as empty.
    expect(toBusInput({ ...VOLVO, modelName: ' ', baseColor: '' })).toEqual({ ok: false, missing: ['baseColor'] });
  });
});

describe('doorHints — a count into 3dbus door hints', () => {
  it.each([
    [undefined, 2, undefined],
    [0, 2, undefined],
    [1, 2, [{ zone: 'front_overhang', leaves: 1 }]],
    [2, 2, [{ zone: 'front_overhang', leaves: 2 }, { zone: 'between_axles', leaves: 2 }]],
    [
      3,
      2,
      [
        { zone: 'front_overhang', leaves: 2 },
        { zone: 'between_axles', leaves: 2 },
        { zone: 'rear_overhang', leaves: 2 },
      ],
    ],
    // More doors than slots: capped at the slots.
    [9, 2, doorHints(3, 2)],
    // A trailer section has one axle, so no gap: front, then rear.
    [2, 1, [{ zone: 'front_overhang', leaves: 2 }, { zone: 'rear_overhang', leaves: 2 }]],
    // Three axles: a slot per gap, by index.
    [
      4,
      3,
      [
        { zone: 'front_overhang', leaves: 2 },
        { zone: 'between_axles', axle_gap: 0, leaves: 2 },
        { zone: 'between_axles', axle_gap: 1, leaves: 2 },
        { zone: 'rear_overhang', leaves: 2 },
      ],
    ],
  ])('%s door(s) on %i axle(s)', (doors, axles, want) => {
    expect(doorHints(doors, axles)).toEqual(want);
  });

  it('is what 3dbus places: a long bus with one door is reported, not drawn', () => {
    const one = { ...VOLVO, sections: [{ length: 12.396, axles: [2.769, 9.099], doors: 1 }] };
    expect(validate(inpOf(one)).join()).toMatch(/at least two doors/);
  });
});
