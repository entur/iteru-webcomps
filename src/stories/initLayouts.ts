/**
 * Layout fixtures for the form stories — the section/field arrangement passed as
 * each form's `layout`, plus the reference option-lists those layouts feed via
 * their `options` closures. Split out of `initDataSets` so presentation config
 * (how fields are grouped) lives apart from the entity data (what's in them).
 */
import type { VehicleLayout, VehicleTypeLayout, RefOption } from "../index";

// ── reference option-lists ────────────────────────────────────────────────
// In a real app these come from a query; here they are static. A layout entry's
// `options` closure captures one — selecting writes `value` (a netexId) into the
// reference field's id leaf, `label` is display-only.

/** Candidate VehicleTypes for `Vehicle.transportType`. */
export const vehicleTypeRefs: RefOption[] = [
  { value: "VEH:VehicleType:1", label: "Class 70 EMU" },
  { value: "VEH:VehicleType:2", label: "Class 80 DMU" },
  { value: "VEH:VehicleType:3", label: "Articulated Tram" },
];

/** Candidate DeckPlans for `VehicleType.deckPlan`. */
export const deckPlanRefs: RefOption[] = [
  { value: "VEH:DeckPlan:1", label: "Single-deck 2+2" },
  { value: "VEH:DeckPlan:2", label: "Double-deck" },
  { value: "VEH:DeckPlan:3", label: "Low-floor articulated" },
];

// ── VehicleType ─────────────────────────────────────────────────────────────

// Object-key order = section order; array order = field order within the
// section. `deckPlan` (a distilled `reference`) sits under `transportMode`;
// `vehicles` is a distilled `grid` (serverManaged) rendered as a read-only table.
export const vehicleTypeLayout: VehicleTypeLayout = {
  General: [
    "name",
    "transportMode",
    { field: "deckPlan", options: () => deckPlanRefs },
    "manufacturer",
    "range",
    "fullCharge",
  ],
  Dimensions: ["length", "width", "height", "weight"],
  Accessibility: ["lowFloor"],
  Environment: [
    "selfPropelled",
    "propulsionTypes",
    "fuelTypes",
    "maximumVelocity",
    "maximumRange",
    "formDragCoefficient",
    "rollResistanceCoefficient",
    "maximumEngineEffectKW",
    "hybridCategory",
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

// Single flat section (its label is unused when alone). `transportType` is a
// distilled `reference`; `buildDate` / `registrationDate` are `date` controls;
// the meta timestamps are `datetime`.
export const vehicleLayout: VehicleLayout = {
  General: [
    "name",
    "registrationNumber",
    { field: "transportType", label: "VehicleType", options: () => vehicleTypeRefs },
    "operationalNumber",
    "chassisNumber",
    "buildDate",
    "registrationDate",
    "description",
  ],
};
