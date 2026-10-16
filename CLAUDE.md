# CLAUDE.md

`@entur/iteru-webcomps` — small React MUI component lib for Entur's
[hathor](https://github.com/entur/hathor) frontend. Types come from live
[sobek](https://github.com/entur/sobek) GraphQL schema. Previewed w/ Storybook.
Status: seed, unpublished. Storybook deploys to GitHub Pages.

## Core

Two layers. **Presentational**: `createAbstractEntityDetailsForm<E>(fields)` →
typed React form. No data fetch, no save, no i18n runtime, no router.
**Data-aware**: generated wrappers `VehicleForm` / `VehicleTypeForm` (from
`scripts/generateWrappers.ts`, one per `entities.manifest.json` entry) wrap it
and do load/save over sobek GraphQL via the internal `useEntityForm` hook.
Public API in `src/index.ts`. `src/EntityDetailsForm/formImpls/*` is generator
output — **never hand-edit**; fix the template in `generateWrappers.ts` and
re-run it.

**Layout of `src/EntityDetailsForm/`** — root holds the contract only
(`index.ts`, `types.ts`); `components/` everything that renders (`abstractForm`,
`controls`, `EditFooter`, `SaveSnackbar`), `hooks/` the hooks (`useEntityForm`, `useFormSession`, `useSectionSpy`), `utils/` the
pure functions (`paths`, `toInput`, `reduceToSobekInput`, `normalizeErrors`,
`dirty`), `formImpls/` the generated wrappers. Tests sit beside their subject.
Two files outside the directory hardcode paths into it and must move with it:
`scripts/distillTypes.ts` (`TYPES_IMPORT`, why `types.ts` stays at the root —
moving it rewrites every committed `src/entities/*`) and
`scripts/generateWrappers.ts`, whose emitted imports name
`../components/abstractForm`, `../hooks/useFormSession` and `../utils/sections`
and are pinned by
`generateWrappers.test.ts`.

`SobekProvider` (`src/context/SobekContext.tsx`) is a typed FC, not the raw
`Context.Provider`: `value: SobekCtx` is required, so a host threading a
possibly-undefined session is a compile error rather than a render-time throw
from inside a consumer. It memoizes per field, so an inline object literal
doesn't re-render every consumer.

**Async state is React 19's, not hand-rolled.** The load is a promise read
with `use()` behind a `<Suspense>`; the save is an Action (`useTransition`), so
`saving` is the transition's own pending flag. Between them they retired the
reducer, the `epoch` counter checked at 10 sites, the `mounted` ref, and the
shared `GraphQLClient` that was re-`setHeaders`-ed before every request (one
client per request now, so a token refresh mid-flight can't re-header a request
already out). Staleness is decided by **identity**: every load is tagged with
the key that asked for it (`endpoint|dataOwnerRef|netexId`), and a superseded
load resolves into a render nobody performs.

Two hooks, and the split is load-bearing: **`useEntityResource(config, netexId)`
must be called above the boundary** — a component that suspends on its *first*
render is discarded whole, hooks included, so a ref inside the suspending
component cannot hold the promise `use()` needs to see again on the retry. The
component rendering `<Suspense>` never suspends, so its ref can. `useEntityForm`
takes the resource as a prop.

`useEntityForm` contract (not exported; `src/EntityDetailsForm/hooks/`):
session inputs come from the **mandatory `SobekProvider`** (`endpoint`,
`headers`, `getHeaders`, `dataOwnerRef`) — wrappers no longer take them as
props, and the hook throws when no provider is above. Headers resolved **per
request** (dynamic wins over static), and no session input is ref-guarded any
more: nothing runs off an effect's dependency list, so inline literals can't
re-fire anything. `dataOwnerRef` is in the key, so an org switch re-loads and a
row fetched under one org can never land in a form showing another. It is also
stamped onto the mutation input from context at the wire edge (never from form
state) and filters both the load and the post-save refetch — but only when the
entity's `FIELDS` actually carries `dataOwnerRef` as `locked` (registry-driven,
not by key name: an Input without it must not get one). `netexId` set →
`undefined` keeps `value` and abandons the in-flight load; it does not blank the
form. Load settled-ness is a `load` phase (`idle|ok|error`) — there is **no
`pending`, and no `loading` flag at all**: a pending record has not committed,
so the branch that used to flash `Not found` on the first commit no longer
exists. `load === 'ok'` + no value renders `Not found: <netexId>`;
`load === 'error'` renders `errors.__init`, so a failed load is never reported
as a missing record. **Both halves fail alike**: load and save each normalize
the thrown error, hand the server's own messages to `onError`, and fall back to
a constant (`'Failed to load'` / `'Failed to save'`) only when the payload
carries no GraphQL `errors` array. Load messages also land in `errors.__init`,
joined by `'; '` (`onError` gets them unjoined). The load path normalizes
against an **empty** registry — a query takes a netexId, not an `input`, so
every message is general by construction and none can be lost to field routing.

A failed load is a **settled value, not a rejected promise**
(`{ ok: false, messages }`): `use()` would rethrow a rejection into the nearest
error boundary, unmounting the form and taking the edits with it. So failure is
data, and a failed *re*load still sits beside an editable entity — `held` (a
ref) keeps the last entity the server actually handed back, which is also what
survives a switch into create mode. `onError` fires from an effect keyed on the
settled result, so it fires once per record and never for a load the form has
moved on from.

**Host observation** (`onChange`, optional, ref-held so an inline arrow can't
re-fire the effect; dirty reaches the host through the session's `footer.dirty`). `onChange` fires on
*every* value change — load and post-save refetch included, not just edits — so
a host header can show the loaded name without waiting for a keystroke.
Observation only: the hook keeps owning the value, and feeding it back in as a
prop is unsupported (it would reintroduce the load races). Dirty is computed
against a `baseline` that is *derived*, not stored: the settled load, or what a
save moved forward (tagged with the key it belongs to, which is how a stale
save is ignored). The tag alone isn't the guard, though: the save's whole
completion — `held`, the draft reset, the error reset — is gated on a live-key
ref, because the one switch that *doesn't* suspend (edit → create) commits
while the Action is still out. Only `onSaved` fires regardless: the mutation
committed server-side, wherever the form went. That baseline is also dropped on
every key change (create mode included), or it would outrank the refetch when a
record is revisited and show what this session saved instead of what the server
now holds. `value = draft ?? baseline`, so
an untouched form **is** its baseline and a load or a save leaves it clean with
nothing to re-baseline. The draft is discarded when the record changes, so a new
record can't be masked by the previous one's edits. The comparison (`src/EntityDetailsForm/utils/dirty.ts`) treats `undefined | null | false |
'' | []` as one value, which is what stops an untouched Switch reporting `false`
against a null-backed baseline, or a text field typed into and cleared, from
reading as edits. `0` is deliberately not empty. Two zoned ISO timestamps compare
by instant (`sameInstant`), so a `datetime` set back reads clean whatever offset
the server spelled. `onChange` reaches the hook
through the generated wrapper's `...rest`.

**Loading.** While a record is in flight the wrapper's `<Suspense>` shows
`FormSkeleton` (`src/EntityDetailsForm/components/FormSkeleton.tsx`) as its
fallback, not a text placeholder — this is the whole of the loading branch now,
which is why the wrapper splits into `<Entity>Form` (boundary + resource) and
`<Entity>FormRecord` (the suspending half).
Its shape is **derived, never tuned**: `resolveSections`
(`src/EntityDetailsForm/utils/sections.ts` — extracted from `abstractForm` so
both call it) yields the same sections/fields the form will draw, and each
placeholder is sized from the field's `kind` (`KIND_H`). A new entity or an
edited `layout`/`variant` reshapes both at once, so there is no row-count
literal to drift (hathor's `VEHICLE_FORM_ROWS = 7` is the anti-pattern). The
arriving form fades in via `FormArrival`, which wraps the **presentation only**
— its keyframe animates `transform`, and a transformed ancestor becomes a
containing block, which would break any sticky descendant for the
length of the fade. Both honour `prefers-reduced-motion` (the guard also kills
MUI's `wave`, which ships none). Host reach is `skeletonProps`
(`FormSkeletonHostProps` = `ariaLabel` + `sx`); the shape is deliberately not
overridable. `Not found` and the load-error branch stay plain text — a skeleton
means "content is coming", which misreads on a terminal state.

**Edit session.** The wrappers render **the form only** — no footer, no TOC.
The host creates `useFormSession()` (`src/EntityDetailsForm/hooks/useFormSession.ts`),
passes it as `session`, and places `<EditFooter {...session.footer} />` and
`<SectionToc {...session.toc} />` wherever its layout wants (Fullpage: a band
across the page, a TOC column or pinned dropdown). The wrapper's record half
fills it through `useSessionConnection` — before its early returns — keyed by a
module-private symbol: it publishes `sections` (`tocSections`: stacked + ≥2
only), `dirty`, `saving`, `editable` (record branch rendered and
`mode === 'edit'`; Not-found / load-error / view are not), and registers
`handleSave` / `reset` into refs, so their per-edit identity never re-renders
the host. Connect and publish run in **layout effects**, so the publish lands
before paint. **While a record loads, the wrapper's Suspense fallback holds its
place**: `<Entity>FormPending` publishes the layout's `tocSections` with
`loading: true` (nothing editable, nothing to save), so a host TOC keeps its
shape instead of collapsing and coming back — `SectionToc`'s `loading` draws
each entry as a skeleton wrapping its own label (the dropdown: wrapping the
field), so the loaded TOC lands where its placeholder stood. The fallback
leaves in the commit the record connects in (unmount cleanups run before new
layout effects), so there is never a second live form. `session.loading` /
`toc.loading` is that flag — a direct load signal for the host, unlike
inferring one from a missing `onChange` value,
which cannot tell a slow record from a missing one. When Suspense hides an
already-mounted record (netexId / org change without a key remount), the
record disconnects and the fallback reconnects in its stead.
`footer.onSave` / `onCancel` forward only when the form is `editable`, dirty and
not saving (view, Not-found, load error, nothing connected, a clean form and an
in-flight save are all inert), so a host binding them to Ctrl+S can neither
save from those states nor double-send a create. A publish re-renders the host
synchronously before paint — the price of layout effects. A record switch (remount) disconnects the
old form and connects the new one, which clears the section. Two live forms on
one session: the later wins, with a `[FormSession]` warning. No session → the
form edits but cannot save. The footer itself is unchanged: status line plus
Cancel/Save, all **inert until `dirty`**, both locked while `saving`; Cancel is
the hook's `reset()` — drop the draft and the save errors, with no request, and
`errors.__init` survives (it is derived from the load). The `key` remount is
still the way to switch *records*. The band is **sticky, so its own
`backgroundColor` stays opaque** (`background.paper`) and the dirty tint rides
on top as a flat `linear-gradient` — an `alpha()` colour there is 92%
see-through. `labels` (English defaults), `slotProps` (applied *before* the
controlled `disabled`/`onClick`) and `sx` are the host's own props on
`EditFooter`.

- `mode` `'view' | 'edit'` — view disables inputs.
- `layout?` — whitelist of sections (`{ Section: [fields] }`). Omitted field not
  rendered but value round-trips via `onChange` (loss-free). Omit layout → flat.
- `variant?` `'tabs' | 'stacked'` — for ≥2 sections. Default `tabs`.
- `activeSection?` / `onActiveSectionChange?` — **stacked only**; the pair a
  table of contents wires to one piece of host state (`hooks/useSectionSpy`).
  Out: an `IntersectionObserver` reports the first section crossing the top 40%
  of the viewport. In: a *changed* `activeSection` scrolls that section into
  view (smooth, unless reduced motion). Three guards stop the two feeding each
  other: the mount-time value never scrolls, a value the form reported itself
  never scrolls, and the observer is muted from a request until `scrollend` —
  otherwise every section passed on the way is reported back as the new target
  (and a last section too short to reach the band could never stay selected).
  At the scroller's end the *last* section is reported instead, band or not —
  reaching the end changes no intersection, so that rule runs off a `scroll`
  listener. Sections are keyed by layout key (`data-section`); the effect key is
  the labels as JSON, never delimiter-joined (a key may hold any character). Flat and tabbed forms
  ignore both. On the presentational form only — the generated wrappers omit both from their props and feed them from the session.
  The other end is `SectionToc` (`src/SectionToc/`): a stateless `<nav>`
  taking `sections` / `active` / `onSelect`, with **no import from the form** —
  a data-aware host feeds it `session.toc` (the wrapper publishes `tocSections(FIELDS, layout, variant, patched)`, so the list matches what the form renders); a host of the presentational form calls `resolveSections` itself.
  `variant` `'list' | 'dropdown'`: same contract, so the dropdown keeps the scroll
  feedback (its value is `active`). Every pick reports via the item's `onClick`
  (a select fires no change for its current value). It measures nothing — the
  host picks the variant (Fullpage: dropdown below `md`; toolbar + TOC pinned
  in one header whose measured height is both the list column's sticky `top`
  and `html { scroll-padding-top }`, so `scrollIntoView` clears it; the
  toolbar collapses (#55) to a bar in the gutter right of the form, or below
  `md` to one slim row beside the dropdown, and that height follows; it starts
  collapsed, and folded its toggle is a database icon).
- `serverManaged` fields (`version`, `created`, `changed`, `changedBy`) hidden
  from editable model: locked even in edit, surfaced only to *see* meta/semantic
  context. Backend-owned — **not round-tripped**, never in write payload, don't
  travel back as edits. (vs ordinary omitted field, whose value *does* pass
  through `onChange`.) Stale after save — client refetches.
- `locked` fields (`dataOwnerRef`) — client-supplied but not user-editable:
  rendered and always disabled even in edit, **never sourced from form state**
  into the write payload (the host supplies the value at the wire edge — the
  hook stamps `dataOwnerRef` from context, so it *is* sent, just never from
  the edited entity). Errors on them route to `generalErrors`. Distinct from
  `serverManaged`: that means backend-owned and is *derived* by distill from
  the Entity/Input diff; `locked` is assigned explicitly via distill's
  `LOCKED_FIELDS` set (carried through the `reference` fast-path too, so a
  locked write-as-reference relation stays locked). The wrapper overlays the
  context value for display on **every** render
  (`{ ...(value ?? {}), dataOwnerRef }`), not just while `value` is undefined
  — otherwise the control keeps showing the org current at first keystroke
  while the save stamps the new one.
- Labels default to humanized key. Override per-field `{ field, label }`. No i18n
  dep — localization is client's job.
- `grid` fields render array-of-obj relations as a read-only table; cols
  auto-derived from row data (scalars, MultilingualStrings, and lists of scalars
  joined with ", " — e.g. axle positions; nested objects are skipped). Layout
  entry `entries` (`{ field, label }[]`, `field` = row-obj key) fixes col order
  + labels. Grid omits its own caption when alone
  in a section (tab/heading names it), shows it when beside other fields.
- `reference` fields edit a single relation by its identity leaf. With a layout
  entry `options` (`() => { value, label }[]`, value = referenced netexId) →
  single-select Autocomplete; omit (incl. zero-config) → free-text id field.
  Selection writes the `netexId` leaf; round-trips as the full relation object.
- `text` fields with a layout entry `options` → a select over host-supplied code
  values (e.g. `euroClass` over sobek's `EMISSION_STANDARD` list); writes the
  code itself, `None` clears. A stored value missing from the list is offered
  as its own option, so it shows and survives a save.
- `date` / `datetime` render native `<input type=date|datetime-local>` (no date
  dep). `datetime` shows the stored instant in the browser's local time and
  writes an edit back as UTC `…Z` (`utils/datetime`) — never a zone-less string.
- `slotProps?` (form-level) — per-`kind` MUI overrides. TextField-backed kinds
  (`text|number|name|enum|date|datetime`) take TextField `slotProps` (merged over
  the label-shrink default); `enumMulti`→Autocomplete, `switch`→`SwitchProps`,
  `grid`→`{ dataGrid }`. Per-field override is a planned later addition.
- `patched?` `'mark' | 'plain' | 'hide'` — how patched (not-yet-saved) fields
  show. Default `mark`; `plain` drops the `*` and its column; `hide` leaves them
  out like an omitted layout field (value still round-trips). Passed through
  `resolveSections`, so the skeleton and a host TOC drop the same fields.
- **Width** (#54) — each control takes a share of a row (`FieldWidth` `'full' |
  '1/2' | '1/3' | '1/4'`), and a section is one wrapping MUI `Grid`: fields keep
  layout order, narrow ones pack left → right, a `full` one starts its own row.
  Below `sm` everything is full. Resolved once in `resolveSections`: layout
  entry `width` > form-level `widths` (per kind) > `KIND_WIDTH` (`number` 1/3;
  `date`/`datetime`/`switch` 1/2; rest full) — zero-config forms included.
  `ResolvedField.width` + `gridSize()` feed both form and `FormSkeleton`, so the
  skeleton places the same cells. The `*` cell stays per control, inside its
  grid cell. Watch long unit captions at 1/3: the temperature pair in the
  story layout is `1/2` because it truncates in a ~620px column. The form
  stories and Fullpage expose one width radio per kind plus a `captions`
  radio (`pinned` = lib default, `floating` = MUI's, via
  `slotProps.<kind>.inputLabel.shrink`) from `src/stories/formControls.ts` —
  story-only, no lib prop; enumMulti / reference stay pinned.

## Collection

`createEntityCollection(fields, { filterFields })` (`src/EntityCollection/`)
— the list-side sibling of the form factory: presentational, rows in as a prop,
no fetch. The field keys are inferred from `fields`, so `columns` / `card` keys
are checked at compile time; the returned component is generic over the row
type, inferred from `rows` (no explicit `<Entity>` — TS can't infer one type
parameter while another is given). One `CollectionQuery` (`filters`, `search`, `sort`, `page`,
`pageSize`) is owned by the component (or mirrored from `query` /
`onQueryChange`), and **`applyQuery` is the only thing that decides what is
visible**. Both views render its output: `GridView` runs the DataGrid with
`sortingMode`/`paginationMode="server"` and `disableColumnFilter`, so the grid
never filters, sorts or pages on its own — that is what keeps `view: 'grid' |
'cards'` interchangeable. The toolbar is the collection's own for the same
reason: MUI X's toolbar primitives need a mounted grid, which cards don't have.

- `view` is a prop; the lib ships no toggle. The story
  (`VehicleTypeCollection.stories.tsx`) renders the bare component and drives
  `view` / `tools` / `filterMode` from Storybook controls — no wrapper chrome.
- `tools` whitelists `search | filter | sort | columns | density`; the last two
  render in grid view only. No CSV/Print.
- The toolbar is one row when it fits; on narrower screens the tools after the
  query field (sort, columns, density, actions) wrap onto the next line —
  deliberate, chosen over folding them into a "More" menu. Filters never add a
  row. Search and filter are one internal subcomponent,
  `QueryField` (`components/QueryField.tsx`): active filters sit as chips at
  the start of the search box, the typed text follows, the filter button (with
  a count) closes the field. The order *is* the semantics — filters first, then
  a search within what they left — so no caption is needed (the old
  "(from cached filter)" helper text is gone; the placeholder says "Search these
  rows"). At most two chips show, values cut at 14 chars (full text in
  `title`), the rest fold into a "+N" chip that opens the panel; Backspace in an
  empty field removes the last filter. Narrow widths: below `sm` only one chip
  shows before "+N"; chips are the only part that shrinks (ellipsis, full text
  in `title`) — the input has a zero flex basis with a `ch` minimum and the
  filter button never shrinks, so nothing clips at 360px. A separate chip row was tried and
  rejected: the button and its chips belong on the same line. `FilterPanel`
  (`FilterPanel.tsx`) is the controlled popover alone; `QueryField` owns its
  trigger. Not exported — it is built on the collection's own types.
- **Per-column rules, decided once.** `resolveColumns` gives every `Column`
  its own `display` / `matches` / `entryLabel` (identity: `compactId` /
  `idMatches` / `compactIdEntry`; everything else: as is), so no view, filter or
  chip branches on which field it holds. `collection.tsx` also decides the
  *effective query* once (usable page size, no sort on a non-column), keys the
  visible page once (`keyRows`) for both views, and memoises the pipeline per
  stage (`matchRows` → `sortRows` → `pageRows`).
- Accessibility rules the toolbar keeps (each pinned by a test): a filter chip's
  accessible name is its visible text plus `labels.removeFilter`, and removing
  one moves focus to the next chip, else the previous, else the search field;
  the unfilterable fields are a plain list named by its heading, never
  `aria-disabled`; the Columns menu items *are* the checkboxes (the inner MUI
  `Checkbox` is `aria-hidden`), and the last visible column cannot be hidden.
- **Filter reach is generated, not chosen.** `generateDocuments` emits
  `<Entity>FilterFields` from the `filter` argument of the entity's list query
  in the live schema (`dataOwnerRef` excluded — session context). Only those
  fields get a control; every other column is listed disabled. A `String` arg
  becomes `contains`, a list of strings or enums `anyOf` (plural → singular
  field: `transportModes` → `transportMode`); those turn selectable on the next
  codegen. Any other arg (Boolean, Int, a lone enum, one with no matching
  top-level field) is skipped with a `[docs] … is not offered` warning in the
  generate output — no control here could feed it a value of the right type.
  One condition per field, AND across fields.
- `pageSize` is normalised to `1..100` (`usablePageSize`): the community
  DataGrid throws above 100. A stale `sort` field is dropped before it reaches
  the grid, which would otherwise report an empty sort model back and rewrite
  the host's query.
- **Scope.** Search looks only at what is on screen (the grid's visible
  columns, or the fields a card shows). Filters reach every filterable field,
  shown or not, so a host's condition on a field outside `columns` still
  applies and gets a chip — matching what `toSobekFilter` sends. Sorting by a
  hidden column is allowed (an explicit choice).
- **Value rules.** A missing switch shows as a dash in both views. A string on
  an `anyOf` filter (and a pasted entry) splits on commas/whitespace; a list on
  `contains` stays one phrase, as sobek receives it. Text sorts with an `nb`
  collator (æ, ø, å after z) whatever the runtime locale; a non-numeric value
  in a number column sorts as missing. `defaultCollectionQuery` is frozen.
- `filterMode: 'client'` (default) applies the filters to `rows`;
  `'server'` skips that step and only emits them — `toSobekFilter(filters,
  filterFields)` gives the host the list query's `filter` argument. Search and
  sort are always client-side over the rows in memory, which is what putting the
  text after the filter chips says.
- **Identity.** On a card the id reads `::1004/ver3` (the column's `cardText` rule; the grid has its own Version column). Rows are keyed by `netexId@version` (`rowKeys`): two versions
  of one entity are two rows; a repeated pair is a data error and is warned
  about, not hidden. The `netexId` field is captioned `labels.id` ("Id") and
  *shown* compact everywhere — cells, cards, filter tags, chips —
  `VEH:VehicleType:1004` → `::1004` (`compactId`), full id as hover `title`.
  Search, sort and filter values stay full. The Id filter accepts `::1004`,
  `1004` (both match the last segment) or the full namespaced id as a fallback
  (`idMatches`); free-text ids commit on blur and are trimmed. Caveat:
  `toSobekFilter` sends typed entries as typed, so in server mode a compact
  entry reaches sobek un-expanded.
- `patched` and `grid` fields are never columns, card lines or filter entries
  (`resolveColumns`). A patched field is not on the wire, so a list fetched from
  sobek cannot carry it.
- Cards never statically import `@mui/x-data-grid` (lazy, as in `ObjectGrid`).
- Any query change except an explicit page change returns to page 0, and
  `applyQuery` clamps an out-of-range page — a controlled host can hold a stale
  page without getting an empty view.

Tests: `components/collection.test.tsx` is manifest-driven like
`wrappers.test.tsx` (rows built from the registry, filterable fields from the
generated map). The DataGrid renders rows under jsdom only with
`slotProps.dataGrid.disableVirtualization`.

## GraphQL → TS pipeline

Never hand-maintain entity shapes. Generate from live schema, distill to
per-entity modules.

- Schema URL: `https://entur.github.io/sobek/schema.graphqls`
- `npm run codegen` — download schema (`scripts/fetchSchema.ts`) → emit
  `src/generated/sobekTypes.ts` (types + runtime enums). Git-ignored artifact.
- `npm run distill` (chains codegen) — parse generated types → write **committed**
  `src/entities/*`. Each: `Entity` type (verbatim, nested), `FIELDS` registry
  (flat addressable map; value-object leaves hoisted w/ `path`; carries `kind`,
  `path`, `options`, `serverManaged`, `locked`).
  `kind` ∈ `text|number|name|switch|enum|enumMulti|grid|reference|date|datetime`.
  `serverManaged` **derived** = on `Entity`, not on `Input` (no client tag).
  `locked` **assigned** = member of distill's `LOCKED_FIELDS` set
  (`dataOwnerRef`) and not serverManaged (serverManaged wins on overlap).
  Array-of-identity-objects (e.g. `vehicles`) → one `grid` field (read-only
  table, `ObjectGrid`/MUI X Data Grid; always serverManaged). **Read-object /
  write-reference divergence**: a single relation whose same-named `Input` member
  is a *pure reference* (members ⊆ `{id, netexId}`, e.g. `transportType`/`deckPlan`
  via `*ReferenceInput`) → one `reference` field on the identity leaf (writable,
  not serverManaged; the fast-path `continue`s before `deriveFields`, so it must
  apply `locked` itself). Other single relations + id-less object arrays (e.g.
  `keyValues`) get no `FIELDS` entry but stay on `Entity`. Edits write one leaf by
  `path`, never whole object — so scalar edit can't drop a relation, and edited
  `value` round-trips as complete entity. `src/entities/index.ts` re-exports per
  entity name.

### Patch overlay

`schema/sobek.patch.graphqls` — committed SDL overlay applied before codegen,
for fields the live schema hasn't shipped. Currently the hathor#191 group (#50):
VehicleModel props, accessibility/facilities, operating temperatures on
VehicleType; completion date, validity, comms ids and `lifecycleStatus` on
Vehicle — plus the 3D geometry inputs (`sections`, `tyreDiameter`, `baseColor`,
`roofEquipment`, metres; #51) on both. The overlay declares its own types,
which distill handles by its ordinary rules: enums → `enum`/`enumMulti`,
`ValidBetween` → hoisted `fromDate`/`toDate` (`datetime`), the id-less
`KeyValue` list → no `FIELDS` entry, and `BusSection` (it carries an `id`) → a
read-only `grid` like `vehicles`. Extends **both** `type VehicleType`
and `input VehicleTypeInput`: the read half satisfies distill's "Input ⊆ Entity"
check, the input half keeps the field out of `serverManaged` (derived = on
`Entity`, not on `Input`) — read-only extend ⇒ permanently locked control. When
sobek ships a field for real, delete matching `extend` lines by hand (done for
`dataOwnerRef`, now a real read field).

**Invariant: the patch is an input to `codegen.ts` only.** Wire-facing
generators (`scripts/generateDocuments.ts`, `codegen-operations.ts`) read
`sobek.schema.graphqls` alone, so a patched field is absent from every selection
set by construction — no prune list to drift. Dropping the patch from
`codegen-operations.ts` also makes it *validate* documents against the live
schema, so a leak fails codegen instead of the backend (nothing else catches it:
`src/stories/mockEndpoint.ts` is a schema-free `fetch` interceptor).

The write half can't be fixed by a document — `$input` is a runtime variable —
so `generateDocuments` emits `src/generated/operations/inputKeys.ts`, one
`<Entity>InputKeys` mask per manifest entity read from the live schema's
`<Entity>Input`. `useEntityForm` applies it via `reduceToSobekInput(inp, mask)`
right after `toInputEntity`, before the `dataOwnerRef` stamp (a wire field, so
unaffected). The `satisfies Record<keyof <Entity>Input, 1>` on each mask is a
real guard, not decoration: keys come from `generateDocuments`' schema read, the
type from graphql-codegen's — feed the patch to either and the build fails.
`toInput.ts` is deliberately untouched, and `distillTypes.ts` changes nothing
about what a patched field *is* — they stay editable and round-trip through
`onChange`; only the wire edge strips them.

**The `*` marker.** Distill does read the overlay for one thing: `parsePatch`
collects each `extend type <Entity>` and stamps `patched: true` on the derived
`FIELDS` entries (hoisted leaves of a patched object included). Display
metadata only — it never decides what is sent. The form draws a bold red `*` (`PATCH_MARK_SX`, `error.main`) in a column
*after* the control, outside the input (`row()` in `abstractForm`), with a
"not saved" hint as `title`/`aria-label`. The cell is per row (`marked` in
`utils/sections`): only a marked control is `PATCH_MARK_COL_PX` narrower, every
other control keeps the full width — chosen over a form-wide column, which
shortened every input to line up with the few marked ones. `FormSkeleton`
narrows the same rows by the same width. Derived, so the mark
disappears with the `extend` line. A host can also turn it off per form with the
`patched` prop (`plain` / `hide`), which the generated wrappers hand to both the
presentation and the skeleton, never to the hook.
Residue: `Types.<Entity>Input` in `sobekTypes.ts` stays patched, so the
*variables type* still permits those keys at compile time — only the runtime
mask stops them.

## Tests

Vitest + Testing Library, jsdom. `npm run test` — `pretest` runs `generate`
(→ `distill` → `codegen`), so the suite always runs against freshly generated
wrappers and entities. Corollary: a hand-edit under `formImpls/` is silently
wiped by `npm test`.

**Never write a test per generated entity.** Anything covering generator output
is driven by `entities.manifest.json`, so a new entity is covered the moment it
is generated: `formImpls/wrappers.test.tsx` does `describe.each` over the
manifest and resolves each component from the generated `formImpls/index.ts`
barrel (`${Entity}Form`) and its registry from the `entities` barrel
(`${camel}Fields`). Everything entity-shaped is derived — `queryRoot` builds the
mock response, locked fields come from `FIELDS`, labels from `humanize(key)`. No
entity literals in the assertions. It throws when a manifest entry has no
exported wrapper or no registry, so a broken generator run fails loudly rather
than silently skipping. (`vehicleForm.test.tsx` was the anti-pattern: VehicleType
shipped untested because nobody wrote the sibling file.)

Three techniques worth keeping:

- **Anything that suspends must be rendered inside an *awaited* `act`.** A
  render that suspends parks its retry on the act queue, and the synchronous
  `act` inside RTL's bare `render`/`renderHook` has already exited by then — the
  tree sits on its fallback forever and every `waitFor` times out with no
  explanation. `await act(async () => { render(…) })`, then `waitFor` as usual.
  Both suites wrap this as `mount()`/`swap()`. React also throttles a
  fallback→content reveal by ~300 ms, so the reveal lands after the act exits,
  not inside it.
- **First-commit assertions need `flushSync` on a bare `createRoot`**, not RTL's
  `render` — `render` wraps in `act()`, which flushes passive effects before it
  returns and hides anything that only exists on the first commit (this is what
  masked the `Not found` flash). `flushSync` commits synchronously and leaves
  passive effects scheduled.
- **A regression test must be seen failing against the pre-fix code.** The
  original `Not found` test passed vacuously — its `waitFor` was satisfied by the
  flash it was meant to forbid. Revert the fix, watch it fail, restore.

`scripts/*.test.ts` test the generator/distiller as string transforms (assert on
emitted source), so template changes are pinned without running codegen.

## Build

`npm run build` — Vite library mode → `dist/`. Emits ESM (`index.js`), CJS
(`index.cjs`), types (`index.d.ts` via `vite-plugin-dts`). React/MUI/Emotion +
`graphql-request` are externalized peer deps — host owns single copy (avoids
"two Reacts"). React 19, MUI 7, Emotion 11 pinned to match hathor.
`graphql` is never imported directly (only through `graphql-request`), so
externalizing the client keeps the graphql runtime out of `dist` too — no
`dependencies` block at all now.
