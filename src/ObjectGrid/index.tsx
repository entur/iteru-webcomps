/**
 * Read-only grid for an array-of-objects relation (a `grid` field — see
 * `FieldKind`). Columns are derived at runtime from the row data: scalar leaves,
 * `MultilingualString` values and lists of scalars (joined, e.g. axle positions)
 * are shown; nested objects and lists of objects are skipped.
 * Always presentational — relations are `serverManaged`, never edited here.
 */
import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { LazyDataGrid } from "../shared/LazyDataGrid";
import type { DataGridProps, GridColDef } from "@mui/x-data-grid";
import { humanize } from "../shared/humanize";

/**
 * A single grid column: a row-object property key plus an optional label
 * override (defaults to the humanized key). This is the Grid's own, minimal prop
 * contract — deliberately independent of the form's richer `FieldEntry`, which is
 * structurally assignable to it. Owned here so the Grid depends on no form type.
 */
export interface ColumnSpec {
  field: string;
  label?: string;
}

/* ------------------------------------------------------------------ *\
   Constants
\* ------------------------------------------------------------------ */

const ID_KEYS = ["netexId", "id"] as const; // first present → row id
const LIST_SEP = ", "; // between the items of a list-of-scalars cell
const ROW_H = 40,
  HEAD_H = 48,
  PAD = 4,
  MAX_H = 420; // grid sizing (px)
const COL = { flex: 1, minWidth: 90 } as const; // shared column defaults (narrow-rail friendly)

/** Transparent data cells (column headers / `th` keep their default background). */
const GRID_SX = {
  backgroundColor: "transparent",
  "& .MuiDataGrid-cell": { backgroundColor: "transparent" },
} as const;

/* ------------------------------------------------------------------ *\
   Cell helpers
\* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
/** MultilingualString-ish: an object carrying a `value` leaf. */
const isMls = (v: unknown): v is { value?: unknown } =>
  isObj(v) && "value" in v;
const isScalar = (v: unknown): boolean =>
  v == null || ["string", "number", "boolean"].includes(typeof v);
const isScalarList = (v: unknown): v is unknown[] => Array.isArray(v) && v.every(isScalar);
/** Renderable in a flat cell: scalar, MultilingualString (shown as `.value`), or
 *  a list of scalars (shown joined). */
const renderable = (v: unknown): boolean => isScalar(v) || isMls(v) || isScalarList(v);
const cell = (v: unknown): unknown =>
  isMls(v) ? (v.value ?? "") : isScalarList(v) ? v.filter((x) => x != null).join(LIST_SEP) : v;

/**
 * Pick the columns to show: the union of row keys, minus any key that carries a
 * non-renderable sample (nested object / array) in any row. Insertion order of
 * first appearance is preserved.
 */
const deriveColumns = (rows: readonly Obj[]): string[] => {
  const order: string[] = [];
  const seen = new Set<string>();
  const bad = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) (seen.add(k), order.push(k));
      const v = row[k];
      if (v != null && !renderable(v)) bad.add(k);
    }
  }
  return order.filter((k) => !bad.has(k));
};

const rowId = (row: Obj, i: number): string | number => {
  for (const k of ID_KEYS) if (row[k] != null) return row[k] as string | number;
  return i;
};

/* ------------------------------------------------------------------ *\
   Component
\* ------------------------------------------------------------------ */

export interface ObjectGridProps {
  /** The relation array (the field's raw value). */
  rows: unknown;
  /** Field label. Always the grid's `aria-label`; shown visibly only when
   *  `showLabel` (see below). */
  label: string;
  /** Draw a visible caption above the grid. The form sets this true only when
   *  the grid shares its section with other fields; alone in a section, the
   *  section tab/heading already names it, so a caption would double the label.
   *  Styled as a field caption (not `subtitle2`) so it never reads as a heading. */
  showLabel?: boolean;
  /** Explicit column order + labels (the layout entry's `entries`). Each `field`
   *  is a row-object property key; `label` overrides the humanized default.
   *  Omit → columns auto-derived from the row data in first-seen order. */
  cols?: ColumnSpec[];
  /** Passthrough to the underlying MUI X `DataGrid` (form-level `slotProps.grid.dataGrid`).
   *  Applied over the lib defaults; `sx` is merged with `GRID_SX`, while
   *  `rows`/`columns`/`aria-label` stay owned by this component. */
  dataGrid?: Partial<DataGridProps>;
}

/**
 * Render a relation array as a read-only MUI X DataGrid.
 *
 * @param rows      The array-of-objects value (anything non-array renders empty).
 * @param label     Accessible name; visible caption when `showLabel`.
 * @param showLabel Whether to draw the visible caption (set by the form).
 * @param cols      Explicit column order/labels; omit to auto-derive.
 * @returns The grid node (or an empty-state line when there are no rows).
 */
export function ObjectGrid({
  rows,
  label,
  showLabel,
  cols,
  dataGrid,
}: ObjectGridProps): React.ReactNode {
  // Memoize on `rows` so the column/row derivations below stay cached across
  // unrelated parent re-renders (a fresh filter() each render would defeat them).
  const data = useMemo<Obj[]>(
    () => (Array.isArray(rows) ? (rows.filter(isObj) as Obj[]) : []),
    [rows],
  );

  // Explicit `cols` win (order + labels); otherwise derive every renderable
  // column from the row data, labeled by `humanize`.
  const columns = useMemo<GridColDef[]>(
    () =>
      cols?.length
        ? cols.map((c) => ({
            ...COL,
            field: c.field,
            headerName: c.label ?? humanize(c.field),
          }))
        : deriveColumns(data).map((k) => ({
            ...COL,
            field: k,
            headerName: humanize(k),
          })),
    [data, cols],
  );
  const gridRows = useMemo(
    () =>
      data.map((row, i) => {
        const out: Obj = { id: rowId(row, i) };
        for (const c of columns) out[c.field] = cell(row[c.field]);
        return out;
      }),
    [data, columns],
  );

  const height = Math.min(
    HEAD_H + Math.max(gridRows.length, 1) * ROW_H + PAD,
    MAX_H,
  );

  return (
    // `minWidth: 0` lets the grid scroll horizontally *within* this box instead
    // of forcing a flex parent (e.g. a stacked section) wider than its rail.
    <Box sx={{ width: "100%", minWidth: 0 }}>
      {showLabel ? (
        <Typography
          variant="caption"
          component="div"
          color="text.secondary"
          sx={{ mb: 0.5 }}
        >
          {label}
        </Typography>
      ) : null}
      {gridRows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          None
        </Typography>
      ) : (
        <Box sx={{ height, width: "100%", minWidth: 0 }}>
          <LazyDataGrid
            fallbackHeight={height}
            fallbackLabel="Init…"
            density="compact"
            hideFooter
            disableRowSelectionOnClick
            disableColumnMenu
            // Consumer overrides spread before the owned props so
            // `rows`/`columns`/`aria-label` stay fixed; `sx` is merged so the
            // transparent `GRID_SX` survives unless the caller's `sx` clobbers it.
            {...dataGrid}
            aria-label={label}
            rows={gridRows}
            columns={columns}
            sx={[GRID_SX, ...(Array.isArray(dataGrid?.sx) ? dataGrid.sx : [dataGrid?.sx])]}
          />
        </Box>
      )}
    </Box>
  );
}
