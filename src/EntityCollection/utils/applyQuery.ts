/**
 * The one pipeline both views render from: filter → search → sort → page.
 * Pure, so the grid and the cards cannot disagree about what is visible.
 */
import type { FieldSpec } from '../../EntityDetailsForm/types';
import type { CollectionQuery, Column, FilterFields } from '../types';
import { matchesFilter } from './filters';
import { displayValue, formatValue, rawValue } from './values';

/** Kinds the free-text search looks into. */
const SEARCHABLE: readonly FieldSpec['kind'][] = ['text', 'name', 'enum', 'enumMulti', 'reference'];

export interface QueryResult<E> {
  /** The visible page. */
  rows: E[];
  /** Row count after filter + search, before paging. */
  total: number;
  /** The page actually returned (the requested one, clamped into range). */
  page: number;
}

type SortKey = number | string | null;

/** `null` for a missing value, so it can be ordered last in either direction. */
const sortKey = (row: unknown, spec: FieldSpec): SortKey => {
  const v = rawValue(row, spec);
  if (v == null) return null;
  if (spec.kind === 'number') return Number(v);
  if (spec.kind === 'switch') return Number(Boolean(v));
  return formatValue(row, spec).toLowerCase() || null;
};

const compare = (a: SortKey, b: SortKey): number =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));

/**
 * Apply a query to the rows in memory.
 *
 * @param rows         the collection (never mutated)
 * @param columns      the resolved columns; filters, search and sort only see these
 * @param filterFields the entity's generated `<Entity>FilterFields`
 * @param query        filters, search, sort and paging
 * @param filterMode   `'server'` skips the filter step (the host already applied it)
 * @returns the visible page, the unpaged total and the clamped page index
 */
export function applyQuery<E>(
  rows: readonly E[],
  columns: readonly Column[],
  filterFields: FilterFields,
  query: CollectionQuery,
  filterMode: 'client' | 'server' = 'client'
): QueryResult<E> {
  const byKey = new Map(columns.map(c => [c.key, c]));

  const conditions =
    filterMode === 'server'
      ? []
      : Object.entries(query.filters).flatMap(([key, value]) => {
          const col = byKey.get(key);
          const target = filterFields[key];
          return col && target ? [{ spec: col.spec, op: target.op, value }] : [];
        });

  const needle = query.search.trim().toLowerCase();
  const searchable = columns.filter(c => SEARCHABLE.includes(c.spec.kind));

  const matched = rows
    .filter(row => conditions.every(c => matchesFilter(row, c.spec, c.op, c.value)))
    // The shown text counts too, so a compact id (`::1004`) is findable as displayed.
    .filter(
      row =>
        !needle ||
        searchable.some(c => [formatValue(row, c.spec), displayValue(row, c)].some(t => t.toLowerCase().includes(needle)))
    );

  const sortCol = query.sort ? byKey.get(query.sort.field) : undefined;
  const flip = query.sort?.dir === 'desc' ? -1 : 1;
  const sorted = sortCol
    ? matched
        .map(row => ({ row, key: sortKey(row, sortCol.spec) }))
        .sort((x, y) =>
          x.key === null || y.key === null
            ? Number(x.key === null) - Number(y.key === null)
            : flip * compare(x.key, y.key)
        )
        .map(x => x.row)
    : matched;

  const total = sorted.length;
  const size = query.pageSize > 0 ? query.pageSize : Math.max(total, 1);
  const page = Math.min(Math.max(query.page, 0), Math.max(Math.ceil(total / size) - 1, 0));

  return { rows: sorted.slice(page * size, page * size + size), total, page };
}
