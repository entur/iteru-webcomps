/**
 * The shot queue with 3dbus mocked (jsdom has no WebGL): one stage for many
 * shots, one shot at a time, cached by key, and released when idle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkStageShot } from "@entur/iteru-3dbus";
import type { BusInput } from "../index";
import { mkShotQueue, NoWebGL } from "./shotQueue";

/** Each `shot()` waits until the test settles it, so ordering is observable. */
const pending: { resolve: (b: Blob) => void; reject: (e: unknown) => void }[] = [];
const stages: { dispose: ReturnType<typeof vi.fn> }[] = [];

vi.mock("@entur/iteru-3dbus", () => ({
  MM: 0.001,
  total: () => 12_000,
  faces: () => ({}),
  mkBus: () => ({ position: { x: 0 } }),
  mkViews: () => () => {},
  mkStageShot: vi.fn(() => {
    const s = {
      add: vi.fn(),
      drop: vi.fn(),
      dispose: vi.fn(),
      shot: () => new Promise<Blob>((resolve, reject) => pending.push({ resolve, reject })),
    };
    stages.push(s);
    return s;
  }),
}));

const IDLE_MS = 50;
const inp = {} as BusInput;
/** Let queued promise callbacks run (the queue awaits between jobs). */
const flush = () => vi.advanceTimersByTimeAsync(0);
const settle = async (i = 0) => {
  pending.splice(i, 1)[0].resolve(new Blob());
  await flush();
};

let n = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  pending.length = 0;
  stages.length = 0;
  n = 0;
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:${++n}`, revokeObjectURL: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const queue = (over = {}) => mkShotQueue({ bg: "#fff", idleMs: IDLE_MS, ...over });

describe("mkShotQueue", () => {
  it("shoots many on one stage, one at a time, in request order", async () => {
    const q = queue();
    const got: string[] = [];
    ["a", "b", "c"].forEach(k => q.request(k, inp).then(u => got.push(`${k}=${u}`)));
    await flush();
    expect(mkStageShot).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1); // b waits for a
    await settle();
    expect(got).toEqual(["a=blob:1"]);
    expect(pending).toHaveLength(1);
    await settle();
    await settle();
    expect(got).toEqual(["a=blob:1", "b=blob:2", "c=blob:3"]);
    expect(mkStageShot).toHaveBeenCalledTimes(1);
  });

  it("answers a repeat from the cache, and peeks a shot one", async () => {
    const q = queue();
    const first = q.request("a", inp);
    await flush();
    await settle();
    expect(q.peek("a")).toBe(await first);
    expect(await q.request("a", inp)).toBe("blob:1");
    expect(pending).toHaveLength(0);
    expect(q.peek("b")).toBeUndefined();
  });

  it("skips a queued shot nobody wants any more", async () => {
    const q = queue();
    q.request("a", inp);
    const ac = new AbortController();
    const b = q.request("b", inp, ac.signal);
    ac.abort();
    await expect(b).rejects.toThrow(/no longer wanted/);
    await flush();
    await settle(); // a
    expect(pending).toHaveLength(0); // b never shot
    expect(q.peek("b")).toBeUndefined();
  });

  it("keeps shooting for a second requester when the first one leaves", async () => {
    const q = queue();
    q.request("a", inp);
    const ac = new AbortController();
    q.request("b", inp, ac.signal).catch(() => {});
    const stays = q.request("b", inp);
    ac.abort();
    await flush();
    await settle();
    await settle();
    expect(await stays).toBe("blob:2");
  });

  it("releases the stage once idle, and makes a new one on the next request", async () => {
    const q = queue();
    q.request("a", inp);
    await flush();
    await settle();
    expect(stages[0].dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(stages[0].dispose).toHaveBeenCalledOnce();
    q.request("b", inp);
    await flush();
    expect(mkStageShot).toHaveBeenCalledTimes(2);
  });

  it("fails everything queued when there is no WebGL, and tries again on the next request", async () => {
    vi.mocked(mkStageShot).mockImplementationOnce(() => {
      throw new Error("no context");
    });
    const q = queue();
    const a = q.request("a", inp), b = q.request("b", inp);
    await expect(a).rejects.toBeInstanceOf(NoWebGL);
    await expect(b).rejects.toBeInstanceOf(NoWebGL);
    q.request("a", inp);
    await flush();
    expect(mkStageShot).toHaveBeenCalledTimes(2);
    expect(pending).toHaveLength(1);
  });

  it("fails one failed shot alone, and moves on", async () => {
    const q = queue();
    const a = q.request("a", inp), b = q.request("b", inp);
    await flush();
    pending.shift()!.reject(new Error("no blob"));
    await expect(a).rejects.toThrow("no blob");
    await flush();
    await settle();
    expect(await b).toBe("blob:1");
    expect(q.peek("a")).toBeUndefined(); // not cached: asking again retries
  });

  it("drops the least recently asked PNG past the cap, and revokes it", async () => {
    const q = queue({ cacheMax: 2 });
    for (const k of ["a", "b"]) {
      q.request(k, inp);
      await flush();
      await settle();
    }
    await q.request("a", inp); // a is now the most recent
    q.request("c", inp);
    await flush();
    await settle();
    expect(q.peek("b")).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    expect(q.peek("a")).toBe("blob:1");
  });

  it("counts only shot PNGs against the cap: more queued than it holds revokes none", async () => {
    const q = queue({ cacheMax: 2 });
    const a = q.request("a", inp);
    q.request("b", inp);
    q.request("c", inp);
    await flush();
    await settle();
    expect(await a).toBe("blob:1");
    expect(q.peek("a")).toBe("blob:1");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
