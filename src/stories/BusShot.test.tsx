/**
 * BusShot over a mocked queue: a skeleton until the queue answers, then the
 * PNG — or the generic picture, captioned, when there is nothing to shoot.
 */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vehicleTypeSeed } from "./initDataSets";
import { BusShot } from "./BusShot";
import { NoWebGL } from "./shotQueue";

const calls: { key: string; signal?: AbortSignal; resolve: (u: string) => void; reject: (e: unknown) => void }[] = [];
const cached = new Map<string, string>();

vi.mock("@entur/iteru-3dbus", () => ({ validate: () => [] }));
vi.mock("./shotQueue", async orig => ({
  ...(await orig<typeof import("./shotQueue")>()),
  shotQueueFor: () => ({
    request: (key: string, _inp: unknown, signal?: AbortSignal) =>
      new Promise<string>((resolve, reject) => calls.push({ key, signal, resolve, reject })),
    peek: (key: string) => cached.get(key),
    dispose() {},
  }),
}));

const VOLVO = vehicleTypeSeed["VEH:VehicleType:1"];
const busy = () => screen.queryByRole("status", { name: "Rendering preview" });

beforeEach(() => {
  calls.length = 0;
  cached.clear();
});

describe("BusShot", () => {
  it("shows a skeleton until its shot lands, then the PNG", async () => {
    render(<BusShot vt={VOLVO} />);
    expect(busy()?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => calls[0].resolve("blob:1"));
    expect(busy()).toBeNull();
    expect(screen.getByRole("img", { name: "Volvo 8900 LE 12.4 m, three-quarter view" }).getAttribute("src")).toBe("blob:1");
  });

  it("shows a PNG already shot on its first render, without a skeleton", () => {
    render(<BusShot vt={VOLVO} />);
    const key = calls[0].key;
    cached.set(key, "blob:9");
    render(<BusShot vt={VOLVO} />);
    expect(screen.getByRole("img", { name: /three-quarter view/ }).getAttribute("src")).toBe("blob:9");
  });

  it("asks nothing for a record it can't draw: the generic picture, captioned with why", () => {
    render(<BusShot vt={{ ...VOLVO, manufacturer: undefined }} />);
    expect(calls).toHaveLength(0);
    expect(busy()).toBeNull();
    expect(screen.getByText("No 3D preview").getAttribute("title")).toBe("Fill in on the VehicleType: Manufacturer");
  });

  it("falls back to the generic picture when the shot fails", async () => {
    render(<BusShot vt={VOLVO} />);
    await act(async () => calls[0].reject(new NoWebGL("no context")));
    expect(busy()).toBeNull();
    expect(screen.getByText("No 3D preview").getAttribute("title")).toMatch(/WebGL/);
  });

  it("withdraws its request when it unmounts", () => {
    const { unmount } = render(<BusShot vt={VOLVO} />);
    unmount();
    expect(calls[0].signal?.aborted).toBe(true);
  });
});
