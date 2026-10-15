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
// The client names its own instances — the library exports only the factory.

const DumbVehicleTypeForm =
  createAbstractEntityDetailsForm<VehicleType>(vehicleTypeFields);

const meta: Meta<typeof DumbVehicleTypeForm> = {
  title: "FormImplementations/VehicleTypeForm",
  component: DumbVehicleTypeForm,
  args: { mode: "edit", layout: vehicleTypeLayout },
};
export default meta;
type Story = StoryObj<typeof DumbVehicleTypeForm>;

// Controlled wrapper so the story round-trips edits.
const Controlled = (args: EntityDetailsFormProps<VehicleType>) => {
  const [value, setValue] = useState<VehicleType>(vehicleTypeSample);
  return <DumbVehicleTypeForm {...args} value={value} onChange={setValue} />;
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
