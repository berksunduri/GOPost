import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizablePanels } from "../useResizablePanels.js";

describe("useResizablePanels", () => {
  it("returns initial widths and handle props", () => {
    const { result } = renderHook(() => useResizablePanels([40, 60], [10, 10]));
    expect(result.current.widths).toEqual([40, 60]);
    expect(typeof result.current.getHandleProps(0).onMouseDown).toBe("function");
    expect(result.current.containerRef).toBeDefined();
  });

  it("resizes on drag when container is set", () => {
    const { result } = renderHook(() => useResizablePanels([50, 50], [10, 10]));
    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({ width: 200, left: 0, right: 200, top: 0, bottom: 40 }),
    });
    result.current.containerRef.current = container;

    act(() => {
      result.current.getHandleProps(0).onMouseDown({
        preventDefault: vi.fn(),
        clientX: 100,
      });
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 120 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.widths[0]).toBeGreaterThan(50);
    expect(result.current.widths[1]).toBeLessThan(50);
  });
});
