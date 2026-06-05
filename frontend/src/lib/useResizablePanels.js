import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Simple resizable panel hook.
 * Returns [widths, resizeHandlePropsFor(index)] where resizeHandlePropsFor
 * gives you onMouseDown handlers for a resize handle between panel[index] and panel[index+1].
 */
export function useResizablePanels(initialWidths, minWidths = []) {
  const [widths, setWidths] = useState(initialWidths);
  const dragRef = useRef(null);
  const containerRef = useRef(null);

  const getHandleProps = useCallback((index) => ({
    onMouseDown: (e) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      const startX = e.clientX;
      const startWidths = [...widths];

      dragRef.current = {
        index,
        startX,
        startWidths,
        totalWidth,
      };

      const onMove = (ev) => {
        if (!dragRef.current) return;
        const { index: idx, startX: sx, startWidths: sw, totalWidth: tw } = dragRef.current;
        const dx = ev.clientX - sx;
        const dxPct = (dx / tw) * 100;

        const next = [...sw];
        const leftMin = minWidths[idx] ?? 8;
        const rightMin = minWidths[idx + 1] ?? 8;

        let newLeft = sw[idx] + dxPct;
        let newRight = sw[idx + 1] - dxPct;

        if (newLeft < leftMin) {
          newRight -= (leftMin - newLeft);
          newLeft = leftMin;
        }
        if (newRight < rightMin) {
          newLeft -= (rightMin - newRight);
          newRight = rightMin;
        }

        if (newLeft >= leftMin && newRight >= rightMin) {
          next[idx] = newLeft;
          next[idx + 1] = newRight;
          setWidths(next);
        }
      };

      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
  }), [widths, minWidths]);

  useEffect(() => {
    return () => {
      dragRef.current = null;
    };
  }, []);

  return { widths, getHandleProps, containerRef };
}
