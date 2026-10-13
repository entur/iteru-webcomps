/**
 * Which registry fields a collection may show, and what a card shows by default.
 * Pure — both views and the toolbar call it, so they can never disagree.
 */
import type { FieldEntry, FieldSpec } from '../../EntityDetailsForm/types';
import { humanize } from '../../shared/humanize';
import type { CardSpec, Column, ResolvedCard } from '../types';

const TITLE_KEY = 'name'; // default card title when the entity has one
const CARD_DEFAULT_FIELDS = 6;

/** `grid` relations need a table of their own; `patched` fields are not on the
 *  wire yet, so a list fetched from sobek never carries them. */
const eligible = (spec: FieldSpec | undefined): spec is FieldSpec =>
  !!spec && spec.kind !== 'grid' && !spec.patched;

const toEntry = (item: string | FieldEntry): FieldEntry => (typeof item === 'string' ? { field: item } : item);

/**
 * Resolve the columns a collection shows.
 *
 * @param fields  the entity's `FIELDS` registry
 * @param columns whitelist with order and optional labels; omit for every
 *                eligible field in registry order
 * @returns columns in display order; ineligible or unknown keys are dropped
 */
export const resolveColumns = (
  fields: Record<string, FieldSpec>,
  columns?: readonly (string | FieldEntry)[]
): Column[] =>
  (columns?.map(toEntry) ?? Object.keys(fields).map(field => ({ field }) as FieldEntry)).flatMap(entry => {
    const spec = fields[entry.field];
    return eligible(spec) ? [{ key: entry.field, label: entry.label ?? humanize(entry.field), spec }] : [];
  });

/**
 * Resolve what a card shows. An explicit `card` is looked up against the whole
 * registry (a card may show a field the grid hides); the default derives from
 * the resolved columns.
 *
 * @param fields the entity's `FIELDS` registry
 * @param cols   the resolved columns
 * @param card   explicit card spec; omit for the default
 * @returns title, subtitle and body fields
 */
export const resolveCard = (
  fields: Record<string, FieldSpec>,
  cols: readonly Column[],
  card?: CardSpec
): ResolvedCard => {
  if (card) {
    const pick = (keys: readonly string[]): Column[] => resolveColumns(fields, keys);
    return {
      title: pick([card.title])[0],
      subtitle: card.subtitle ? pick([card.subtitle])[0] : undefined,
      fields: pick(card.fields),
    };
  }
  const title = cols.find(c => c.key === TITLE_KEY) ?? cols[0];
  return {
    title,
    subtitle: undefined,
    fields: cols.filter(c => c !== title).slice(0, CARD_DEFAULT_FIELDS),
  };
};
