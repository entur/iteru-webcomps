/**
 * Section/field resolution — the form's *shape*, independent of rendering.
 *
 * Shared by `components/abstractForm` (which draws the controls) and
 * `components/FormSkeleton` (which draws placeholders in their place). One
 * source of truth is the point: a skeleton derived from the same call can never
 * disagree with the form it stands in for, so a new entity or an edited
 * `layout` reshapes both at once with no hand-tuned row counts.
 */
import { humanize } from '../../shared/humanize';
import type {
  FieldEntry,
  FieldKind,
  FieldSpec,
  FieldWidth,
  KindWidths,
  Layout,
  LayoutItem,
  LayoutVariant,
  PatchedDisplay,
  RefOption,
} from '../types';

/** A field resolved for rendering: its registry key, display label, its share
 *  of the row, the optional explicit grid column entries, (for a `reference`)
 *  the option-dataset closure, and the help text — all from the layout. */
export interface ResolvedField {
  key: string;
  label: string;
  width: FieldWidth;
  cols?: FieldEntry[];
  options?: () => RefOption[];
  help?: string;
}

/** A named group of resolved fields. `label` is `''` for the layout-less case. */
export interface Section {
  label: string;
  fields: ResolvedField[];
}

/** Default share of a row per control kind: a number or a date doesn't need a
 *  name's width, so narrow kinds pack side by side. */
export const KIND_WIDTH: Record<FieldKind, FieldWidth> = {
  number: '1/3',
  date: '1/2',
  datetime: '1/2',
  switch: '1/2',
  text: 'full',
  name: 'full',
  enum: 'full',
  enumMulti: 'full',
  reference: 'full',
  grid: 'full',
};

/** Columns a width spans on the default 12-column MUI `Grid`. */
const WIDTH_SPAN: Record<FieldWidth, number> = { full: 12, '1/2': 6, '1/3': 4, '1/4': 3 };

/**
 * The responsive `Grid` `size` for a width: full below `sm`, the fraction from
 * there up. Shared so the skeleton places a row exactly as the form will.
 *
 * @param width the field's resolved width
 * @returns a `size` prop for an MUI `Grid` item
 */
export const gridSize = (width: FieldWidth): { xs: number; sm: number } => ({
  xs: WIDTH_SPAN.full,
  sm: WIDTH_SPAN[width],
});

/** Width of the cell holding a patched field's `*`, to the right of the
 *  control. Shared so the skeleton narrows a row exactly as the form will. */
export const PATCH_MARK_COL_PX = 16;

/**
 * Whether a field's row carries the trailing `*` cell. Decided per row: only a
 * marked control gives up the cell's width, every other one keeps the full row.
 * Shared by the form and its skeleton.
 *
 * @param spec the field's registry entry
 * @param patched how patched fields are shown
 * @returns `true` when the row ends in the mark cell
 */
export const marked = (spec: FieldSpec, patched: PatchedDisplay): boolean =>
  patched === 'mark' && !!spec.patched;

/** Normalize a `LayoutItem` to `{ field, label?, width?, entries?, options?, help? }`.
 *  Also used by the collection's column whitelist, which takes the same items. */
export const norm = (
  item: LayoutItem
): {
  field: string;
  label?: string;
  width?: FieldWidth;
  entries?: FieldEntry[];
  options?: () => RefOption[];
  help?: string;
} =>
  typeof item === 'string'
    ? { field: item }
    : {
        field: item.field,
        label: item.label,
        width: item.width,
        entries: item.entries,
        options: item.options,
        help: item.help,
      };

/**
 * Resolve a registry + optional layout into the sections to render.
 *
 * No layout → one unnamed section holding every registry field, in registry
 * order. With a layout it is a whitelist: unknown keys are dropped, a key
 * repeated across sections lands only in the first, and empty sections are
 * removed so neither renderer draws a heading over nothing. `patched: 'hide'`
 * drops patched fields on both paths, before the empty-section rule. Each
 * field's width is the layout entry's, else `widths` for its kind, else
 * `KIND_WIDTH` — so a zero-config form packs its numbers too.
 *
 * @param fields generated `FIELDS` registry for the entity
 * @param layout optional section whitelist
 * @param patched how patched fields are shown; only `hide` changes the shape
 * @param widths form-level width per kind, over `KIND_WIDTH`
 * @returns non-empty sections, in layout order
 */
export function resolveSections(
  fields: Record<string, FieldSpec>,
  layout?: Layout,
  patched: PatchedDisplay = 'mark',
  widths?: KindWidths
): Section[] {
  const shown = (key: string) => !!fields[key] && !(patched === 'hide' && fields[key].patched);
  const widthOf = (key: string, own?: FieldWidth): FieldWidth =>
    own ?? widths?.[fields[key].kind] ?? KIND_WIDTH[fields[key].kind];
  if (!layout) {
    const all = Object.keys(fields)
      .filter(shown)
      .map(key => ({ key, label: humanize(key), width: widthOf(key) }));
    return all.length ? [{ label: '', fields: all }] : [];
  }
  const seen = new Set<string>();
  return Object.entries(layout)
    .map(([label, items]) => ({
      label,
      fields: items
        .map(norm)
        .filter(e => shown(e.field) && !seen.has(e.field) && (seen.add(e.field), true))
        .map(e => ({
          key: e.field,
          label: e.label ?? humanize(e.field),
          width: widthOf(e.field, e.width),
          cols: e.entries,
          options: e.options,
          help: e.help,
        })),
    }))
    .filter(s => s.fields.length > 0);
}

/**
 * The section labels a table of contents can navigate. Only a stacked form with
 * two or more sections is a scroll surface — flat and tabbed forms have nothing
 * to scroll to — so anything else yields `[]`.
 *
 * @param fields generated `FIELDS` registry for the entity
 * @param layout optional section whitelist
 * @param variant presentation; omitted means the form's own default, `tabs`
 * @param patched how patched fields are shown; only `hide` changes the shape
 * @returns the labels in page order, or `[]`
 */
export const tocSections = (
  fields: Record<string, FieldSpec>,
  layout?: Layout,
  variant: LayoutVariant = 'tabs',
  patched: PatchedDisplay = 'mark'
): string[] => {
  const labels = resolveSections(fields, layout, patched).map(s => s.label);
  return variant === 'stacked' && labels.length > 1 ? labels : [];
};
