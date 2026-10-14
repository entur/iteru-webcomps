/**
 * Read and format one field of one row. Shared by both views, the search and
 * the sort, so a value reads the same wherever it shows up.
 */
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { getPath } from '../../EntityDetailsForm/utils/paths';
import type { CollectionLabels, Column } from '../types';

const ID_KEYS = ['netexId', 'id'] as const; // first present → row identity
const VERSION_KEY = 'version', VERSION_SEP = '@';
const POSITION_PREFIX = 'row:'; // id-less rows; a real id never starts with it
const ID_SEP = ':', COMPACT_MARK = '::';

/** The identity field: captioned "Id" and shown compact (`::1004`). */
export const ID_FIELD = 'netexId';
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

/**
 * Is this the entity's identity field (top-level `netexId`)? Hoisted relation
 * ids such as `deckPlan.netexId` are not — they name another entity.
 *
 * @param spec a registry entry
 * @returns whether it is the identity field
 */
export const isIdSpec = (spec: FieldSpec): boolean => spec.path.length === 1 && spec.path[0] === ID_FIELD;

const lastSegment = (id: string): string => id.slice(id.lastIndexOf(ID_SEP) + 1);

/**
 * A NeTEx id shortened to its local part: `VEH:VehicleType:1004` → `::1004`.
 * Within one collection the codespace and type repeat on every row, so only
 * the last segment tells rows apart. A value without segments (or with an
 * empty last one) is returned unchanged.
 *
 * @param id a full id
 * @returns the compact form
 */
export const compactId = (id: string): string => {
  const tail = lastSegment(id);
  return id.includes(ID_SEP) && tail ? `${COMPACT_MARK}${tail}` : id;
};

/**
 * Does a typed id pick out a full one? The compact `::1004` and the bare
 * `1004` match on the last segment; a value carrying a namespace must match
 * whole — the full id stays a working fallback.
 *
 * @param full  the row's id
 * @param typed what the user entered
 * @returns whether they denote the same entity
 */
export const idMatches = (full: string, typed: string): boolean => {
  if (typed === full) return true;
  const local = typed.startsWith(COMPACT_MARK) ? typed.slice(COMPACT_MARK.length) : typed;
  return local !== '' && !local.includes(ID_SEP) && local === lastSegment(full);
};

/**
 * The text a view shows for one cell: `formatValue`, with the identity field
 * compacted. Search, sort and filtering keep using the full value.
 *
 * @param row    one entity
 * @param col    the resolved column
 * @param labels yes/no wording for `switch` fields
 * @returns display text
 */
export const displayValue = (row: unknown, col: Column, labels?: Pick<CollectionLabels, 'yes' | 'no'>): string => {
  const text = formatValue(row, col.spec, labels);
  return isIdSpec(col.spec) ? compactId(text) : text;
};

/**
 * A typed id filter entry in the compact form: a full id is compacted, and a
 * bare local part (`1004`) gains the `::` mark, so every entry reads alike.
 *
 * @param typed what the user entered
 * @returns the entry as shown on a chip or tag
 */
export const compactIdEntry = (typed: string): string =>
  typed.includes(ID_SEP) ? compactId(typed) : `${COMPACT_MARK}${typed}`;
