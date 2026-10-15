/**
 * A tiny in-browser stand-in for the sobek GraphQL endpoint, so the *data-aware*
 * forms (`VehicleForm` / `VehicleTypeForm`), which really `fetch`, can run inside
 * Storybook with no server.
 *
 * Iteration 1 is intentionally static: reads are answered from per-entity seed
 * maps, and the save mutation just echoes the id back — nothing is written, so a
 * refetch after save returns the original record. Later iterations can make the
 * store mutable (persist saves) or swap this for MSW.
 *
 * It patches `window.fetch` once (idempotent) and only intercepts requests to
 * {@link MOCK_ENDPOINT}; every other URL passes through to the real `fetch`.
 */
import { vehicleSeed, vehicleTypeSeed } from "./initDataSets";

/** The URL to hand a form as its `endpoint`; only these calls are mocked. */
export const MOCK_ENDPOINT = "https://mock.local/graphql";

/** Tenant discriminator the stories' `SobekProvider` supplies. The mock
 *  ignores filters, so any realistic value works. */
export const MOCK_OWNER_REF = "NOG:Authority:mock-owner";

/** Marker so the patch is installed at most once per session. */
const PATCHED = Symbol.for("iteru-webcomps.mockFetch");

// Artificial latency. Without it every response resolves in the same tick, so
// the load states the forms render for themselves — the shaped `FormSkeleton`,
// the arrival fade, the footer's `saving` lock — never paint long enough to
// see. Reads are the slower of the two, as they are against a real backend.
const DEFAULT_READ_MS = 600, DEFAULT_WRITE_MS = 350;

/** Mutable so a story can retune it *after* the one-shot install. */
const latency = { read: DEFAULT_READ_MS, write: DEFAULT_WRITE_MS };

/**
 * Retune the mock's response latency at runtime.
 *
 * `installStoriesMock` patches `fetch` once per session, so a story that wants
 * a different delay has to set it here rather than by re-installing.
 *
 * @param next partial override; `0` disables the delay for that half
 */
export function setMockLatency(next: Partial<typeof latency>): void {
  Object.assign(latency, next);
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

/** One entity's read/write wiring for the mock. */
type EntityMock = {
  /** Operation-name entity segment — matches `Get<name>` / `Update<name>`. */
  name: string;
  /** List-query envelope key (the query's `resultPath[0]`). */
  listField: string;
  /** Mutation result field. */
  saveField: string;
  /** Read store keyed by `netexId`. */
  seed: Record<string, unknown>;
};

// VehicleType before Vehicle: `pick()` uses a `\b`-anchored regex, so "Vehicle"
// won't match inside "VehicleType" regardless of order — but keeping the more
// specific one first documents intent.
const MOCKS: EntityMock[] = [
  { name: "VehicleType", listField: "vehicleTypes", saveField: "createOrUpdateVehicleType", seed: vehicleTypeSeed },
  { name: "Vehicle", listField: "vehicles", saveField: "createOrUpdateVehicle", seed: vehicleSeed },
];

/** Extract a string URL from any `fetch` first-arg form. */
const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/** 200 JSON response wrapping `data` in the GraphQL `{ data }` envelope. */
const gql = (data: unknown): Response =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** Pick the entity whose `Get`/`Update` operation name appears in the query. */
const pick = (query: string): EntityMock | undefined =>
  MOCKS.find((m) => new RegExp(`(?:Get|Update)${m.name}\\b`).test(query));

/**
 * Install the mock `fetch` for both entities. Safe to call from module scope and
 * more than once (idempotent). Routing is by variable shape then operation name:
 * `{ input }` → the `createOrUpdate…` mutation; `{ filter }` → the `Get…` query;
 * the entity is disambiguated by the operation name in the request's query text.
 */
export function installStoriesMock(): void {
  const w = window as typeof window & { [PATCHED]?: boolean };
  if (w[PATCHED]) return;
  w[PATCHED] = true;

  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!urlOf(input).startsWith(MOCK_ENDPOINT)) return real(input, init);

    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const mock = pick(String(body.query ?? ""));
    if (!mock) return real(input, init); // unknown op → pass through

    const vars = (body.variables ?? {}) as {
      input?: { netexId?: string };
      filter?: { netexIds?: string[] };
    };

    // Mutation: echo the incoming id (or a new-record placeholder). No write.
    if (vars.input) {
      await sleep(latency.write);
      return gql({ [mock.saveField]: vars.input.netexId ?? `VEH:${mock.name}:NEW` });
    }

    // Query: look the record up by its first requested netexId.
    await sleep(latency.read);
    const netexId = vars.filter?.netexIds?.[0];
    const entity = netexId ? mock.seed[netexId] : undefined;
    return gql({ [mock.listField]: { content: entity ? [entity] : [] } });
  };
}
