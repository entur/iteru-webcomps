/**
 * Read and format one field of one row. Shared by both views, the search and
 * the sort, so a value reads the same wherever it shows up.
 */
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { getPath } from '../../EntityDetailsForm/utils/paths';
import type { CollectionLabels } from '../types';

const ID_KEYS = ['netexId', 'id'] as const; // first present → row identity
const VERSION_KEY = 'version', VERSION_SEP = '@';
const POSITION_PREFIX = 'row:'; // id-less rows; a real id never starts with it
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
 * A stable, unique key per row, for the grid's row ids and the cards' React
 * keys. The NeTEx identity is `netexId` + `version`, so two versions of one
 * entity are two rows: `id@version`, or the bare id when there is no version.
 * A row with no id is keyed by its position across pages (`offset + index`),
 * prefixed so it can never equal a real id.
 *
 * A repeated identity is a data error — the grid can show only one row per
 * id — so it is reported with a console warning rather than papered over.
 *
 * @param rows   the rows being rendered
 * @param offset position of `rows[0]` in the whole result (page × page size)
 * @returns one key per row, in order
 */
export const rowKeys = (rows: readonly unknown[], offset = 0): string[] => {
  const keys = rows.map((row, i) => {
    const obj = (row ?? {}) as Record<string, unknown>;
    const idKey = ID_KEYS.find(k => obj[k] != null);
    if (!idKey) return `${POSITION_PREFIX}${offset + i}`;
    const version = obj[VERSION_KEY];
    return version == null || version === '' ? String(obj[idKey]) : `${String(obj[idKey])}${VERSION_SEP}${String(version)}`;
  });
  const repeated = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (repeated.length) {
    console.warn(
      `[EntityCollection] rows share an identity (netexId + version): ${repeated.join(', ')} — only one of each can be shown in the grid.`
    );
  }
  return keys;
};
