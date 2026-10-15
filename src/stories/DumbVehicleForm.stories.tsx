import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createAbstractEntityDetailsForm,
  vehicleFields,
  type Vehicle,
  type EntityDetailsFormProps,
} from "../index";
import { vehicleSample } from "./initDataSets";
import { vehicleLayout } from "./initLayouts";
import { formLookArgs, formLookArgTypes, withFormLook, type FormLookArgs } from "./formControls";

// The client names its own instances — the library exports only the factory.
const DumbVehicleForm = createAbstractEntityDetailsForm<Vehicle>(vehicleFields);

/** The form's props plus the story's layout controls (widths, captions). */
type Args = EntityDetailsFormProps<Vehicle> & FormLookArgs;

const meta: Meta<Args> = {
  title: "FormImplementations/VehicleForm",
  component: DumbVehicleForm,
  args: { mode: "edit", layout: vehicleLayout, ...formLookArgs },
  argTypes: formLookArgTypes,
};
export default meta;
type Story = StoryObj<Args>;

// Controlled wrapper so the story round-trips edits.
const Controlled = (args: Args) => {
  const [value, setValue] = useState<Vehicle>(vehicleSample);
  return <DumbVehicleForm {...withFormLook(args)} value={value} onChange={setValue} />;
};

export const Default: Story = { render: Controlled };
export const ViewOnly: Story = { render: Controlled, args: { mode: "view" } };
// No layout → every field renders flat (incl. the `datetime` meta timestamps),
// and `transportType` has no `options` closure, so it degrades to a free-text id.
export const ZeroConfig: Story = {
  render: Controlled,
  args: { layout: undefined },
};
