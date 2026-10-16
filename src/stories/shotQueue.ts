/**
 * Many bus PNGs from one off-screen stage. A browser keeps about 16 WebGL
 * contexts, so a page of cards must never hold a stage each: every card asks
 * one queue, which shoots in request order, one at a time, and caches each PNG
 * by its input. The stage is made on first use and released once the queue has
 * been idle a while. Story-only, like the 3D preview.
 */
import { mkStageShot, mkViews, type ShotStage } from "@entur/iteru-3dbus";
import type { BusInput } from "../index";
import { build, VIEW } from "./busScene";

// Shot size in CSS px (3dbus applies the pixel ratio): 16:10, the cards-big
// picture area's shape. DETAIL is a third of the texture density, about twice
// as fast, which a card-sized picture doesn't miss.
export const SHOT_W = 320, SHOT_H = 200;
const DETAIL = 0.35;
// Release the stage (its WebGL context) after this long with nothing queued.
const IDLE_MS = 2_000;
// PNGs kept, least recently asked for dropped first: above the story's rows.
const CACHE_MAX = 300;

/** The browser gave no WebGL context: nothing queued at the time can be shot. */
export class NoWebGL extends Error {}

/** Rejects a request whose caller went away first. */
const aborted = () => new DOMException("Shot no longer wanted", "AbortError");

interface Job {
  key: string;
  inp: BusInput;
  /** Live requesters; one that is 0 when its turn comes is skipped. */
  wanted: number;
  resolve: (url: string) => void;
  reject: (e: unknown) => void;
}

export interface ShotQueueOpts {
  /** Colours the ground: hex / rgb() / rgba(), the colour the PNG lies on. */
  bg: string;
  w?: number;
  h?: number;
  detail?: number;
  idleMs?: number;
  cacheMax?: number;
}

export interface ShotQueue {
  /** A PNG's blob URL for `inp`, from the cache or once its turn comes.
   *  Aborting `signal` drops the request; a shot already under way still
   *  lands in the cache. */
  request(key: string, inp: BusInput, signal?: AbortSignal): Promise<string>;
  /** The cached PNG for `key`, if it is already shot. */
  peek(key: string): string | undefined;
  /** Release the stage, fail what is queued and revoke every cached PNG. */
  dispose(): void;
}

/**
 * A queue shooting bus PNGs on one lazily made stage.
 *
 * @param opts ground colour, plus size / detail / timing overrides
 * @returns `request`, `peek` and `dispose`
 */
export function mkShotQueue(opts: ShotQueueOpts): ShotQueue {
  const { bg, w = SHOT_W, h = SHOT_H, detail = DETAIL, idleMs = IDLE_MS, cacheMax = CACHE_MAX } = opts;
  // Insertion order is recency: a hit moves its key to the end.
  const cache = new Map<string, Promise<string>>();
  const urls = new Map<string, string>();
  const queued = new Map<string, Job>();
  let stage: ShotStage | null = null, running = false;
  let idle: ReturnType<typeof setTimeout> | undefined;

  const release = () => {
    stage?.dispose();
    stage = null;
  };

  const forget = (key: string) => {
    cache.delete(key);
    const url = urls.get(key);
    if (url) URL.revokeObjectURL(url);
    urls.delete(key);
  };

  // Only shot PNGs are dropped: a pending entry has a requester waiting on it.
  const evict = () => {
    for (const key of cache.keys()) {
      if (cache.size <= cacheMax) return;
      if (urls.has(key)) forget(key);
    }
  };

  const shoot = async (s: ShotStage, inp: BusInput): Promise<string> => {
    const bus = build(inp, detail);
    s.add(bus.group);
    try {
      mkViews(s, () => bus)(VIEW, true); // instant: a shot stage has no frame loop
      return URL.createObjectURL(await s.shot());
    } finally {
      s.drop(bus.group);
    }
  };

  const next = (): Job | undefined => queued.values().next().value;

  const pump = async () => {
    if (running) return;
    running = true;
    clearTimeout(idle);
    for (let job = next(); job; job = next()) {
      queued.delete(job.key);
      if (job.wanted <= 0) {
        cache.delete(job.key);
        job.reject(aborted());
        continue;
      }
      try {
        stage ??= mkStageShot({ w, h, bg });
      } catch (e) {
        // No context for this job means none for the rest queued with it.
        const err = new NoWebGL(e instanceof Error ? e.message : String(e));
        for (const j of [job, ...queued.values()]) {
          cache.delete(j.key);
          j.reject(err);
        }
        queued.clear();
        break;
      }
      try {
        const url = await shoot(stage, job.inp);
        urls.set(job.key, url);
        job.resolve(url);
        evict();
      } catch (e) {
        cache.delete(job.key);
        job.reject(e);
      }
    }
    running = false;
    idle = setTimeout(release, idleMs);
  };

  return {
    request(key, inp, signal) {
      if (signal?.aborted) return Promise.reject(aborted());
      let shot = cache.get(key);
      if (shot) {
        cache.delete(key);
        cache.set(key, shot);
      } else {
        shot = new Promise<string>((resolve, reject) => queued.set(key, { key, inp, wanted: 0, resolve, reject }));
        shot.catch(() => {}); // a skipped job rejects with nobody listening
        cache.set(key, shot);
      }
      const job = queued.get(key);
      if (job) {
        job.wanted++;
        signal?.addEventListener("abort", () => job.wanted--, { once: true });
      }
      // Next microtask, not now: every card of one render queues first, so a
      // stage that can't be made fails them together, once.
      queueMicrotask(() => void pump());
      if (!signal) return shot;
      const mine = shot;
      return new Promise<string>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(aborted()), { once: true });
        mine.then(resolve, reject);
      });
    },
    peek: key => urls.get(key),
    dispose() {
      clearTimeout(idle);
      release();
      for (const j of queued.values()) j.reject(aborted());
      queued.clear();
      [...cache.keys()].forEach(forget);
    },
  };
}

const queues = new Map<string, ShotQueue>();

/**
 * The page's one queue for a ground colour, so every card shares a stage and a
 * theme switch shoots on a stage of its own colour.
 *
 * @param bg the ground colour
 * @returns the shared queue
 */
export const shotQueueFor = (bg: string): ShotQueue => {
  let q = queues.get(bg);
  if (!q) queues.set(bg, (q = mkShotQueue({ bg })));
  return q;
};
