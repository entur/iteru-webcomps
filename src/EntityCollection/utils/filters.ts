/**
 * Filter conditions: value coercion, client-side matching, and the translation
 * to sobek's `<Entity>Filter` argument shape.
 */
import type { FieldSpec } from '../../EntityDetailsForm/types';
import type { CollectionQuery, FilterFields, FilterOp, FilterValue } from '../types';
import { formatValue, idMatches, isIdSpec, rawValue } from './values';

/**
 * A filter value as a string list, whatever shape it arrived in.
 *
 * @param value a `contains` string or an `anyOf` list
 * @returns the list; empty for an empty or missing value
 */
export const asList = (value: FilterValue | undefined): string[] =>
  value == null || value === '' ? [] : typeof value === 'string' ? [value] : [...value];

/**
 * A filter value as text, whatever shape it arrived in.
 *
 * @param value a `contains` string or an `anyOf` list
 * @returns the text; a list is space-joined
 */
export const asText = (value: FilterValue | undefined): string =>
  value == null ? '' : typeof value === 'string' ? value : value.join(' ');

/**
 * Does `row` satisfy one condition? An empty condition matches every row.
 * Approximates sobek: `contains` is a case-insensitive substring.
 *
 * @param row   one entity
 * @param spec  registry entry of the filtered field
 * @param op    the field's operator
 * @param value the condition's value
 * @returns whether the row passes
 */
export const matchesFilter = (row: unknown, spec: FieldSpec, op: FilterOp, value: FilterValue): boolean => {
  if (op === 'contains') {
    const needle = asText(value).trim().toLowerCase();
    return !needle || formatValue(row, spec).toLowerCase().includes(needle);
  }
  const wanted = asList(value);
  if (!wanted.length) return true;
  const v = rawValue(row, spec);
  const have = Array.isArray(v) ? v.filter(x => x != null).map(String) : v == null ? [] : [String(v)];
  const same = isIdSpec(spec) ? idMatches : (h: string, w: string): boolean => h === w;
  return have.some(h => wanted.some(w => same(h, w)));
};

/**
 * Translate the query's filters into the object sobek's list query takes as
 * `filter` (minus `dataOwnerRef`, which the host stamps from its session).
 *
 * @param filters      `CollectionQuery.filters`
 * @param filterFields the entity's generated `<Entity>FilterFields`
 * @returns filter args; empty conditions and non-filterable fields are omitted
 */
export const toSobekFilter = (
  filters: CollectionQuery['filters'],
  filterFields: FilterFields
): Record<string, string | string[]> =>
  Object.fromEntries(
    Object.entries(filters).flatMap(([field, value]): [string, string | string[]][] => {
      const target = filterFields[field];
      if (!target) return [];
      const out = target.op === 'anyOf' ? asList(value) : asText(value).trim();
      return out.length ? [[target.arg, out]] : [];
    })
  );
