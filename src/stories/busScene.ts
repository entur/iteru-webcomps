/**
 * What the 3D previews share (#60): building a centred bus for a stage, and
 * saying in words why a record can't be drawn. Story-only, like its users
 * (`BusView`, `BusShot`).
 */
import { MM, faces, mkBus, total, type BusGroup } from "@entur/iteru-3dbus";
import type { BusInput, MissingField } from "../index";
import { humanize } from "../shared/humanize";
import { UNIT_LABELS } from "./initLayouts";

/** The camera pose every preview opens on. */
export const VIEW = "quarter";

/**
 * Build a bus centred on the origin (3dbus puts the front at x = 0).
 *
 * @param inp    a valid 3dbus input
 * @param detail texture density, 1 = full (3dbus default)
 * @returns the group and its overall length in scene units
 */
export const build = (inp: BusInput, detail?: number): { group: BusGroup; len: number } => {
  const group = mkBus(inp, faces(inp), detail === undefined ? undefined : { detail }), len = total(inp) * MM;
  group.position.x = -len / 2;
  return { group, len };
};

const labelOf = (key: string): string =>
  (UNIT_LABELS as Record<string, string>)[key] ?? humanize(key);

/**
 * "on the VehicleType: Manufacturer; on the Vehicle: Base colour" — grouped by
 * the form that fills them, in the order they were reported.
 *
 * @param missing `toBusInput`'s missing fields
 * @returns the fields as one phrase
 */
export const phrase = (missing: MissingField[]): string =>
  [...new Set(missing.map(m => m.on))]
    .map(on => `on the ${on}: ${missing.filter(m => m.on === on).map(m => labelOf(m.key)).join(", ")}`)
    .join("; ");
