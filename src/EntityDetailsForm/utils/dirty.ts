/**
 * Dirty comparison for the entity form: does the edited value diverge from the
 * baseline the server last handed back?
 *
 * Empty-ish leaves (`undefined`, `null`, `false`, `''`, `[]`) all compare equal
 * to an absent one. Without that, an untouched Switch reporting `false` against
 * a null-backed baseline, or a text field typed into and cleared again, would
 * both read as edits. `0` is deliberately **not** empty — clearing a numeric
 * field that held `0` is a real change.
 *
 * Two zoned ISO timestamps are equal when they name the same instant, so a
 * `datetime` edited and set back reads clean even when the server spelled the
 * offset differently from the control's UTC output.
 */

import { sameInstant } from './datetime';

/** Leaves that mean "nothing here", however the control happens to spell it. */
const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === false || v === '' ||
  (Array.isArray(v) && v.length === 0);

/**
 * Structural equality under the empty-ish rule above. Key order is irrelevant;
 * keys absent on one side are compared against `undefined` on the other, so
 * `{ lowFloor: false }` and `{}` are equal.
 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a === 'string' && typeof b === 'string') return sameInstant(a, b);

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => same(x, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(k =>
      same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
  }

  return false;
}

/**
 * @param value    the form's current entity
 * @param baseline the entity as last loaded or saved (`undefined` in create mode)
 * @returns whether the host should treat the form as having unsaved changes
 */
export function isDirty(value: unknown, baseline: unknown): boolean {
  return !same(value, baseline);
}
