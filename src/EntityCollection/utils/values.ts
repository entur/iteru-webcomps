/**
 * Read and format one field of one row. Shared by both views, the search and
 * the sort, so a value reads the same wherever it shows up.
 */
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { getPath } from '../../EntityDetailsForm/utils/paths';
import type { CollectionLabels } from '../types';

const ID_KEYS = ['netexId', 'id'] as const; // first present → row id
const DATE_LEN = 10, MINUTE_LEN = 16; // 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm'
const LIST_SEP = ', ';
const PLAIN_BOOL = { yes: 'Yes', no: 'No' } as const;

/**
 * The field's value in `row`, with a `name` (MultilingualString) unwrapped to
 * its `value` leaf.
 *
 * @param row  one entity
 * @param spec the field's registry entry
 * @returns the raw value; `undefined` when any path segment is missing
 */
export const rawValue = (row: unknown, spec: FieldSpec): unknown => {
  const v = getPath(row, spec.path);
  return spec.kind === 'name' ? ((v as { value?: unknown } | null | undefined)?.value ?? undefined) : v;
};

/**
 * The field's display text. Empty string for a missing value; `0` and `false`
 * stay visible.
 *
 * @param row    one entity
 * @param spec   the field's registry entry
 * @param labels yes/no wording for `switch` fields (English default)
 * @returns display text
 */
export const formatValue = (
  row: unknown,
  spec: FieldSpec,
  labels: Pick<CollectionLabels, 'yes' | 'no'> = PLAIN_BOOL
): string => {
  const v = rawValue(row, spec);
  if (spec.kind === 'enumMulti') return Array.isArray(v) ? v.filter(x => x != null).join(LIST_SEP) : '';
  if (v == null) return '';
  if (spec.kind === 'switch') return v ? labels.yes : labels.no;
  if (spec.kind === 'date') return String(v).slice(0, DATE_LEN);
  if (spec.kind === 'datetime') return String(v).slice(0, MINUTE_LEN).replace('T', ' ');
  return String(v);
};

/**
 * A stable key for a row: its `netexId`, else `id`, else its index.
 *
 * @param row   one entity
 * @param index position in the rendered list (fallback)
 * @returns the row key
 */
export const rowId = (row: unknown, index: number): string | number => {
  const obj = (row ?? {}) as Record<string, unknown>;
  const key = ID_KEYS.find(k => obj[k] != null);
  return key ? (obj[key] as string | number) : index;
};
