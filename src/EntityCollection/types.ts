/**
 * Public types for the schema-driven entity collection (grid / cards list).
 * Presentational: rows come in as a prop; nothing here fetches.
 */
import type { ReactNode } from 'react';
import type { CardProps } from '@mui/material';
import type { DataGridProps, GridDensity } from '@mui/x-data-grid';
import type { FieldEntry, FieldSpec } from '../EntityDetailsForm/types';

/** `cards-sm`: compact text cards. `cards-big`: wider cards with room for a
 *  picture at the top (`cardMedia`). */
export type CollectionView = 'grid' | 'cards-sm' | 'cards-big';
export type CollectionTool = 'search' | 'filter' | 'sort' | 'columns' | 'density';
export type FilterOp = 'contains' | 'anyOf';

/** One filterable field: the sobek filter argument it feeds and how it matches. */
export interface FilterFieldSpec {
  arg: string;
  op: FilterOp;
}
/** Field key → filter spec. Generated per entity as `<Entity>FilterFields`. */
export type FilterFields = Readonly<Record<string, FilterFieldSpec>>;
/** `contains` takes a string, `anyOf` a string list. */
export type FilterValue = string | readonly string[];

export interface CollectionSort {
  field: string;
  dir: 'asc' | 'desc';
}

/** Everything that decides which rows are shown. Plain and serialisable. */
export interface CollectionQuery {
  /** One condition per field key; AND across fields. */
  filters: Readonly<Record<string, FilterValue>>;
  search: string;
  sort: CollectionSort | null;
  page: number;
  pageSize: number;
}

/** Which fields a card shows. Keys are entity field keys. */
export interface CardSpec<K extends string = string> {
  title: K;
  subtitle?: K;
  fields: K[];
}

/** UI strings. English defaults; localisation is the host's job. */
export interface CollectionLabels {
  search: string;
  searchPlaceholder: string;
  /** Caption of the identity field (`netexId`): column, card, filter, chip. */
  id: string;
  filters: string;
  activeFilters: string;
  /** Appended to a filter chip's accessible name: it is a remove button. */
  removeFilter: string;
  /** Accessible name of the "+N" chip folding the filters not shown. */
  moreFilters: (count: number) => string;
  notFilterable: string;
  sortBy: string;
  sortNone: string;
  sortDirection: string;
  columns: string;
  density: string;
  /** Names of the grid densities in the density menu. */
  densities: Record<GridDensity, string>;
  empty: string;
  yes: string;
  no: string;
}

export interface CollectionSlotProps {
  /** Spread onto the DataGrid before the props the collection owns. */
  dataGrid?: Partial<DataGridProps>;
  /** Spread onto every card. */
  card?: CardProps;
}

export interface CollectionOptions {
  /** The entity's generated `<Entity>FilterFields`. Omit → nothing is filterable. */
  filterFields?: FilterFields;
}

/** `K` is the entity's field-key union, inferred from the registry by
 *  `createEntityCollection`, so a misspelt column or card key fails to compile. */
export interface EntityCollectionProps<E, K extends string = string> {
  rows: readonly E[];
  /** Default `'grid'`. */
  view?: CollectionView;
  /** Whitelist, order and labels. Omit → every eligible field. */
  columns?: readonly (K | FieldEntry<K>)[];
  /** Omit → `name` as title plus the first columns. */
  card?: CardSpec<K>;
  /** `cards-big` only: what fills the picture area at the top of a row's card
   *  (an `<img>` fills it, scaled to fit). Omit, or return nothing, and the
   *  area is left blank, so every card keeps the same height. */
  cardMedia?: (row: E) => ReactNode;
  /** Toolbar whitelist; `false` hides the toolbar's tools. Default: all. */
  tools?: readonly CollectionTool[] | false;
  /** Host buttons at the end of the toolbar. */
  actions?: ReactNode;
  /** Controlled query. Omit for uncontrolled. */
  query?: CollectionQuery;
  onQueryChange?: (next: CollectionQuery) => void;
  /** `'client'` (default) applies `filters` to `rows`; `'server'` only emits them. */
  filterMode?: 'client' | 'server';
  labels?: Partial<CollectionLabels>;
  slotProps?: CollectionSlotProps;
}

/**
 * A resolved, renderable field: registry key, display label, registry spec,
 * and the field's own display and match rules. `resolveColumns` decides those
 * rules once (the identity field compacts and matches on its last segment;
 * every other field shows and matches its text as is), so no view or filter
 * branches on which field it holds.
 */
export interface Column {
  key: string;
  label: string;
  spec: FieldSpec;
  /** The shown text, from the full formatted text. */
  display: (text: string) => string;
  /** Does one of a row's values match one typed filter entry? */
  matches: (have: string, typed: string) => boolean;
  /** A typed filter entry as a chip or tag shows it. */
  entryLabel: (typed: string) => string;
  /** The shown text as a card reads it: the identity adds the row's version
   *  (`::1004/ver3`) — the grid has a Version column, a card does not. */
  cardText: (shown: string, row: unknown) => string;
}

/** A visible row with the unique key both views identify it by. */
export interface KeyedRow {
  key: string;
  entity: unknown;
}

/** The filter conditions of a query, keyed by field. */
export type CollectionFilters = CollectionQuery['filters'];

export interface ResolvedCard {
  title?: Column;
  subtitle?: Column;
  fields: Column[];
}

const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
/** The community DataGrid throws above this. */
const MAX_PAGE_SIZE = 100;

/**
 * A page size both views can render: a whole number in `1..100`. Anything else
 * (zero, negative, `NaN`) falls back to the default; larger values are capped.
 *
 * @param size the requested page size
 * @returns the usable page size
 */
export const usablePageSize = (size: number): number =>
  Number.isFinite(size) && size >= 1 ? Math.min(Math.trunc(size), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

/**
 * The pager's size choices, with the current size added when it is not one of
 * the standard ones (a pager cannot show a size it does not list).
 *
 * @param size the current page size
 * @returns ascending size options
 */
export const pageSizesFor = (size: number): number[] =>
  PAGE_SIZES.includes(size) ? PAGE_SIZES : [...PAGE_SIZES, size].sort((a, b) => a - b);

export const ALL_TOOLS: readonly CollectionTool[] = ['search', 'filter', 'sort', 'columns', 'density'];

export const DEFAULT_LABELS: CollectionLabels = {
  search: 'Search',
  searchPlaceholder: 'Search these rows',
  id: 'Id',
  filters: 'Filters',
  activeFilters: 'Active filters',
  removeFilter: 'remove filter',
  moreFilters: count => `${count} more filter${count === 1 ? '' : 's'}`,
  notFilterable: 'Not filterable in sobek yet',
  sortBy: 'Sort by',
  sortNone: 'None',
  sortDirection: 'Sort direction',
  columns: 'Columns',
  density: 'Density',
  densities: { compact: 'Compact', standard: 'Standard', comfortable: 'Comfortable' },
  empty: 'No rows',
  yes: 'Yes',
  no: 'No',
};

/** The query an uncontrolled collection starts from; also a seed for hosts.
 *  Frozen (filters too): it is shared by every instance and every host. */
export const defaultCollectionQuery: CollectionQuery = Object.freeze({
  filters: Object.freeze({}),
  search: '',
  sort: null,
  page: 0,
  pageSize: DEFAULT_PAGE_SIZE,
});
