/**
 * `createEntityCollection` — builds a typed, presentational list component for
 * one entity from its `FIELDS` registry: a toolbar, and the rows as a DataGrid
 * or as cards. It owns the query (or mirrors a controlled one), runs the shared
 * pipeline once, and hands the same keyed page to whichever view is active.
 */
import { useMemo, useState, type FC } from 'react';
import { Box, TablePagination, Typography } from '@mui/material';
import type { GridDensity } from '@mui/x-data-grid';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import {
  ALL_TOOLS,
  DEFAULT_LABELS,
  pageSizesFor,
  usablePageSize,
  defaultCollectionQuery,
  type CollectionOptions,
  type CollectionQuery,
  type Column,
  type EntityCollectionProps,
  type FilterFields,
} from '../types';
import { matchRows, pageRows, sortRows } from '../utils/applyQuery';
import { norm } from '../../EntityDetailsForm/utils/sections';
import { resolveCard, resolveColumns } from '../utils/columns';
import { keyRows } from '../utils/values';
import { CardsView } from './CardsView';
import { CollectionToolbar } from './CollectionToolbar';
import { GridView } from './GridView';

const NO_FILTER_FIELDS: FilterFields = {};
const DEFAULT_DENSITY: GridDensity = 'standard';

/**
 * Build a collection component for one entity.
 *
 * @param fields  the entity's `FIELDS` registry (e.g. `vehicleTypeFields`)
 * @param options `filterFields`: the entity's generated `<Entity>FilterFields`;
 *                omit and no field is filterable
 * @returns a presentational component taking `rows` plus view / query props
 */
export function createEntityCollection<E>(
  fields: Record<string, FieldSpec>,
  options: CollectionOptions = {}
): FC<EntityCollectionProps<E>> {
  const filterFields = options.filterFields ?? NO_FILTER_FIELDS;

  const Collection: FC<EntityCollectionProps<E>> = ({
    rows,
    view = 'grid',
    columns,
    card,
    tools,
    actions,
    query: controlled,
    onQueryChange,
    filterMode = 'client',
    labels,
    slotProps,
  }) => {
    const [inner, setInner] = useState<CollectionQuery>(defaultCollectionQuery);
    const [density, setDensity] = useState<GridDensity>(DEFAULT_DENSITY);
    const [hidden, setHidden] = useState<Record<string, boolean>>({});

    const L = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);
    // Keyed on content, not identity: a host writing `columns={[...]}` inline
    // would otherwise rebuild every column, and the grid's column defs, each render.
    const columnsKey = columns ? JSON.stringify(columns.map(norm).map(e => [e.field, e.label])) : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `columnsKey` stands for `columns`
    const cols = useMemo(() => resolveColumns(fields, columns, L.id), [columnsKey, L.id]);
    const resolvedCard = useMemo(() => resolveCard(fields, cols, card, L.id), [cols, card, L.id]);
    // Filters reach every filterable field, shown or not: a condition the host
    // set on a field outside `columns` is applied here, gets a chip, and matches
    // what `toSobekFilter` sends in server mode.
    const filterCols = useMemo(() => {
      const extra = resolveColumns(fields, Object.keys(filterFields), L.id).filter(f => !cols.some(c => c.key === f.key));
      return [...cols, ...extra];
    }, [cols, L.id]);

    // The effective query, decided once for every reader (pipeline, toolbar,
    // grid, pager, and the next emit): a usable page size, and no sort on a
    // field that is not a column — the grid would report that one back as an
    // empty sort and rewrite the host's query.
    const raw = controlled ?? inner;
    const query = useMemo<CollectionQuery>(() => {
      const sort = raw.sort && cols.some(c => c.key === raw.sort?.field) ? raw.sort : null;
      return { ...raw, sort, pageSize: usablePageSize(raw.pageSize) };
    }, [raw, cols]);

    // Search looks only at what is on screen: the grid's visible columns, or
    // the fields a card shows. A row is never found by text it does not show.
    const searchCols = useMemo(
      () =>
        view === 'grid'
          ? cols.filter(c => hidden[c.key] !== false)
          : [resolvedCard.title, resolvedCard.subtitle, ...resolvedCard.fields].filter((c): c is Column => !!c),
      [view, cols, hidden, resolvedCard]
    );

    // One memo per stage, keyed on what that stage reads: paging re-slices
    // without re-searching, a sort click re-sorts without re-filtering.
    const matched = useMemo(
      () => matchRows(rows, filterCols, filterFields, query.filters, query.search, filterMode, searchCols),
      [rows, filterCols, query.filters, query.search, filterMode, searchCols]
    );
    const sorted = useMemo(() => sortRows(matched, cols, query.sort), [matched, cols, query.sort]);
    const result = useMemo(() => pageRows(sorted, query.page, query.pageSize), [sorted, query.page, query.pageSize]);
    const keyed = useMemo(() => keyRows(result.rows, result.page * query.pageSize), [result, query.pageSize]);

    // Anything but an explicit page change returns to the first page: the page
    // index is only meaningful for the result it was chosen in. A page clamped
    // for display (`pageRows`) is not emitted on its own — no emit happens
    // without a user action — and never leaks: every later emit either sets the
    // page explicitly (the grid reports the clamped one) or resets it to 0.
    const onQuery = (patch: Partial<CollectionQuery>): void => {
      const next: CollectionQuery = { ...query, ...patch, page: patch.page ?? 0 };
      if (controlled === undefined) setInner(next);
      onQueryChange?.(next);
    };

    const activeTools = tools === false ? [] : (tools ?? ALL_TOOLS);

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
        {activeTools.length || actions ? (
          <CollectionToolbar
            tools={activeTools}
            view={view}
            columns={cols}
            filterColumns={filterCols}
            filterFields={filterFields}
            query={query}
            onQuery={onQuery}
            density={density}
            onDensity={setDensity}
            hidden={hidden}
            onHidden={setHidden}
            labels={L}
            actions={actions}
          />
        ) : null}
        {view === 'grid' ? (
          <GridView
            rows={keyed}
            columns={cols}
            total={result.total}
            page={result.page}
            query={query}
            onQuery={onQuery}
            density={density}
            hidden={hidden}
            labels={L}
            dataGrid={slotProps?.dataGrid}
          />
        ) : (
          <>
            {result.total === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {L.empty}
              </Typography>
            ) : (
              <CardsView rows={keyed} card={resolvedCard} labels={L} cardProps={slotProps?.card} />
            )}
            <TablePagination
              component="div"
              count={result.total}
              page={result.page}
              rowsPerPage={query.pageSize}
              rowsPerPageOptions={pageSizesFor(query.pageSize)}
              onPageChange={(_e, page) => onQuery({ page })}
              onRowsPerPageChange={e => onQuery({ pageSize: Number(e.target.value) })}
            />
          </>
        )}
      </Box>
    );
  };
  Collection.displayName = 'EntityCollection';
  return Collection;
}
