/**
 * Seeded random `VehicleType` rows for the collection story. Same seed, same
 * rows. Bus rows also carry 3D geometry inside 3dbus's limits (#60), so a
 * `cards-big` card can draw them; the other modes stay geometry-free.
 */
import type { VehicleType } from "../index";
import {
  FareClass,
  PropulsionType,
  TransportMode,
} from "../generated/sobekTypes";

/** Sample pools for the random generator. */
const MAKERS = [
  "Stadler",
  "Alstom",
  "Siemens",
  "CAF",
  "Škoda",
  "Hitachi",
  "Bombardier",
  "Solaris",
];
const MODELS = [
  "FLIRT",
  "Coradia",
  "Mireo",
  "Civity",
  "Panter",
  "AT-200",
  "Talent",
  "Urbino",
];
const TRANSPORT = [
  TransportMode.Rail,
  TransportMode.Bus,
  TransportMode.Tram,
  TransportMode.Metro,
  TransportMode.Ferry,
];
const PROPULSION = Object.values(PropulsionType);
const FARE = Object.values(FareClass);

// Bus geometry, metres, inside what 3dbus validates: width ≤ 2.55 m, an
// articulated bus ≤ 18.75 m overall. A quarter of the buses are articulated;
// their front section and bellows are the Citaro seed's.
const BUS_WIDTH = [2.4, 2.55], BUS_HEIGHT = [3, 3.4], BUS_TYRE = [0.95, 1.05];
const RIGID_LENGTH = [10.5, 15], REAR_OVERHANG = [2.5, 3.5], FRONT_AXLE = 2.7;
const ARTICULATED_SHARE = 0.25, TRAILER_LENGTH = [6.5, 7.5], TRAILER_AXLE = 4.7;
const FRONT_SECTION = { length: 10.6, axles: [2.7, 8.6] }, BELLOWS = 0.6;
// Two doors per section: 3dbus wants at least two on a long bus.
const DOORS = 2;
const BUS_COLORS = ["#E9ECEC", "#1F6FB2", "#D6001C", "#2E7D32", "#F2A900", "#37474F"];

/* ------------------------------------------------------------------ *\
   Random row generator
\* ------------------------------------------------------------------ */

/** mulberry32 — tiny deterministic PRNG so the demo is stable per seed. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Num = (lo: number, hi: number, dp?: number) => number;

/** A metre value rounded to the mm, as a sum of rounded parts must be. */
const toMm = (m: number): number => Math.round(m * 1000) / 1000;

/** A bus's 3D geometry: one rigid section or an articulated pair, a length
 *  that is exactly what its sections and bellows add up to, and the rest. */
const busGeometry = (rnd: () => number, num: Num, pick: <T>(xs: readonly T[]) => T): Partial<VehicleType> => {
  const range = ([lo, hi]: number[], dp = 2) => num(lo, hi, dp);
  const rigid = (): VehicleType["sections"] => {
    const length = range(RIGID_LENGTH, 1);
    return [{ id: "S1", length, axles: [FRONT_AXLE, toMm(length - range(REAR_OVERHANG, 1))], doors: DOORS }];
  };
  const articulated = (): VehicleType["sections"] => [
    { id: "S1", ...FRONT_SECTION, doors: DOORS },
    { id: "S2", length: range(TRAILER_LENGTH, 1), axles: [TRAILER_AXLE], bellowsAhead: BELLOWS, doors: DOORS },
  ];
  const sections = rnd() < ARTICULATED_SHARE ? articulated() : rigid();
  return {
    modelName: pick(MODELS),
    sections,
    length: toMm(sections!.reduce((n, s) => n + (s?.length ?? 0) + (s?.bellowsAhead ?? 0), 0)),
    width: range(BUS_WIDTH),
    height: range(BUS_HEIGHT),
    tyreDiameter: range(BUS_TYRE, 3),
    baseColor: pick(BUS_COLORS),
  };
};

/**
 * Build `n` randomized `VehicleType` rows from a seeded PRNG.
 *
 * @param n    How many rows to emit.
 * @param seed PRNG seed; same seed → identical rows (reproducible showcase).
 * @returns An array of fully-populated `VehicleType` objects.
 */
export const genVehicleTypes = (n: number, seed: number): VehicleType[] => {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const num = (lo: number, hi: number, dp = 1): number =>
    Math.round((lo + rnd() * (hi - lo)) * 10 ** dp) / 10 ** dp;
  const day = (offset: number): string =>
    new Date(
      Date.UTC(2018, 0, 1) + Math.floor(rnd() * offset) * 86_400_000,
    ).toISOString();

  return Array.from({ length: n }, (_, i): VehicleType => {
    const seating = Math.floor(num(40, 320, 0));
    const standing = Math.floor(num(0, 180, 0));
    const total = seating + standing;
    const row: VehicleType = {
      netexId: `VEH:VehicleType:${1000 + i}`,
      version: "1",
      name: {
        lang: "en",
        value: `${pick(MAKERS)} ${pick(MODELS)} ${10 + (i % 90)}`,
      },
      transportMode: pick(TRANSPORT),
      manufacturer: pick(MAKERS),
      propulsionTypes: Array.from(
        new Set([pick(PROPULSION), pick(PROPULSION)]),
      ),
      length: num(12, 220),
      width: num(2.4, 3.2, 2),
      height: num(3, 4.5, 2),
      // In the XSD's units (`UNIT_LABELS`): kg, m and Wh.
      weight: num(12_000, 95_000, 0),
      maximumRange: num(180_000, 1_200_000, 0),
      fullCharge: num(40_000, 600_000, 0),
      lowFloor: rnd() > 0.4,
      carLoading: rnd() > 0.8,
      selfPropelled: rnd() > 0.3,
      passengerCapacity: {
        totalCapacity: total,
        seatingCapacity: seating,
        standingCapacity: standing,
        fareClass: pick(FARE),
      },
      dataOwnerRef: '',
      created: day(1500),
      changed: day(2800),
    };
    return row.transportMode === TransportMode.Bus ? { ...row, ...busGeometry(rnd, num, pick) } : row;
  });
};
