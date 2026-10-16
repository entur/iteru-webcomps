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
 */
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
import { ALL_TOOLS } from "../EntityCollection/types";
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

const VehicleTypeCollection = createEntityCollection(vehicleTypeFields, {
  filterFields: VehicleTypeFilterFields,
});

/** A bus draws itself; anything else gets the generic picture. Read by
 *  `cards-big` only. */
const cardMedia = (row: unknown) => {
  const vt = row as VehicleType;
  return vt.transportMode === TransportMode.Bus ? <BusShot vt={vt} /> : <GenericVehicle />;
};

const meta: Meta<typeof VehicleTypeCollection> = {
  title: "Collection/VehicleType",
  component: VehicleTypeCollection,
  // `view` is an arg, so the collection is controlled: the toolbar's switch
  // writes its pick back to the arg, keeping it and the control in step.
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <VehicleTypeCollection
        {...args}
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
    // 250 row objects are not worth a JSON editor; `query` left unset keeps
    // the component uncontrolled, which is the mode worth clicking through.
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
