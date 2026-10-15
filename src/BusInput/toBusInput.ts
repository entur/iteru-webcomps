/**
 * VehicleType / Vehicle → `@entur/iteru-3dbus` bus input (contract v2.0).
 *
 * Pure: no import of the 3dbus package, so the library stays free of three.js.
 * The forms hold metres; this is the one place they become integer mm. A
 * Vehicle's own geometry wins over its type's. Nothing that changes the render
 * is invented — a required value with no source is reported as missing instead.
 */
import type { Vehicle, VehicleType } from '../entities';
import type { BusSection } from '../generated/sobekTypes';

const SCHEMA_VERSION = '2.0';
const MM_PER_M = 1000;
/** At most this many door hints per section (`doors_hint.maxItems`). */
const MAX_DOORS = 4;
/** `meta.netex_vehicle_type_ref` pattern; an id that does not match is left out. */
const TYPE_REF = /^[A-Z]{3}:VehicleType:[A-Za-z0-9_-]+$/;

// Placeholders: required enums 3dbus v0.1.0 never reads when it draws, and no
// field of ours carries. Not data — drop each once the field turns optional
// (entur/iteru-3dbus#39). Each is the schema's first member that its `allOf`
// rules leave unconstrained: `A`/`B` would cap the bus at 9.5 m rigid, `III`
// force rigid, `low_floor_lower_level` demand a double-deck height.
const BUS_CLASS_PLACEHOLDER = 'I', FLOOR_TYPE_PLACEHOLDER = 'low_floor';

/** `body` by section count: one rigid, two articulated, three bi-articulated. */
const BODIES = ['rigid', 'articulated', 'bi_articulated'] as const;

/** One 3dbus door hint, as this adapter emits it (bias/glazed left at defaults). */
export type DoorHint = {
  zone: 'front_overhang' | 'between_axles' | 'rear_overhang';
  axle_gap?: number;
  leaves: 1 | 2;
};

/** One body section, in mm, measured from its own front. */
export type BusInputSection = {
  length_mm: number;
  axles_mm: number[];
  bellows_ahead_mm?: number;
  windows_hint?: { count: number };
  doors_hint?: DoorHint[];
};

/** The part of the 3dbus input this adapter fills; the rest takes 3dbus defaults. */
export type BusInput = {
  schema_version: typeof SCHEMA_VERSION;
  brand: string;
  model: string;
  body: (typeof BODIES)[number];
  bus_class: string;
  floor_type: string;
  width_mm: number;
  height_mm: number;
  roof_equipment_mm?: number;
  tyre: { diameter_mm: number };
  base_color: { hex: string };
  front_display?: string;
  sections: BusInputSection[];
  meta?: { netex_vehicle_type_ref?: string; fleet_number?: string };
};

/** Either a bus input ready for `validate`, or the registry keys it still needs. */
export type BusInputResult = { ok: true; inp: BusInput } | { ok: false; missing: string[] };

const mm = (m: number): number => Math.round(m * MM_PER_M);
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const text = (s: string | null | undefined): string | undefined => (s?.trim() ? s.trim() : undefined);
/** Drop the `undefined` members: 3dbus rejects unknown keys and `undefined` values alike. */
const defined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/**
 * The door hints a section's door count stands for. Its slots run front to
 * rear — the front overhang, each axle gap, the rear overhang — and a count of
 * N takes the first N of them. One door is single-leaf, more are double.
 *
 * @param doors the section's door count (empty or 0 → no doors)
 * @param axles how many axles the section has
 * @returns the hints, or `undefined` for none
 */
export function doorHints(doors: number | null | undefined, axles: number): DoorHint[] | undefined {
  if (!doors || doors < 1) return undefined;
  const gaps = Array.from({ length: Math.max(axles - 1, 0) }, (_, g): Omit<DoorHint, 'leaves'> =>
    ({ zone: 'between_axles', ...(axles > 2 ? { axle_gap: g } : {}) })
  );
  const slots: Omit<DoorHint, 'leaves'>[] = [{ zone: 'front_overhang' }, ...gaps, { zone: 'rear_overhang' }];
  const leaves = doors === 1 ? 1 : 2;
  return slots.slice(0, Math.min(doors, MAX_DOORS)).map(s => ({ ...s, leaves }));
}

const toSection = (s: BusSection): BusInputSection =>
  defined({
    length_mm: mm(s.length ?? 0),
    axles_mm: (s.axles ?? []).filter(isNum).map(mm),
    bellows_ahead_mm: isNum(s.bellowsAhead) ? mm(s.bellowsAhead) : undefined,
    windows_hint: isNum(s.windowCount) ? { count: s.windowCount } : undefined,
    doors_hint: doorHints(s.doors, (s.axles ?? []).filter(isNum).length),
  });

/**
 * Build the 3dbus input for a VehicleType, or for a Vehicle drawn over its type.
 *
 * Sources: `brand` = type `manufacturer`; `model` = type `modelName`, else its
 * name; `width_mm` / `height_mm` from the type; `tyre`, `base_color`,
 * `roof_equipment_mm` and `sections` from the Vehicle when set, else the type;
 * `front_display` = the drawn entity's name; `body` from the section count.
 * Required values with no source come back in `missing`, as registry keys.
 *
 * @param vt the VehicleType (for a Vehicle render: the one it references)
 * @param v  the Vehicle, when drawing one; its geometry wins over `vt`'s
 * @returns the input, or the keys still to fill
 */
export function toBusInput(vt: Partial<VehicleType>, v?: Partial<Vehicle>): BusInputResult {
  const sections = (v?.sections?.length ? v.sections : vt.sections)?.filter((s): s is BusSection => !!s) ?? [];
  const tyre = v?.tyreDiameter ?? vt.tyreDiameter;
  const roof = v?.roofEquipment ?? vt.roofEquipment;
  const hex = text(v?.baseColor) ?? text(vt.baseColor);
  const brand = text(vt.manufacturer);
  const model = text(vt.modelName) ?? text(vt.name?.value);

  const missing = [
    !brand && 'manufacturer',
    !model && 'modelName',
    !isNum(vt.width) && 'width',
    !isNum(vt.height) && 'height',
    !isNum(tyre) && 'tyreDiameter',
    !hex && 'baseColor',
    !sections.length && 'sections',
  ].filter((k): k is string => !!k);
  if (missing.length) return { ok: false, missing };

  const fleet = text(v?.operationalNumber);
  const ref = vt.netexId && TYPE_REF.test(vt.netexId) ? vt.netexId : undefined;
  return {
    ok: true,
    inp: defined({
      schema_version: SCHEMA_VERSION,
      brand: brand!,
      model: model!,
      body: BODIES[sections.length - 1] ?? BODIES[0],
      bus_class: BUS_CLASS_PLACEHOLDER,
      floor_type: FLOOR_TYPE_PLACEHOLDER,
      width_mm: mm(vt.width!),
      height_mm: mm(vt.height!),
      roof_equipment_mm: isNum(roof) ? mm(roof) : undefined,
      tyre: { diameter_mm: mm(tyre!) },
      base_color: { hex: hex! },
      front_display: text((v ?? vt).name?.value),
      sections: sections.map(toSection),
      meta: ref || fleet ? defined({ netex_vehicle_type_ref: ref, fleet_number: fleet }) : undefined,
    }),
  };
}
