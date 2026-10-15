/**
 * The `datetime` control's two-way mapping between a stored, zoned ISO-8601
 * timestamp and a native `datetime-local` input, which holds a wall-clock time
 * with no offset. The display timezone is the browser's own: the input shows
 * the stored instant in local time, and an edit is converted back to an
 * explicit UTC timestamp (`…Z`), so a host never receives a zone-less string.
 */

/** A zoned ISO-8601 date-time — the `Z` or `±HH:mm` is what pins one instant. */
const ZONED_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Stored timestamp → `datetime-local` value: its instant in local wall-clock
 * time, `YYYY-MM-DDTHH:mm`, with `:ss` only when the seconds are non-zero (so
 * they survive an untouched round trip).
 *
 * @param v the stored value (anything; non-strings render empty)
 * @returns the input value, or the first 16 chars of an unparseable string
 */
export function toLocalInput(v: unknown): string {
  if (typeof v !== 'string' || v === '') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 16);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.getSeconds() ? `${hm}:${pad(d.getSeconds())}` : hm;
}

/**
 * `datetime-local` value → stored timestamp: the local wall-clock time read as
 * an instant and written in UTC, e.g. `2020-01-15T00:01:00Z`.
 *
 * @param s the input's value (`''` when cleared)
 * @returns the UTC timestamp, `undefined` for a cleared input, or `s` itself if
 *   it does not parse
 */
export function fromLocalInput(s: string): string | undefined {
  if (s === '') return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().replace(/\.000Z$/, 'Z');
}

/**
 * Whether two strings are zoned ISO timestamps naming the same instant, however
 * each spells its offset (`2020-01-15T01:00:00+01:00` = `2020-01-15T00:00:00Z`).
 *
 * @param a one value
 * @param b the other
 * @returns `false` unless both are zoned timestamps and equal as instants
 */
export const sameInstant = (a: string, b: string): boolean =>
  ZONED_ISO.test(a) && ZONED_ISO.test(b) && Date.parse(a) === Date.parse(b);
