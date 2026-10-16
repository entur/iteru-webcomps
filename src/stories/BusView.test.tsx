/**
 * BusView with 3dbus mocked (jsdom has no WebGL): what it shows for a result,
 * and what it asks of the stages it makes.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkStage, mkStageShot } from "@entur/iteru-3dbus";
import { toBusInput } from "../index";
import { vehicleTypeSeed } from "./initDataSets";
import { BusView, type BusViewProps } from "./BusView";

vi.mock("@entur/iteru-3dbus", () => {
  const stage = () => ({
    cam: { position: { x: 0, y: 0, z: 1, set() {} } },
    ctl: { target: { x: 0, y: 0, z: 0, set() {} }, addEventListener() {}, removeEventListener() {} },
    ticks: [],
    add: vi.fn(),
    drop: vi.fn(),
    dispose: vi.fn(),
  });
  return {
    MM: 0.001,
    validate: () => [],
    total: () => 12_000,
    faces: () => ({}),
    mkBus: () => ({ position: { x: 0 } }),
    mkStage: vi.fn(stage),
    mkStageShot: vi.fn(() => ({ ...stage(), shot: () => new Promise(() => {}) })),
    mkViews: () => () => {},
  };
});

const VOLVO = vehicleTypeSeed["VEH:VehicleType:1"];
const CITARO = vehicleTypeSeed["VEH:VehicleType:3"];

const props = (over: Partial<BusViewProps> = {}): BusViewProps => ({
  result: toBusInput(VOLVO),
  mode: "3d",
  onModeChange: () => {},
  motion: "orbit",
  onMotionChange: () => {},
  ...over,
});

/** ResizeObserver stand-in: `resize(w, h)` reports a new border box to all. */
let observers: ((entries: unknown[]) => void)[] = [];
const resize = (w: number, h: number) =>
  act(() => observers.forEach(cb => cb([{ borderBoxSize: [{ inlineSize: w, blockSize: h }] }])));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  observers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: (entries: unknown[]) => void) {}
      observe() {
        observers.push(this.cb);
      }
      disconnect() {
        observers = observers.filter(o => o !== this.cb);
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const drift = () => screen.queryByText(/sections add up to/);

describe("BusView", () => {
  it("shows the result's length drift, from the result alone", () => {
    render(<BusView {...props({ result: toBusInput({ ...CITARO, length: 20 }) })} />);
    expect(drift()).toHaveTextContent("Length is 20 m, but the sections add up to 18.2 m.");
  });

  it("never flags a flip of the type: length and sections arrive as one value", () => {
    const { rerender } = render(<BusView {...props()} />);
    rerender(<BusView {...props({ result: toBusInput(CITARO) })} />);
    expect(drift()).toBeNull();
  });

  it("shows a skeleton while loading, not a list of missing fields", () => {
    render(<BusView {...props({ result: toBusInput({}), loading: true })} />);
    expect(screen.getByRole("status", { name: "Loading preview" })).toBeInTheDocument();
    expect(screen.queryByText(/Fill in to draw the bus/)).toBeNull();
  });

  it("says which form fills each missing value", () => {
    const result = toBusInput({ ...VOLVO, manufacturer: undefined, baseColor: undefined }, {});
    render(<BusView {...props({ result })} />);
    expect(screen.getByText(/Fill in to draw the bus/)).toHaveTextContent(
      "Fill in to draw the bus — on the VehicleType: Manufacturer; on the Vehicle: Base color.",
    );
  });

  it("drops the bus before disposing the stage, so its geometry is freed", () => {
    const { unmount } = render(<BusView {...props()} />);
    const stage = vi.mocked(mkStage).mock.results[0].value;
    unmount();
    expect(stage.drop).toHaveBeenCalledOnce();
    expect(stage.drop.mock.invocationCallOrder[0]).toBeLessThan(stage.dispose.mock.invocationCallOrder[0]);
  });

  it("shoots the bitmap at the box's CSS size — 3dbus applies the pixel ratio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    render(<BusView {...props({ mode: "bitmap" })} />);
    resize(400, 250);
    expect(mkStageShot).toHaveBeenCalledOnce();
    expect(vi.mocked(mkStageShot).mock.calls[0][0]).toMatchObject({ w: 400, h: 250 });
  });

  it("re-shoots once per settled resize, not once per step of a drag", () => {
    render(<BusView {...props({ mode: "bitmap" })} />);
    resize(400, 250);
    [410, 420, 430, 440].forEach(w => resize(w, 275));
    expect(mkStageShot).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(300));
    expect(mkStageShot).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mkStageShot).mock.calls[1][0]).toMatchObject({ w: 440, h: 275 });
  });

  it("measures nothing in 3D mode — the live stage sizes its own canvas", () => {
    render(<BusView {...props()} />);
    expect(observers).toHaveLength(0);
  });
});
