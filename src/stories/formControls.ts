/**
 * Story-only controls for how the form is laid out — one width radio per
 * control kind and the caption (input label) behaviour — flattened into
 * Storybook args so they can be tuned from the Controls panel. The lib takes
 * them as `widths` and `slotProps`; nothing here is a lib prop of its own.
 */
import type { ArgTypes } from "@storybook/react-vite";
import {
  KIND_WIDTH,
  type ControlSlotProps,
  type FieldKind,
  type FieldWidth,
  type KindWidths,
} from "../index";

const WIDTHS: FieldWidth[] = ["full", "1/2", "1/3", "1/4"];
const KINDS = Object.keys(KIND_WIDTH) as FieldKind[];
/** The TextField-backed kinds: the ones whose caption a host can reach
 *  through `slotProps` (enumMulti / reference pin theirs inside the lib). */
const CAPTIONED = ["text", "number", "name", "enum", "date", "datetime"] as const;

/** `pinned` = the lib's default, label always above the input; `floating` =
 *  MUI's own, the label rests inside an empty input until focus. */
export type Captions = "pinned" | "floating";

/** One flat arg per kind — Storybook has no control for a partial record. */
export type FormLookArgs = { [K in FieldKind as `width_${K}`]?: FieldWidth } & {
  captions?: Captions;
};

const widthKey = (k: FieldKind) => `width_${k}` as const;

/** Defaults: the lib's own, so an untouched panel renders as a host would. */
export const formLookArgs: FormLookArgs = {
  captions: "pinned",
  ...Object.fromEntries(KINDS.map(k => [widthKey(k), KIND_WIDTH[k]])),
};

/** Controls-panel entries: the width radios grouped under "Widths". */
export const formLookArgTypes: Partial<ArgTypes<FormLookArgs & { widths?: KindWidths }>> = {
  captions: {
    control: "inline-radio",
    options: ["pinned", "floating"],
    description:
      "Story-only: the TextField kinds' caption, via `slotProps.<kind>.inputLabel.shrink`. pinned = lib default (always above); floating = MUI default (inside until focus or a value). enumMulti / reference stay pinned.",
  },
  ...Object.fromEntries(
    KINDS.map(k => [
      widthKey(k),
      {
        name: k,
        control: "inline-radio",
        options: WIDTHS,
        description: `Form \`widths.${k}\`: share of the row a \`${k}\` control takes (from sm up). A layout entry's \`width\` still wins.`,
        table: { category: "Widths" },
      },
    ]),
  ),
  // Driven by the flat radios above; an object editor beside them would fight them.
  widths: { table: { disable: true } },
};

/**
 * Collect the width radios back into the form's `widths` prop.
 *
 * @param args story args carrying `width_<kind>` entries
 * @returns the per-kind widths that are set
 */
export const widthsOf = (args: FormLookArgs): KindWidths =>
  Object.fromEntries(
    KINDS.flatMap(k => (args[widthKey(k)] ? [[k, args[widthKey(k)]]] : [])),
  );

/**
 * The `slotProps` that give the TextField kinds the chosen caption behaviour.
 * `floating` hands `shrink` back to MUI; `pinned` adds nothing (lib default).
 *
 * @param captions the chosen behaviour
 * @returns per-kind slotProps to merge into the form's own
 */
export const captionSlots = (captions: Captions = "pinned"): ControlSlotProps =>
  captions === "pinned"
    ? {}
    : Object.fromEntries(CAPTIONED.map(k => [k, { inputLabel: { shrink: undefined } }]));

/**
 * Split story args into the form's own props and the two these controls feed.
 *
 * @param args story args: form props plus {@link FormLookArgs}
 * @returns the form props, with `widths` and caption `slotProps` derived
 */
export const withFormLook = <P extends { slotProps?: ControlSlotProps }>(
  args: P & FormLookArgs,
): P & { widths: KindWidths } => {
  const rest = Object.fromEntries(
    Object.entries(args).filter(([k]) => k !== "captions" && !k.startsWith("width_")),
  ) as P;
  return {
    ...rest,
    widths: widthsOf(args),
    slotProps: { ...captionSlots(args.captions), ...rest.slotProps },
  };
};
