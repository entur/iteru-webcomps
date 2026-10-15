/**
 * BusView's timing: what is shown together must settle together. jsdom has no
 * WebGL, so 3dbus is mocked — `total` is the real sum, the stage a stub.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toBusInput } from "../index";
import { vehicleTypeSeed } from "./initDataSets";
import { BusView, type BusViewProps } from "./BusView";

vi.mock("@entur/iteru-3dbus", () => {
  const stage = () => ({
    cam: { position: { x: 0, y: 0, z: 1, set() {} } },
    ctl: { target: { x: 0, y: 0, z: 0, set() {} }, addEventListener() {}, removeEventListener() {} },
    ticks: [],
    add() {},
    drop() {},
    dispose() {},
  });
  return {
    MM: 0.001,
    validate: () => [],
    total: (inp: { sections: { length_mm: number; bellows_ahead_mm?: number }[] }) =>
      inp.sections.reduce((n, s) => n + s.length_mm + (s.bellows_ahead_mm ?? 0), 0),
    faces: () => ({}),
    mkBus: () => ({ position: { x: 0 } }),
    mkStage: stage,
    mkStageShot: () => ({ ...stage(), shot: () => new Promise(() => {}) }),
    mkViews: () => () => {},
  };
});

const VOLVO = vehicleTypeSeed["VEH:VehicleType:1"];
const CITARO = vehicleTypeSeed["VEH:VehicleType:3"];

const props = (over: Partial<BusViewProps> = {}): BusViewProps => ({
  result: toBusInput(VOLVO),
  lengthM: VOLVO.length,
  mode: "3d",
  onModeChange: () => {},
  motion: "orbit",
  onMotionChange: () => {},
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const drift = () => screen.queryByText(/sections add up to/);

describe("BusView", () => {
  it("never checks a new type's length against the old type's sections", () => {
    const { rerender } = render(<BusView {...props()} />);
    // Flip the type: input and length change in the same render.
    rerender(<BusView {...props({ result: toBusInput(CITARO), lengthM: CITARO.length })} />);
    expect(drift()).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(drift()).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(drift()).toBeNull();
  });

  it("still flags a length the sections really don't add up to, once settled", () => {
    const { rerender } = render(<BusView {...props()} />);
    rerender(<BusView {...props({ lengthM: 20 })} />);
    act(() => vi.advanceTimersByTime(300));
    expect(drift()).toHaveTextContent("Length is 20 m, but the sections add up to 12.396 m.");
  });

  it("shows a skeleton while loading, not a list of missing fields", () => {
    render(<BusView {...props({ result: toBusInput({}), lengthM: null, loading: true })} />);
    expect(screen.getByRole("status", { name: "Loading preview" })).toBeInTheDocument();
    expect(screen.queryByText(/Fill in to draw the bus/)).toBeNull();
  });

  it("shows the record the moment its load lands — no settle delay after loading", () => {
    const { rerender, container } = render(
      <BusView {...props({ result: toBusInput({}), lengthM: null, loading: true })} />,
    );
    rerender(<BusView {...props()} />);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.queryByRole("status", { name: "Loading preview" })).toBeNull();
    expect(container.querySelector('[data-bus-view="3d"]')).not.toBeNull();
  });
});
