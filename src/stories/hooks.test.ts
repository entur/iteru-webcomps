import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettledState } from "./hooks";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useSettledState", () => {
  it("commits a burst once, with its last value, after it holds still", () => {
    const { result } = renderHook(() => useSettledState("a", 250));
    act(() => ["b", "c", "d"].forEach(v => result.current[1](v)));
    expect(result.current[0]).toBe("a");
    act(() => vi.advanceTimersByTime(249));
    expect(result.current[0]).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe("d");
  });

  it("commits at once when asked, and drops a pending update", () => {
    const { result } = renderHook(() => useSettledState("a", 250));
    act(() => result.current[1]("late"));
    act(() => result.current[1]("now", true));
    expect(result.current[0]).toBe("now");
    act(() => vi.advanceTimersByTime(500));
    expect(result.current[0]).toBe("now");
  });

  it("drops a pending update on unmount", () => {
    const { result, unmount } = renderHook(() => useSettledState("a", 250));
    act(() => result.current[1]("b"));
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
  });
});
