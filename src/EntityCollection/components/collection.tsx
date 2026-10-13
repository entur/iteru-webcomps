/**
 * `createEntityCollection` — builds a typed, presentational list component for
 * one entity from its `FIELDS` registry: a toolbar, and the rows as a DataGrid
 * or as cards. It owns the query (or mirrors a controlled one), runs the shared
 * pipeline once, and hands the same page to whichever view is active.
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
  type EntityCollectionProps,
  type FilterFields,
} from '../types';
import { applyQuery } from '../utils/applyQuery';
import { resolveCard, resolveColumns } from '../utils/columns';
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

    // Normalised once, so the pipeline and both pagers agree on the page size.
    const raw = controlled ?? inner;
    const query = useMemo<CollectionQuery>(() => ({ ...raw, pageSize: usablePageSize(raw.pageSize) }), [raw]);
    const L = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);
    const cols = useMemo(() => resolveColumns(fields, columns), [columns]);
    const resolvedCard = useMemo(() => resolveCard(fields, cols, card), [cols, card]);
    const result = useMemo(
      () => applyQuery(rows, cols, filterFields, query, filterMode),
      [rows, cols, query, filterMode]
    );

    // Anything but an explicit page change returns to the first page: the page
    // index is only meaningful for the result it was chosen in.
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
            rows={result.rows}
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
              <CardsView rows={result.rows} card={resolvedCard} labels={L} cardProps={slotProps?.card} />
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
