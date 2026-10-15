# @entur/iteru-webcomps

A small React MUI component library for Entur's
[hathor](https://github.com/entur/hathor) frontend. Components are built on
[MUI](https://mui.com) and typed directly from the live
[sobek](https://github.com/entur/sobek) GraphQL schema. Documented and previewed
with [Storybook](https://storybook.js.org).

> Status: seed. The library ships generated data-aware form components
> (`VehicleForm`, `VehicleTypeForm`) typed from the live sobek GraphQL schema.
> Per-entity bindings (`vehicleTypeFields`, `vehicleFields`) are generated from
> the live schema. Not published to a package registry yet; the Storybook is
> deployed to GitHub Pages.

## Components

### `VehicleForm` / `VehicleTypeForm`

These generated components load an entity from sobek, render a schema-driven
form, and save edits back. They are the public form API.

Session inputs (endpoint, headers, tenant) are **not** props — they come from a
mandatory `SobekProvider` above the form; see [Session context](#session-context).

```tsx
import { SobekProvider, VehicleForm, type VehicleLayout } from '@entur/iteru-webcomps';

const layout: VehicleLayout = {
  Edit: ['name', 'registrationNumber', 'operationalNumber'],
  Dates: ['buildDate', 'registrationDate'],
};

<SobekProvider
  value={{
    endpoint: 'https://api.entur.io/sobek/graphql',
    headers: { 'Client-Name': 'hathor' },
    getHeaders: () => ({ Authorization: `Bearer ${token}` }),
    dataOwnerRef: 'NOG:Authority:cP4aPiJ7c39',
  }}
>
  <VehicleForm
    netexId="VEH:Vehicle:701"
    mode="edit"
    layout={layout}
    onSaved={(id) => router.push(`/vehicles/${id}`)}
    onError={(msgs) => toast.error(msgs.join(', '))}
  />
</SobekProvider>
```

| Prop | Type | Notes |
| --- | --- | --- |
| `netexId?` | `string` | Entity to load. Omit for create mode. Changing it from set → `undefined` **keeps** the current value (in-progress edits survive) and discards any in-flight load — it does not blank the form. |
| `mode?` | `'view' \| 'edit'` | Default `'edit'`. |
| `layout?` | `Layout<EntityField>` | Whitelist of sections (see below). Omitted → flat, all fields. |
| `variant?` | `'tabs' \| 'stacked'` | ≥2 sections. Default `'tabs'`. |
| `slotProps?` | `ControlSlotProps` | Per-kind MUI overrides (TextField, Switch, DataGrid, Tabs). |
| `onSaved?` | `(netexId: string) => void` | Called after successful save + refetch. |
| `onError?` | `(generalErrors: string[]) => void` | Called with non-field GraphQL / network errors, **on load and on save**. Carries the server's own messages; falls back to `['Failed to load']` / `['Failed to save']` when the failure yields no usable GraphQL errors (missing *or* empty `errors`). Field-level validation on save routes to the fields for inline display and fires no callback. |

While an entity is loading the component renders `Loading...`; a settled load
that returned no rows renders `Not found: <netexId>`, and a *failed* load
renders the load error — the three states are distinct, so a network failure is
never reported as a missing record. The rendered load error is the server's
message (several joined by `'; '`), so a 401, a 403 and a dropped socket stay
distinguishable; `onError` fires alongside it with the same messages unjoined,
which is where a host hooks retry, re-auth or localization.

#### Session context

`SobekProvider` is **mandatory** for the data-aware forms: rendering one without
a provider above it throws. It is the single source of truth for the session —
these were previously per-form props.

| Field | Type | Notes |
| --- | --- | --- |
| `endpoint` | `string` | sobek GraphQL endpoint URL. |
| `headers?` | `Record<string, string>` | Static headers sent with every request. |
| `getHeaders?` | `() => Record<string, string> \| Promise<...>` | Dynamic headers (e.g. OIDC tokens). Called once per request, so a refreshed token is always picked up. Safe to pass as an inline literal — identity churn never re-triggers a load. |
| `dataOwnerRef` | `string` | Tenant discriminator (e.g. `NOG:Authority:cP4aPiJ7c39`). Filters every load and the post-save refetch, and is stamped onto the write payload at the wire edge — never taken from form state, so an entity loaded under one org can't be written back under another. Unlike the headers, changing it **does** re-fire every mounted load. |

`dataOwnerRef` is rendered as a `locked` field: visible, always disabled (even
in `edit` mode), and never editable by the user.

#### Layout contract

`layout` is a **whitelist of sections**: each key becomes a section label; its
array is the ordered list of fields to render in that section. A layout item is
either a bare field key or an object with extra per-field config:

```ts
const layout: VehicleTypeLayout = {
  Identity: ['name', 'shortName', { field: 'dataOwnerRef', label: 'Owner' }],
  Dimensions: ['length', 'height', 'width', 'weight'],
};
```

Key points:

- **Loss-free omission** — a field omitted from `layout` is not rendered, but
  its value survives a save. Omitting a field never drops data.
- **Omit `layout` entirely** — renders all fields in a flat single panel.
- **Single section renders flat** — no tab bar or panel header; the section key
  is ignored visually.
- **`variant`** — when there are ≥2 sections, `'tabs'` (default) shows a tab
  bar with one panel visible at a time; `'stacked'` renders all panels top-to-bottom.
- **`serverManaged` fields** — fields flagged `serverManaged` (backend-owned:
  `version`, `created`, `changed`, `changedBy`) render locked even in `edit`
  mode. They are **not round-tripped** — the backend owns them. Their displayed
  values go stale after a successful save; the component refetches to refresh them.
- **`reference` fields** (e.g. `Vehicle.transportType`, `VehicleType.deckPlan`)
  edit a single relation by its identity leaf. Pass `options` to render an
  Autocomplete rather than a plain id field:

  ```ts
  const layout: VehicleLayout = {
    Edit: [{
      field: 'transportType',
      label: 'Vehicle type',
      options: () => [
        { value: 'VEH:VehicleType:1', label: 'Class 70 EMU' },
        { value: 'VEH:VehicleType:2', label: 'Class 80 DMU' },
      ],
    }],
  };
  ```

  `value` in each option is the referenced entity's `netexId`; `label` is
  display-only.
- **Grid fields** — array-of-identity relations (e.g. `VehicleType.vehicles`)
  render as a read-only `ObjectGrid`. Use `entries` to fix columns:

  ```ts
  const layout: VehicleTypeLayout = {
    Vehicles: [{ field: 'vehicles', entries: [
      { field: 'netexId', label: 'NeTEx ID' },
      { field: 'name', label: 'Name' },
    ] }],
  };
  ```

- **Labels** default to a humanized field key (`seatingCapacity` → "Seating Capacity").
  Override via `label`. There is **no i18n dependency** — localization is the
  client's responsibility.

## The GraphQL → TypeScript pipeline

The library never hand-maintains entity shapes. It generates TypeScript from the
**live sobek schema** using
[The Guild's GraphQL Code Generator](https://the-guild.dev/graphql/codegen),
then distils that into per-entity modules.

- **Canonical schema URL:** `https://entur.github.io/sobek/schema.graphqls`
- `npm run codegen` downloads that schema (`scripts/fetchSchema.ts`) and emits
  `src/generated/sobekTypes.ts` containing all entity types and enums
  (`PropulsionType`, `FuelType`, `HybridCategory`, `TransportMode`, `FareClass`,
  …). Enums are emitted as **runtime** TypeScript enums so the form both
  type-checks against them and lists their members in dropdowns.
- The generated file and the downloaded schema are **git-ignored** — they are
  build artifacts, not source.

### The distill step

`npm run distill` (which chains `npm run codegen`) parses
`src/generated/sobekTypes.ts` and writes **committed** per-entity modules to
`src/entities/*`. Each module contains:

- **`Entity` type** — the full read entity type, verbatim (nested structure
  preserved for value round-tripping).
- **`FIELDS` registry** — a flat, addressable map of every renderable field.
  Value-object leaves (e.g. `passengerCapacity.seatingCapacity`) are hoisted
  into individually-addressable entries with their access path (`path:
  ['passengerCapacity', 'seatingCapacity']`). Each entry carries:
  - `kind` — the control family (`text`, `number`, `name`, `switch`, `enum`,
    `enumMulti`, `grid`, `reference`, `date`, `datetime`).
  - `path` — access path into the entity value.
  - `options` — enum member list (for `enum`/`enumMulti`).
  - `serverManaged` — **derived, not hand-set**: a field present on the read
    `Entity` but absent from its `Input` is backend-owned, so distill flags it.
    No client tagging.
- **Array-of-object relations** (e.g. a vehicle type's `vehicles` list — an array
  of identity-bearing objects) distill to a single `grid` field. It renders as a
  **read-only table** (`ObjectGrid`, built on
  [MUI X Data Grid](https://mui.com/x/react-data-grid/)) whose columns are derived
  at runtime from the row data — scalar and `MultilingualString` leaves shown,
  nested objects/arrays skipped. Such relations are absent from the `Input` type,
  so they distill as `serverManaged` automatically and are never edited here.
  Place the field in a layout section (`Vehicles: ['vehicles']`) to render it.
  To fix the column order and labels, give the layout entry nested `entries`
  (each a `{ field, label }` where `field` is a row-object key):

  ```ts
  const layout: VehicleTypeLayout = {
    Vehicles: [{ field: 'vehicles', entries: [
      { field: 'netexId', label: 'NeTEx ID' },
      { field: 'name', label: 'Name' },
    ] }],
  };
  ```

  Omit `entries` to auto-derive every column. `entries` is ignored for non-grid
  fields.
- **Single relations and id-less object arrays** (e.g. a one-to-one linked entity,
  or a `keyValues` list with no identity) get **no** `FIELDS` entry — there is no
  control family for them and editing them is out of scope for a flat details
  form. They stay on the `Entity` type, so they ride along on `value` untouched:
  every edit writes a single leaf by its `path`, never the whole object, so
  editing a scalar can't drop a relation. This is what lets the edited `value`
  round-trip back as a complete entity.
- The `FIELDS` data and enum runtime values are bundled into the published JS;
  `Entity` types are type-only and erased at runtime.

The public API re-exports each module under its entity name:

```ts
// src/entities/index.ts (auto-generated)
export type { Entity as VehicleType, EntityLayout as VehicleTypeLayout } from './vehicleType';
export { FIELDS as vehicleTypeFields } from './vehicleType';
export type { Entity as Vehicle, EntityLayout as VehicleLayout } from './vehicle';
export { FIELDS as vehicleFields } from './vehicle';
```

### Ahead-of-backend patch overlay

`schema/sobek.patch.graphqls` is a committed SDL overlay applied before codegen
runs, carrying fields the domain needs but the live sobek schema has not shipped
yet:

```graphql
extend type VehicleType {
  manufacturer: String
  range: Float
  fullCharge: Float
  carLoading: Boolean
}
extend input VehicleTypeInput {
  manufacturer: String
  range: Float
  fullCharge: Float
  carLoading: Boolean
}
```

Extending **both** halves is deliberate. The read `type` satisfies the distill
script's "Input ⊆ Entity" check (every field in `VehicleTypeInput` must exist on
`VehicleType`). The `input` keeps the field *out* of the `serverManaged` set,
because distill derives that flag from "present on `Entity`, absent from
`Input`" — extend only the read type and the field renders permanently locked.

The generated types are therefore deliberately **ahead of the live read
schema**. When sobek ships a field for real, delete the matching `extend` lines
by hand (as was done for `dataOwnerRef`, which is now a genuine read-schema
field).

### Keeping the overlay off the wire

The library *does* execute GraphQL operations, so an ahead-of-schema field would
be rejected by the backend if it reached a request. One invariant prevents that:

> `schema/sobek.patch.graphqls` is an input to `codegen.ts` only. Every
> wire-facing generator reads `sobek.schema.graphqls` alone.

- **Reads.** `scripts/generateDocuments.ts` builds selection sets from the live
  schema, so a patched field is never selected — there is no prune list to keep
  in sync. `codegen-operations.ts` does the same and therefore *validates* the
  generated documents against the live schema: a leak fails codegen rather than
  the backend.
- **Writes.** `$input` is a runtime variable, so no document can filter it.
  `generateDocuments` emits `src/generated/operations/inputKeys.ts` with one
  `<Entity>InputKeys` mask per entity, read from the live `<Entity>Input`;
  `useEntityForm` applies it through `reduceToSobekInput` immediately after
  `toInputEntity`. Each mask carries
  `satisfies Record<keyof <Entity>Input, 1>`, so the keyset and the generated
  type must agree or the build fails.

The form model is untouched by all this: patched fields render as ordinary
editable controls and round-trip through `onChange`. Only the wire edge drops
them.

## Building the library

`npm run build` uses [Vite's *library mode*](https://vite.dev/guide/build#library-mode).
Some terms, expanded for anyone new to library packaging:

- **ES module (`dist/index.js`)** — the modern JavaScript module format, loaded
  with `import`. This is what bundlers (Vite, webpack, etc.) prefer; it
  tree-shakes well (unused exports get dropped from the consumer's bundle).
- **CommonJS (`dist/index.cjs`)** — the older Node.js module format, loaded with
  `require`. Shipped alongside the ES module so the package works in
  older/Node-style toolchains too.
- **Type declarations (`dist/index.d.ts`)** — `.d.ts` files describe the types
  of the compiled JavaScript. They give consumers autocomplete and
  type-checking without shipping the TypeScript source. Generated here by
  [`vite-plugin-dts`](https://github.com/qmhc/vite-plugin-dts).
- **Externalised peer dependencies** — React, MUI, Emotion and `graphql-request`
  are *not* bundled into `dist`. They are declared as **peer dependencies**: the
  consuming app is expected to already have them, and supplies its single shared
  copy. Bundling our own copies would bloat the output and, with React
  especially, cause subtle "two Reacts" bugs (hooks throwing, context not
  matching). The host app's copy is the only one in play. Externalising
  `graphql-request` also keeps `graphql` — which this library never imports
  directly, only reaches through the client — out of the bundle entirely.

The `package.json` `exports` map points each consumption style at the right
file: `import` → the ES module, `require` → the CommonJS file, `types` → the
declarations.

## Storybook & deployment

- `npm run storybook` — run Storybook locally on port 6006.
- `npm run build-storybook` — build the static Storybook to `storybook-static/`.
- CI (`.github/workflows/storybook.yml`) runs `distill` → `build-storybook` →
  deploy to **GitHub Pages** on every push to `main`. Enable Pages for the repo
  with the "GitHub Actions" source.

## Scripts

| Script | Does |
| --- | --- |
| `npm run codegen` | Download schema → generate `src/generated/sobekTypes.ts`. |
| `npm run distill` | Download schema → codegen → write `src/entities/*`. |
| `npm run build` | Library build to `dist/` (runs `distill` first). |
| `npm run storybook` | Local Storybook dev server (runs `distill` first). |
| `npm run build-storybook` | Static Storybook build (runs `distill` first). |
| `npm run test` | Vitest unit tests (runs `distill` first). |
| `npm run typecheck` | `tsc --noEmit` (runs `distill` first). |

## Versions

React 19, MUI 7, and Emotion 11 are pinned to match
[hathor](https://github.com/entur/hathor) (the primary consumer). They are peer
dependencies — the host app owns the actual versions. So is
`graphql-request` (^7.4.0), the transport the data-aware wrappers use; it brings
its own `graphql` peer (`14 - 16`), auto-installed by npm/yarn but not by pnpm.
