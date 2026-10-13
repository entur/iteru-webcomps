/**
 * The collection's own toolbar, rendered above either view (so it cannot use
 * the DataGrid's toolbar primitives, which need a mounted grid). Which tools
 * show is the host's whitelist; `columns` and `density` exist in grid view only.
 *
 * One row of tools, plus a second row for the active-filter chips that exists
 * only while a filter is set — so the tools never shift as filters come and go.
 */
import { useState, type ReactNode } from 'react';
import { Box, Checkbox, IconButton, Menu, MenuItem, Stack, TextField, Tooltip } from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DensityMediumIcon from '@mui/icons-material/DensityMedium';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import type { GridDensity } from '@mui/x-data-grid';
import type {
  CollectionLabels,
  CollectionQuery,
  CollectionTool,
  CollectionView,
  Column,
  FilterFields,
} from '../types';
import { FilterChips, FilterPopover } from './FilterPopover';

const DENSITIES: GridDensity[] = ['compact', 'standard', 'comfortable'];
const GRID_ONLY: readonly CollectionTool[] = ['columns', 'density'];
const SEARCH_W = 220, SORT_W = 180;
const NO_SORT = ''; // select value for "unsorted"

export interface CollectionToolbarProps {
  tools: readonly CollectionTool[];
  view: CollectionView;
  columns: readonly Column[];
  filterFields: FilterFields;
  query: CollectionQuery;
  onQuery: (patch: Partial<CollectionQuery>) => void;
  density: GridDensity;
  onDensity: (d: GridDensity) => void;
  hidden: Readonly<Record<string, boolean>>;
  onHidden: (next: Record<string, boolean>) => void;
  labels: CollectionLabels;
  actions?: ReactNode;
}

/**
 * Render the toolbar.
 *
 * @param tools        which tools to show
 * @param view         active view; grid-only tools drop out in `'cards'`
 * @param columns      resolved columns
 * @param filterFields the entity's generated `<Entity>FilterFields`
 * @param query        current query
 * @param onQuery      receives search / filters / sort patches
 * @param density      grid density
 * @param onDensity    density setter
 * @param hidden       column visibility model (key → `false` when hidden)
 * @param onHidden     visibility setter
 * @param labels       UI strings
 * @param actions      host buttons, rendered last
 * @returns the toolbar: the tools row and, while filters are active, a chip row
 */
export function CollectionToolbar({
  tools,
  view,
  columns,
  filterFields,
  query,
  onQuery,
  density,
  onDensity,
  hidden,
  onHidden,
  labels,
  actions,
}: CollectionToolbarProps): React.ReactNode {
  const [colAnchor, setColAnchor] = useState<HTMLElement | null>(null);
  const [denAnchor, setDenAnchor] = useState<HTMLElement | null>(null);
  const has = (tool: CollectionTool): boolean =>
    tools.includes(tool) && (view === 'grid' || !GRID_ONLY.includes(tool));
  const sorted = query.sort && columns.some(c => c.key === query.sort?.field) ? query.sort : null;

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {has('search') ? (
          <TextField
            size="small"
            label={labels.search}
            helperText={labels.searchCaption}
            value={query.search}
            onChange={e => onQuery({ search: e.target.value })}
            sx={{ width: SEARCH_W }}
          />
        ) : null}
        {has('filter') ? (
          <FilterPopover
            columns={columns}
            filterFields={filterFields}
            filters={query.filters}
            onChange={filters => onQuery({ filters })}
            labels={labels}
          />
        ) : null}
        {has('sort') ? (
          <>
            <TextField
              select
              size="small"
              label={labels.sortBy}
              value={sorted?.field ?? NO_SORT}
              onChange={e =>
                onQuery({ sort: e.target.value ? { field: e.target.value, dir: sorted?.dir ?? 'asc' } : null })
              }
              sx={{ width: SORT_W }}
            >
              <MenuItem value={NO_SORT}>{labels.sortNone}</MenuItem>
              {columns.map(c => (
                <MenuItem key={c.key} value={c.key}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
            <Tooltip title={labels.sortDirection}>
              <span>
                <IconButton
                  size="small"
                  aria-label={labels.sortDirection}
                  disabled={!sorted}
                  onClick={() => sorted && onQuery({ sort: { ...sorted, dir: sorted.dir === 'asc' ? 'desc' : 'asc' } })}
                >
                  {sorted?.dir === 'desc' ? <ArrowDownwardIcon fontSize="small" /> : <ArrowUpwardIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </>
        ) : null}
        {has('columns') ? (
          <>
            <Tooltip title={labels.columns}>
              <IconButton size="small" aria-label={labels.columns} onClick={e => setColAnchor(e.currentTarget)}>
                <ViewColumnIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu open={!!colAnchor} anchorEl={colAnchor} onClose={() => setColAnchor(null)}>
              {columns.map(c => {
                const shown = hidden[c.key] !== false;
                return (
                  <MenuItem
                    key={c.key}
                    role="menuitemcheckbox"
                    aria-checked={shown}
                    dense
                    onClick={() => onHidden({ ...hidden, [c.key]: !shown })}
                  >
                    <Checkbox size="small" edge="start" checked={shown} tabIndex={-1} disableRipple />
                    {c.label}
                  </MenuItem>
                );
              })}
            </Menu>
          </>
        ) : null}
        {has('density') ? (
          <>
            <Tooltip title={labels.density}>
              <IconButton size="small" aria-label={labels.density} onClick={e => setDenAnchor(e.currentTarget)}>
                <DensityMediumIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu open={!!denAnchor} anchorEl={denAnchor} onClose={() => setDenAnchor(null)}>
              {DENSITIES.map(d => (
                <MenuItem
                  key={d}
                  selected={d === density}
                  onClick={() => {
                    onDensity(d);
                    setDenAnchor(null);
                  }}
                >
                  {d}
                </MenuItem>
              ))}
            </Menu>
          </>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {actions}
      </Stack>
      {has('filter') ? (
        <FilterChips
          columns={columns}
          filterFields={filterFields}
          filters={query.filters}
          onChange={filters => onQuery({ filters })}
          labels={labels}
        />
      ) : null}
    </Stack>
  );
}
