/**
 * Public types for the schema-driven entity collection (grid / cards list).
 * Presentational: rows come in as a prop; nothing here fetches.
 */
import type { ReactNode } from 'react';
import type { CardProps } from '@mui/material';
import type { DataGridProps } from '@mui/x-data-grid';
import type { FieldEntry, FieldSpec } from '../EntityDetailsForm/types';

export type CollectionView = 'grid' | 'cards';
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
  searchCaption: string;
  filters: string;
  notFilterable: string;
  sortBy: string;
  sortNone: string;
  sortDirection: string;
  columns: string;
  density: string;
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

export interface EntityCollectionProps<E> {
  rows: readonly E[];
  /** Default `'grid'`. */
  view?: CollectionView;
  /** Whitelist, order and labels. Omit → every eligible field. */
  columns?: readonly (string | FieldEntry)[];
  /** Omit → `name` as title plus the first columns. */
  card?: CardSpec;
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

/** A resolved, renderable field: registry key, display label, registry spec. */
export interface Column {
  key: string;
  label: string;
  spec: FieldSpec;
}

export interface ResolvedCard {
  title?: Column;
  subtitle?: Column;
  fields: Column[];
}

export const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export const ALL_TOOLS: readonly CollectionTool[] = ['search', 'filter', 'sort', 'columns', 'density'];

export const DEFAULT_LABELS: CollectionLabels = {
  search: 'Search',
  searchCaption: '(from cached filter)',
  filters: 'Filters',
  notFilterable: 'Not filterable in sobek yet',
  sortBy: 'Sort by',
  sortNone: 'None',
  sortDirection: 'Sort direction',
  columns: 'Columns',
  density: 'Density',
  empty: 'No rows',
  yes: 'Yes',
  no: 'No',
};

/** The query an uncontrolled collection starts from; also a seed for hosts. */
export const defaultCollectionQuery: CollectionQuery = {
  filters: {},
  search: '',
  sort: null,
  page: 0,
  pageSize: DEFAULT_PAGE_SIZE,
};
