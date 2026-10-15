/**
 * Data fixtures for the form stories — the sample entities the forms render and
 * the read-side seed the data-aware story serves. Each story mints its own form
 * instance from the factory; layout config (section/field arrangement) and the
 * reference option-lists live in `initLayouts.ts`. Keeping these apart separates
 * *what's in* an entity from *how* its fields are grouped, and from *what* renders it.
 */
import type { Vehicle, VehicleType } from "../index";
// Generated `Vehicle` (aliased) is the nested grid-row shape on VehicleType;
// distinct from the index `Vehicle` entity used as the Vehicle-form value.
import { TransportMode, type Vehicle as GenVehicle } from "../generated/sobekTypes";

// ── VehicleType ─────────────────────────────────────────────────────────────

const sampleVehicles: GenVehicle[] = [
  { netexId: "VEH:Vehicle:701", name: { lang: "en", value: "Unit 701" }, operationalNumber: "701", dataOwnerRef: "" },
  { netexId: "VEH:Vehicle:702", name: { lang: "en", value: "Unit 702" }, operationalNumber: "702", dataOwnerRef: "" },
];

// The three types are buses from the @entur/iteru-3dbus examples (entur/3dbus
// `examples/`), converted from the bus input's mm to the form's metres, so the
// overlay's 3D geometry (#51) describes real vehicles. Tyre diameters come from
// the size where the example gives one (rim + 2 × aspect × width).
export const vehicleTypeSample: VehicleType = {
  netexId: "VEH:VehicleType:1",
  name: { lang: "en", value: "Volvo 8900 LE 12.4 m" }, // volvo-8900.json
  transportMode: TransportMode.Bus,
  deckPlan: { netexId: "VEH:DeckPlan:1", dataOwnerRef: "" },
  manufacturer: "Volvo",
  length: 12.396,
  width: 2.55,
  height: 3.3,
  lowFloor: false, // low entry, not step-free throughout
  dataOwnerRef: "",
  vehicles: sampleVehicles,
  sections: [{ id: "S1", length: 12.396, axles: [2.769, 9.099] }],
  tyreDiameter: 1.044, // 295/80 R22.5
  baseColor: "#E9ECEC",
  roofEquipment: 0,
};

/**
 * A few VehicleTypes keyed by `netexId` — the read-side seed the data-aware host
 * story serves so its VehicleType list has more than one record. Each derives
 * from {@link vehicleTypeSample}, overriding the identifying fields.
 */
export const vehicleTypeSeed: Record<string, VehicleType> = {
  [vehicleTypeSample.netexId]: vehicleTypeSample,
  "VEH:VehicleType:2": {
    ...vehicleTypeSample,
    netexId: "VEH:VehicleType:2",
    name: { lang: "en", value: "BusNordic I:15 DD" }, // busnordic/bn-i-15-dd.json
    deckPlan: { netexId: "VEH:DeckPlan:2", dataOwnerRef: "" },
    manufacturer: undefined, // a Bus Nordic reference body, not a make
    length: 14.9,
    height: 4.25,
    lowFloor: false,
    vehicles: [],
    // Three axles: steer, drive, tag.
    sections: [{ id: "S1", length: 14.9, axles: [2.7, 9.5, 10.9] }],
    tyreDiameter: 0.957, // 275/70 R22.5
    baseColor: "#1F6FB2",
  },
  "VEH:VehicleType:3": {
    ...vehicleTypeSample,
    netexId: "VEH:VehicleType:3",
    name: { lang: "en", value: "Mercedes-Benz Citaro G" }, // citaro-g.json
    deckPlan: { netexId: "VEH:DeckPlan:3", dataOwnerRef: "" },
    manufacturer: "Mercedes-Benz",
    length: 18.2, // 10.6 + 0.6 bellows + 7.0
    height: 3.1,
    lowFloor: true,
    vehicles: [],
    // Articulated: the trailer section carries the bellows ahead of it.
    sections: [
      { id: "S1", length: 10.6, axles: [2.7, 8.6] },
      { id: "S2", length: 7.0, axles: [4.7], bellowsAhead: 0.6 },
    ],
    tyreDiameter: 0.95,
    baseColor: "#D6001C",
    roofEquipment: 0.25,
  },
};

// ── Vehicle ───────────────────────────────────────────────────────────────

export const vehicleSample: Vehicle = {
  netexId: "VEH:Vehicle:701",
  name: { lang: "en", value: "Unit 701" },
  registrationNumber: "AB 12345",
  transportType: { netexId: "VEH:VehicleType:1", dataOwnerRef: "" },
  operationalNumber: "701",
  chassisNumber: "CHS-0000-701",
  buildDate: "2019-06-01",
  registrationDate: "2020-01-15",
  description: { lang: "en", value: "City bus, low entry" },
  dataOwnerRef: "",
  created: "2020-01-15T09:30:00Z",
  changed: "2024-03-02T14:12:00Z",
  changedBy: "importer",
  version: "3",
};

/**
 * A few Vehicles keyed by `netexId` — the read-side seed the data-aware host
 * story serves through its mock endpoint, so its list has more than one record
 * to switch between. Each derives from {@link vehicleSample}, overriding just
 * the identifying fields.
 */
export const vehicleSeed: Record<string, Vehicle> = {
  [vehicleSample.netexId]: vehicleSample,
  "VEH:Vehicle:702": {
    ...vehicleSample,
    netexId: "VEH:Vehicle:702",
    name: { lang: "en", value: "Unit 702" },
    registrationNumber: "CD 67890",
    transportType: { netexId: "VEH:VehicleType:2", dataOwnerRef: "" },
    operationalNumber: "702",
    chassisNumber: "CHS-0000-702",
    description: { lang: "en", value: "Double-deck regional bus" },
  },
  "VEH:Vehicle:703": {
    ...vehicleSample,
    netexId: "VEH:Vehicle:703",
    name: { lang: "en", value: "Bus 12" },
    registrationNumber: "EF 11223",
    transportType: { netexId: "VEH:VehicleType:3", dataOwnerRef: "" },
    operationalNumber: "12",
    chassisNumber: "CHS-0000-012",
    buildDate: "2022-03-10",
    registrationDate: "2022-09-01",
    description: { lang: "en", value: "Articulated city bus" },
    // An override: this bus runs in the yellow livery, not its type's red.
    baseColor: "#F2B705",
  },
};
