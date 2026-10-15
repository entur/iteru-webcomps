import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  vehicleTypeFields,
  createAbstractEntityDetailsForm,
  type VehicleType,
  type EntityDetailsFormProps,
} from "../index";
import { vehicleTypeSample } from "./initDataSets";
import { vehicleTypeLayout } from "./initLayouts";
import { formLookArgs, formLookArgTypes, withFormLook, type FormLookArgs } from "./formControls";
// The client names its own instances — the library exports only the factory.

const DumbVehicleTypeForm =
  createAbstractEntityDetailsForm<VehicleType>(vehicleTypeFields);

/** The form's props plus the story's layout controls (widths, captions). */
type Args = EntityDetailsFormProps<VehicleType> & FormLookArgs;

const meta: Meta<Args> = {
  title: "FormImplementations/VehicleTypeForm",
  component: DumbVehicleTypeForm,
  args: { mode: "edit", layout: vehicleTypeLayout, ...formLookArgs },
  argTypes: formLookArgTypes,
};
export default meta;
type Story = StoryObj<Args>;

// Controlled wrapper so the story round-trips edits.
const Controlled = (args: Args) => {
  const [value, setValue] = useState<VehicleType>(vehicleTypeSample);
  return <DumbVehicleTypeForm {...withFormLook(args)} value={value} onChange={setValue} />;
};

export const Tabs: Story = { render: Controlled };
export const Stacked: Story = {
  render: Controlled,
  args: { variant: "stacked" },
};
export const TabsRO: Story = { render: Controlled, args: { mode: "view" } };
export const IncludeAllViaZeroConfig: Story = {
  render: Controlled,
  args: { layout: undefined },
};
