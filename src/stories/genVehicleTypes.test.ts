import { describe, expect, it } from "vitest";
import { validate } from "@entur/iteru-3dbus/core";
import { toBusInput } from "../index";
import { TransportMode } from "../generated/sobekTypes";
import { genVehicleTypes } from "./genVehicleTypes";

const ROWS = genVehicleTypes(250, 0x9e3779b9);
const BUSES = ROWS.filter(r => r.transportMode === TransportMode.Bus);

describe("genVehicleTypes — bus rows", () => {
  it("has buses to draw, rigid and articulated", () => {
    expect(BUSES.length).toBeGreaterThan(20);
    const counts = new Set(BUSES.map(b => b.sections?.length));
    expect([...counts].sort()).toEqual([1, 2]);
  });

  it("gives every bus an input 3dbus accepts, with no length drift", () => {
    for (const vt of BUSES) {
      const r = toBusInput(vt);
      expect(r.ok && { errors: validate(r.inp), drift: r.lengthDrift }).toEqual({ errors: [], drift: undefined });
    }
  });

  it("is reproducible per seed", () => {
    expect(genVehicleTypes(250, 0x9e3779b9)).toEqual(ROWS);
  });
});
