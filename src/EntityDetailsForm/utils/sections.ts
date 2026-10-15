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
import type { FieldEntry, FieldSpec, Layout, LayoutItem, PatchedDisplay, RefOption } from '../types';

/** A field resolved for rendering: its registry key, display label, the optional
 *  explicit grid column entries, and (for a `reference`) the option-dataset
 *  closure — both from the layout. */
export interface ResolvedField {
  key: string;
  label: string;
  cols?: FieldEntry[];
  options?: () => RefOption[];
}

/** A named group of resolved fields. `label` is `''` for the layout-less case. */
export interface Section {
  label: string;
  fields: ResolvedField[];
}

/** Width of the column holding a patched field's `*`, to the right of the
 *  control. Shared so the skeleton reserves exactly what the form will. */
export const PATCH_MARK_COL_PX = 16;

/**
 * Whether any field these sections render is `patched`. The mark column is
 * reserved for the whole form or not at all: per row, a marked control would be
 * narrower than its neighbours; per section, a tab switch would resize them.
 *
 * @param fields generated `FIELDS` registry for the entity
 * @param sections the sections being rendered
 * @returns `true` when the form needs the trailing mark column
 */
export const hasPatched = (fields: Record<string, FieldSpec>, sections: Section[]): boolean =>
  sections.some(s => s.fields.some(f => fields[f.key].patched));

/**
 * Whether the form reserves the trailing mark column: only in `mark` display,
 * and only when a rendered field is patched. Shared by the form and its skeleton.
 *
 * @param fields generated `FIELDS` registry for the entity
 * @param sections the sections being rendered
 * @param patched how patched fields are shown
 * @returns `true` when the form needs the trailing mark column
 */
export const markColumn = (
  fields: Record<string, FieldSpec>,
  sections: Section[],
  patched: PatchedDisplay
): boolean => patched === 'mark' && hasPatched(fields, sections);

/** Normalize a `LayoutItem` to `{ field, label?, entries?, options? }`. Also
 *  used by the collection's column whitelist, which takes the same items. */
export const norm = (
  item: LayoutItem
): { field: string; label?: string; entries?: FieldEntry[]; options?: () => RefOption[] } =>
  typeof item === 'string'
    ? { field: item }
    : { field: item.field, label: item.label, entries: item.entries, options: item.options };

/**
 * Resolve a registry + optional layout into the sections to render.
 *
 * No layout → one unnamed section holding every registry field, in registry
 * order. With a layout it is a whitelist: unknown keys are dropped, a key
 * repeated across sections lands only in the first, and empty sections are
 * removed so neither renderer draws a heading over nothing. `patched: 'hide'`
 * drops patched fields on both paths, before the empty-section rule.
 *
 * @param fields generated `FIELDS` registry for the entity
 * @param layout optional section whitelist
 * @param patched how patched fields are shown; only `hide` changes the shape
 * @returns non-empty sections, in layout order
 */
export function resolveSections(
  fields: Record<string, FieldSpec>,
  layout?: Layout,
  patched: PatchedDisplay = 'mark'
): Section[] {
  const shown = (key: string) => !!fields[key] && !(patched === 'hide' && fields[key].patched);
  if (!layout) {
    const all = Object.keys(fields)
      .filter(shown)
      .map(key => ({ key, label: humanize(key) }));
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
          cols: e.entries,
          options: e.options,
        })),
    }))
    .filter(s => s.fields.length > 0);
}
