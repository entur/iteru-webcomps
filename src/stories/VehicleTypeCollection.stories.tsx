/**
 * `createEntityCollection` over 250 seeded `VehicleType` rows, rendered bare:
 * no wrapper, no heading, no story-owned buttons. Every prop worth driving is a
 * Storybook control (`view`, `tools`, `filterMode`), and `onQueryChange` logs
 * to the Actions panel, so the component is exercised directly.
 *
 * The filter popover offers only what sobek's `VehicleTypeFilter` accepts;
 * other fields are listed disabled. Patched fields (`manufacturer`,
 * `fullCharge`, `carLoading`) are generated below but never shown: the
 * collection excludes them.
 *
 * In `cards-big`, a bus row's card shows its 3D bitmap (`BusShot`, shot one
 * at a time on a shared off-screen stage); other modes show a generic picture.
 * The query starts filtered to buses — the only rows 3D can draw — so the
 * demo opens on them; the chip clears it.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import {
  createEntityCollection,
  vehicleTypeFields,
  VehicleTypeFilterFields,
  type CollectionTool,
  type CollectionView,
  type VehicleType,
} from "../index";
import { ALL_TOOLS, defaultCollectionQuery, type CollectionQuery } from "../EntityCollection/types";
import { UNIT_LABELS } from "./initLayouts";
import { TransportMode } from "../generated/sobekTypes";
import { BusShot, GenericVehicle } from "./BusShot";
import { genVehicleTypes } from "./genVehicleTypes";

/* ------------------------------------------------------------------ *\
   Constants
\* ------------------------------------------------------------------ */

const ROW_COUNT = 250; // rows the generator emits
const SEED = 0x9e3779b9; // fixed PRNG seed → reproducible grid across reloads

/* ------------------------------------------------------------------ *\
   Stories
\* ------------------------------------------------------------------ */

const VIEWS: CollectionView[] = ["grid", "cards-sm", "cards-big"];
const TOOLS: CollectionTool[] = [...ALL_TOOLS];
const FILTER_MODES = ["client", "server"] as const;
// Buses are the generator's only rows with 3D geometry: start on them.
const START_QUERY: CollectionQuery = {
  ...defaultCollectionQuery,
  filters: { transportMode: [TransportMode.Bus] },
};

const VehicleTypeCollection = createEntityCollection(vehicleTypeFields, {
  filterFields: VehicleTypeFilterFields,
});

/** A bus draws itself; anything else gets the generic picture. Read by
 *  `cards-big` only. */
const cardMedia = (row: unknown) => {
  const vt = row as VehicleType;
  return vt.transportMode === TransportMode.Bus ? <BusShot vt={vt} /> : <GenericVehicle />;
};

type CollectionProps = Parameters<typeof VehicleTypeCollection<VehicleType>>[0];

/** The collection holding its query from `START_QUERY`. A component of its
 *  own: React state in the story's render function, beside `useArgs`, makes
 *  every query change re-run that function outside Storybook's hook context,
 *  where `useArgs` throws. */
function StartsOnBuses(props: CollectionProps) {
  const [query, setQuery] = useState(START_QUERY);
  return (
    <VehicleTypeCollection
      {...props}
      query={query}
      onQueryChange={next => {
        setQuery(next);
        props.onQueryChange?.(next);
      }}
    />
  );
}

const meta: Meta<typeof VehicleTypeCollection> = {
  title: "Collection/VehicleType",
  component: VehicleTypeCollection,
  // `view` is an arg, so the collection is controlled: the toolbar's switch
  // writes its pick back to the arg, keeping it and the control in step.
  // Storybook hooks only here; the query lives in `StartsOnBuses`.
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <StartsOnBuses
        {...(args as CollectionProps)}
        onViewChange={view => {
          args.onViewChange?.(view);
          updateArgs({ view });
        }}
      />
    );
  },
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
      { field: "length", label: UNIT_LABELS.length },
      { field: "width", label: UNIT_LABELS.width },
      { field: "height", label: UNIT_LABELS.height },
      { field: "weight", label: UNIT_LABELS.weight },
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
    cardMedia,
  },
  argTypes: {
    view: { control: "inline-radio", options: VIEWS },
    tools: { control: "check", options: TOOLS },
    filterMode: { control: "inline-radio", options: FILTER_MODES },
    onQueryChange: { action: "queryChange" },
    onViewChange: { action: "viewChange" },
    // 250 row objects are not worth a JSON editor; `query` is the render's own
    // state (see `render`).
    rows: { control: false },
    query: { control: false },
    actions: { control: false },
    cardMedia: { control: false },
  },
};
export default meta;
type Story = StoryObj<typeof VehicleTypeCollection>;

export const Grid: Story = {};
export const CardsSm: Story = { args: { view: "cards-sm" } };
export const CardsBig: Story = { args: { view: "cards-big" } };
export const SearchOnly: Story = { args: { tools: ["search"] } };
export const NoTools: Story = { args: { tools: [] } };
