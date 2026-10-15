/**
 * Reduce a form-derived input object to the fields the live sobek schema accepts.
 *
 * `FIELDS` is distilled from the *patched* schema, so `toInputEntity` can hand
 * back keys (`manufacturer`, `fullCharge`, …) that exist only in
 * `schema/sobek.patch.graphqls`. The backend rejects those, so they are stripped
 * here — at the wire edge, leaving the form model itself untouched.
 *
 * @param inp  full input built by `toInputEntity` (may carry patch-only fields)
 * @param mask generated wire-key set for the entity's `<Entity>Input`
 * @returns a shallow copy holding only the keys `mask` declares
 */
export function reduceToSobekInput(
  inp: Record<string, unknown>,
  mask: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inp)) {
    if (Object.prototype.hasOwnProperty.call(mask, k)) out[k] = v;
  }
  return out;
}
