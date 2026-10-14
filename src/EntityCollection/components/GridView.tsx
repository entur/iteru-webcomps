/**
 * Grid view: a MUI X DataGrid that only displays. Sorting and paging run in
 * server mode and the grid's own filtering is off — the rows it gets are the
 * shared pipeline's output, and header clicks / page changes are reported back
 * as query patches.
 */
import { lazy, Suspense, useMemo } from 'react';
import { Box, CircularProgress } from '@mui/material';
import type { DataGridProps, GridColDef, GridDensity, GridValidRowModel } from '@mui/x-data-grid';
import { pageSizesFor, type CollectionLabels, type CollectionQuery, type Column } from '../types';
import { formatValue, rawValue, rowKeys } from '../utils/values';

const COL_MIN_W = 120;
const FALLBACK_H = 240;

/** Same deferral as `ObjectGrid`: the peer dep stays a dynamic import for the
 *  host bundler to split, so a cards-only page never pays for it. */
const DataGrid = lazy(() => import('@mui/x-data-grid').then(m => ({ default: m.DataGrid })));

/** A grid row: the entity plus the unique key the grid identifies it by. The
 *  grid needs a unique id per row and `netexId` alone is not one (versions). */
interface KeyedRow {
  key: string;
  entity: unknown;
}

/** The lazily loaded grid is untyped in its rows, so the getters narrow here. */
const entityOf = (row: GridValidRowModel): unknown => (row as KeyedRow).entity;

const toColDef = (col: Column, labels: CollectionLabels): GridColDef => {
  const base = { field: col.key, headerName: col.label, flex: 1, minWidth: COL_MIN_W } as const;
  if (col.spec.kind === 'number') {
    return { ...base, type: 'number', valueGetter: (_v, row) => (rawValue(entityOf(row), col.spec) as number | null) ?? null };
  }
  if (col.spec.kind === 'switch') {
    return { ...base, type: 'boolean', valueGetter: (_v, row) => Boolean(rawValue(entityOf(row), col.spec)) };
  }
  return { ...base, valueGetter: (_v, row) => formatValue(entityOf(row), col.spec, labels) };
};

export interface GridViewProps {
  rows: readonly unknown[];
  columns: readonly Column[];
  total: number;
  page: number;
  query: CollectionQuery;
  onQuery: (patch: Partial<CollectionQuery>) => void;
  density: GridDensity;
  /** Column key → `false` when hidden (the DataGrid's visibility model). */
  hidden: Readonly<Record<string, boolean>>;
  labels: CollectionLabels;
  dataGrid?: Partial<DataGridProps>;
}

/**
 * Render the visible page as a DataGrid.
 *
 * @param rows     the visible page (already filtered, sorted, paged)
 * @param columns  resolved columns
 * @param total    unpaged row count, for the pager
 * @param page     clamped page index
 * @param query    current query (sort + page size are read from it)
 * @param onQuery  receives sort / page / pageSize patches
 * @param density  grid density
 * @param hidden   column visibility model
 * @param labels   UI strings
 * @param dataGrid host passthrough, applied before the owned props
 * @returns the grid
 */
export function GridView({
  rows,
  columns,
  total,
  page,
  query,
  onQuery,
  density,
  hidden,
  labels,
  dataGrid,
}: GridViewProps): React.ReactNode {
  const colDefs = useMemo(() => columns.map(c => toColDef(c, labels)), [columns, labels]);
  const keyed = useMemo<KeyedRow[]>(() => {
    const keys = rowKeys(rows, page * query.pageSize);
    return rows.map((entity, i) => ({ key: keys[i], entity }));
  }, [rows, page, query.pageSize]);
  // A sort on a field that is no column (stale host state) must not reach the
  // grid: it drops the unknown item and reports an empty model back, which
  // would rewrite the host's query — and its page — without anyone clicking.
  const sort = query.sort && columns.some(c => c.key === query.sort?.field) ? query.sort : null;

  return (
    // Flex column parent → the grid sizes to its content instead of needing a fixed height.
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Suspense
        fallback={
          <Box sx={{ height: FALLBACK_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={18} />
          </Box>
        }
      >
        <DataGrid
          disableColumnFilter
          disableColumnMenu
          disableRowSelectionOnClick
          pageSizeOptions={pageSizesFor(query.pageSize)}
          {...dataGrid}
          rows={keyed}
          columns={colDefs}
          getRowId={row => (row as KeyedRow).key}
          density={density}
          columnVisibilityModel={hidden}
          sortingMode="server"
          sortModel={sort ? [{ field: sort.field, sort: sort.dir }] : []}
          onSortModelChange={model =>
            onQuery({ sort: model[0]?.sort ? { field: model[0].field, dir: model[0].sort } : null })
          }
          paginationMode="server"
          rowCount={total}
          paginationModel={{ page, pageSize: query.pageSize }}
          onPaginationModelChange={m => onQuery({ page: m.page, pageSize: m.pageSize })}
          localeText={{ noRowsLabel: labels.empty, ...dataGrid?.localeText }}
        />
      </Suspense>
    </Box>
  );
}
