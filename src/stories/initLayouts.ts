/**
 * Layout fixtures for the form stories — the section/field arrangement passed as
 * each form's `layout`, plus the reference option-lists those layouts feed via
 * their `options` closures. Split out of `initDataSets` so presentation config
 * (how fields are grouped) lives apart from the entity data (what's in them).
 */
import type { LayoutItem, VehicleLayout, VehicleTypeLayout, RefOption } from "../index";

// ── units ───────────────────────────────────────────────────────────────────

/** Captions of the measured fields, unit as a label suffix. Where NeTEx has
 *  the field, the unit is its XSD type's (`netex_units.xsd`, NeTEx 2.0) —
 *  sobek stores the NeTEx value unconverted. The rest have no NeTEx
 *  counterpart and take their source's unit. Counts and coefficients carry none. */
export const UNIT_LABELS = {
  // NeTEx-backed
  length: "Length (m)", // LengthType
  width: "Width (m)", // LengthType
  height: "Height (m)", // LengthType
  weight: "Weight (kg)", // WeightType
  maximumVelocity: "Maximum velocity (m/s)", // SpeedType: "Maximum velocity in m/s"
  maximumRange: "Maximum range (m)", // DistanceType
  fullCharge: "Full charge (Wh)", // VehicleModel.FullCharge: WattHoursType
  // sobek's own — the unit is in the name
  maximumEngineEffectKW: "Maximum engine effect (kW)",
  // hathor#191 (#50)
  draft: "Draft (m)",
  tareWeight: "Tare weight (kg)",
  minOperatingTemperature: "Min operating temperature (°C)",
  maxOperatingTemperature: "Max operating temperature (°C)",
  // 3D geometry (#51): metres, converted to mm only for the 3D input
  tyreDiameter: "Tyre diameter (m)",
  roofEquipment: "Roof equipment (m)",
} as const;

/** A layout entry captioned from {@link UNIT_LABELS}. */
const measured = <K extends keyof typeof UNIT_LABELS>(field: K) => ({ field, label: UNIT_LABELS[field] });

// ── 3D geometry ─────────────────────────────────────────────────────────────

/** The overlay's 3D-geometry fields (entur/iteru-webcomps#51), on both entities:
 *  metres in the form, converted to mm only when the 3D input is built. Units
 *  ride as a label suffix. `sections` is a read-only grid, front to rear. */
const geometry: LayoutItem<"tyreDiameter" | "roofEquipment" | "baseColor" | "sections">[] = [
  // First: the sections define most of the rendered bus.
  {
    field: "sections",
    entries: [
      { field: "length", label: "Length (m)" },
      { field: "axles", label: "Axles (m)" },
      { field: "bellowsAhead", label: "Bellows ahead (m)" },
      { field: "windowCount", label: "Windows" },
    ],
  },
  measured("tyreDiameter"),
  measured("roofEquipment"),
  { field: "baseColor", label: "Base colour (hex)" },
];

// ── option-lists ──────────────────────────────────────────────────────────
// In a real app these come from a query; here they are static. A layout entry's
// `options` closure captures one. On a `reference` field, selecting writes
// `value` (a netexId) into the id leaf; on a `text` field it writes the code
// itself. `label` is display-only either way.

/** Candidate VehicleTypes for `Vehicle.transportType`. */
export const vehicleTypeRefs: RefOption[] = [
  { value: "VEH:VehicleType:1", label: "Volvo 8900 LE 12.4 m" },
  { value: "VEH:VehicleType:2", label: "BusNordic I:15 DD" },
  { value: "VEH:VehicleType:3", label: "Mercedes-Benz Citaro G" },
];

/** Candidate DeckPlans for `VehicleType.deckPlan`. */
export const deckPlanRefs: RefOption[] = [
  { value: "VEH:DeckPlan:1", label: "Single-deck 2+2" },
  { value: "VEH:DeckPlan:2", label: "Double-deck" },
  { value: "VEH:DeckPlan:3", label: "Low-floor articulated" },
];

/** Emission classes for `VehicleType.euroClass` — stands in for sobek's
 *  `EMISSION_STANDARD` code list (`codeValues` query), as hathor loads it. */
export const euroClassCodes: RefOption[] = [
  { value: "Euro3", label: "Euro 3" },
  { value: "Euro4", label: "Euro 4" },
  { value: "Euro5", label: "Euro 5" },
  { value: "Euro6", label: "Euro 6" },
];

// ── VehicleType ─────────────────────────────────────────────────────────────

// Object-key order = section order; array order = field order within the
// section. `deckPlan` (a distilled `reference`) sits under `transportMode`;
// `vehicles` is a distilled `grid` (serverManaged) rendered as a read-only table.
// Measured fields carry their unit as a label suffix (`UNIT_LABELS`). Numbers
// take a third of a row and pack three abreast; switches and dates a half.
export const vehicleTypeLayout: VehicleTypeLayout = {
  General: [
    "name",
    "transportMode",
    { field: "deckPlan", options: () => deckPlanRefs },
    "manufacturer",
    "modelName",
    measured("fullCharge"),
  ],
  Dimensions: [
    measured("length"),
    measured("width"),
    measured("height"),
    measured("draft"),
    measured("weight"),
    measured("tareWeight"),
  ],
  Geometry: [...geometry],
  Accessibility: ["lowFloor", "accessEquipment", "facilities"],
  Environment: [
    "selfPropelled",
    "propulsionTypes",
    "fuelTypes",
    { field: "euroClass", options: () => euroClassCodes },
    measured("maximumVelocity"),
    measured("maximumRange"),
    "formDragCoefficient",
    "rollResistanceCoefficient",
    measured("maximumEngineEffectKW"),
    "hybridCategory",
    // The longest captions: a third truncates them in a narrow column, so the
    // min/max pair takes a half each.
    { ...measured("minOperatingTemperature"), width: "1/2" },
    { ...measured("maxOperatingTemperature"), width: "1/2" },
  ],
  Passenger: [
    "fareClass",
    "totalCapacity",
    "seatingCapacity",
    "standingCapacity",
    "specialPlaceCapacity",
    "wheelchairPlaceCapacity",
  ],
  Cargo: ["pushchairCapacity", "pramPlaceCapacity", "bicycleRackCapacity", "carLoading"],
  Vehicles: [
    {
      field: "vehicles",
      entries: [
        { field: "name", label: "Name" },
        { field: "operationalNumber", label: "Op. No." },
      ],
    },
  ],
};

// ── Vehicle ───────────────────────────────────────────────────────────────

// General, then the 3D geometry overrides (a set value beats the type's).
// `transportType` is a distilled `reference`; the `…Date` fields are `date`
// controls; the validity bounds (hoisted from `validBetween`) and the meta
// timestamps are `datetime`. `lifecycleStatus` is sobek-derived, so locked.
// Dates pair up two to a row; the registration number is halved to sit beside
// its date (a per-field `width`).
export const vehicleLayout: VehicleLayout = {
  General: [
    "name",
    { field: "registrationNumber", width: "1/2" },
    "registrationDate",
    { field: "transportType", label: "VehicleType", options: () => vehicleTypeRefs },
    "operationalNumber",
    "chassisNumber",
    "buildDate",
    "completionDate",
    { field: "fromDate", label: "Valid from" },
    { field: "toDate", label: "Valid to" },
    "lifecycleStatus",
    "callsign",
    "phoneNumber",
    { field: "mmsi", label: "MMSI" },
    "transponderType",
    { field: "transponderId", label: "Transponder ID" },
    "description",
  ],
  Geometry: [...geometry],
};
