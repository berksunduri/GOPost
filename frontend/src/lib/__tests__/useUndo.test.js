import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndo } from "../useUndo.js";

describe("useUndo", () => {
  it("initializes with provided state", () => {
    const { result } = renderHook(() => useUndo("initial"));
    // No undo available at start
    expect(result.current.undo()).toBeNull();
  });

  it("pushState saves current to undo stack", () => {
    const { result } = renderHook(() => useUndo("a"));

    act(() => result.current.pushState("b"));
    const prev = result.current.undo();
    expect(prev).toBe("a");
  });

  it("undo returns null on empty stack", () => {
    const { result } = renderHook(() => useUndo("only"));
    expect(result.current.undo()).toBeNull();
  });

  it("redo returns null on empty redo stack", () => {
    const { result } = renderHook(() => useUndo("only"));
    expect(result.current.redo()).toBeNull();
  });

  it("undo then redo cycles correctly", () => {
    const { result } = renderHook(() => useUndo("a"));

    act(() => result.current.pushState("b"));
    act(() => result.current.pushState("c"));

    expect(result.current.undo()).toBe("b");
    expect(result.current.undo()).toBe("a");
    expect(result.current.redo()).toBe("b");
    expect(result.current.redo()).toBe("c");
  });

  it("pushState after undo clears redo stack", () => {
    const { result } = renderHook(() => useUndo("a"));

    act(() => result.current.pushState("b"));
    result.current.undo();
    act(() => result.current.pushState("c"));

    // redo stack should be empty now
    expect(result.current.redo()).toBeNull();
  });

  it("multiple pushState calls accumulate correctly", () => {
    const { result } = renderHook(() => useUndo(0));

    for (let i = 1; i <= 5; i++) {
      act(() => result.current.pushState(i));
    }

    // Undo all the way back
    expect(result.current.undo()).toBe(4);
    expect(result.current.undo()).toBe(3);
    expect(result.current.undo()).toBe(2);
    expect(result.current.undo()).toBe(1);
    expect(result.current.undo()).toBe(0);
    expect(result.current.undo()).toBeNull();
  });

  it("caps undo stack at 50 entries", () => {
    const { result } = renderHook(() => useUndo("base"));

    for (let i = 0; i < 60; i++) {
      act(() => result.current.pushState(`state-${i}`));
    }

    // Can undo 50 times, then stops
    let undoCount = 0;
    let val = result.current.undo();
    while (val !== null) {
      undoCount++;
      val = result.current.undo();
    }
    expect(undoCount).toBe(50);
  });

  it("undo returns the previous value, not the current", () => {
    const { result } = renderHook(() => useUndo("first"));

    act(() => result.current.pushState("second"));
    act(() => result.current.pushState("third"));

    const val = result.current.undo();
    expect(val).toBe("second");
  });

  it("works with object states", () => {
    const a = { x: 1 };
    const b = { x: 2 };
    const { result } = renderHook(() => useUndo(a));

    act(() => result.current.pushState(b));
    expect(result.current.undo()).toBe(a);
  });

  it("redo after full forward returns null", () => {
    const { result } = renderHook(() => useUndo("a"));
    act(() => result.current.pushState("b"));
    result.current.undo();
    result.current.redo();
    expect(result.current.redo()).toBeNull();
  });
});
