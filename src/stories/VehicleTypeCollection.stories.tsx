/**
 * `createEntityCollection` over 250 seeded `VehicleType` rows, rendered bare:
 * no wrapper, no heading, no story-owned buttons. Every prop worth driving is a
 * Storybook control (`view`, `tools`, `filterMode`), and `onQueryChange` logs
 * to the Actions panel, so the component is exercised directly.
 *
 * The filter popover offers only what sobek's `VehicleTypeFilter` accepts;
 * other fields are listed disabled. Patched fields (`manufacturer`, `range`,
 * `fullCharge`, `carLoading`) are generated below but never shown: the
 * collection excludes them.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createEntityCollection,
  vehicleTypeFields,
  VehicleTypeFilterFields,
  type CollectionTool,
  type CollectionView,
  type VehicleType,
} from "../index";
import { ALL_TOOLS } from "../EntityCollection/types";
import {
  FareClass,
  PropulsionType,
  TransportMode,
} from "../generated/sobekTypes";

/* ------------------------------------------------------------------ *\
   Constants
\* ------------------------------------------------------------------ */

const ROW_COUNT = 250; // rows the generator emits
const SEED = 0x9e3779b9; // fixed PRNG seed → reproducible grid across reloads

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

/**
 * Build `n` randomized `VehicleType` rows from a seeded PRNG.
 *
 * @param n    How many rows to emit.
 * @param seed PRNG seed; same seed → identical rows (reproducible showcase).
 * @returns An array of fully-populated `VehicleType` objects.
 */
const genVehicleTypes = (n: number, seed: number): VehicleType[] => {
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
    return {
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
      weight: num(12, 95),
      range: num(180, 1200, 0),
      fullCharge: num(40, 600, 0),
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
  });
};

/* ------------------------------------------------------------------ *\
   Stories
\* ------------------------------------------------------------------ */

const VIEWS: CollectionView[] = ["grid", "cards"];
const TOOLS: CollectionTool[] = [...ALL_TOOLS];
const FILTER_MODES = ["client", "server"] as const;

const VehicleTypeCollection = createEntityCollection(vehicleTypeFields, {
  filterFields: VehicleTypeFilterFields,
});

const meta: Meta<typeof VehicleTypeCollection> = {
  title: "Collection/VehicleType",
  component: VehicleTypeCollection,
  args: {
    rows: genVehicleTypes(ROW_COUNT, SEED),
    view: "grid",
    tools: TOOLS,
    filterMode: "client",
    // Registry order is alphabetical and most of the 30-odd fields are empty
    // in the seed, so the grid gets the same curated set a host would pass.
    columns: [
      "name",
      "netexId",
      "version",
      "transportMode",
      "propulsionTypes",
      "length",
      "width",
      "height",
      "weight",
      "seatingCapacity",
      "standingCapacity",
      "fareClass",
      "lowFloor",
      "selfPropelled",
      "changed",
    ],
    card: {
      title: "name",
      subtitle: "netexId",
      fields: [
        "transportMode",
        "propulsionTypes",
        "length",
        "seatingCapacity",
        "lowFloor",
      ],
    },
  },
  argTypes: {
    view: { control: "inline-radio", options: VIEWS },
    tools: { control: "check", options: TOOLS },
    filterMode: { control: "inline-radio", options: FILTER_MODES },
    onQueryChange: { action: "queryChange" },
    // 250 row objects are not worth a JSON editor; `query` left unset keeps
    // the component uncontrolled, which is the mode worth clicking through.
    rows: { control: false },
    query: { control: false },
    actions: { control: false },
  },
};
export default meta;
type Story = StoryObj<typeof VehicleTypeCollection>;

export const Grid: Story = {};
export const Cards: Story = { args: { view: "cards" } };
export const SearchOnly: Story = { args: { tools: ["search"] } };
export const NoTools: Story = { args: { tools: [] } };
