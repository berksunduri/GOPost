import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_ROW_H = 20;
const OVERSCAN = 24;
const WRAP_AT = 140;

/** Split oversized lines so minified HTML/JSON stays readable under fixed row heights. */
export function wrapLongLines(text, maxLen = WRAP_AT) {
  if (!text) return [""];
  const raw = text.split("\n");
  const out = [];
  for (const line of raw) {
    if (line.length <= maxLen) {
      out.push(line);
      continue;
    }
    for (let i = 0; i < line.length; i += maxLen) {
      out.push(line.slice(i, i + maxLen));
    }
  }
  return out.length ? out : [""];
}

/** Make minified HTML navigable (Next.js payloads are often one giant line). */
export function softenHTML(body) {
  if (!body) return "";
  const t = body.trimStart();
  if (!(t.startsWith("<") || t.startsWith("<!"))) return body;
  return body.replace(/></g, ">\n<");
}

/** Canonical display text for virtualized viewers + search line mapping. */
export function prepareDisplayText(text) {
  return wrapLongLines(softenHTML(text || "")).join("\n");
}

function useRafScroll() {
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef(0);
  const pendingRef = useRef(0);

  const onScroll = useCallback((e) => {
    pendingRef.current = e.currentTarget.scrollTop;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrollTop(pendingRef.current);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { scrollTop, onScroll };
}

/**
 * Windowed line renderer — only mounts visible rows.
 * Full text stays in memory; DOM stays ~viewport-sized.
 */
export function VirtualizedCode({
  text = "",
  className,
  rowHeight = DEFAULT_ROW_H,
  renderLine,
  scrollToLine,
  onVisibleRange,
}) {
  const lines = useMemo(() => {
    // Caller should pass prepareDisplayText() when needed; avoid double-wrap.
    const raw = text || "";
    return raw.length ? raw.split("\n") : [""];
  }, [text]);
  const scrollerRef = useRef(null);
  const { scrollTop, onScroll } = useRafScroll();
  const [viewH, setViewH] = useState(400);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setViewH(Math.max(el.clientHeight, 1));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollToLine == null || scrollToLine < 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const top = scrollToLine * rowHeight;
    const bottom = top + rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom - el.clientHeight;
    }
  }, [scrollToLine, rowHeight]);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const visible = Math.ceil(viewH / rowHeight) + OVERSCAN * 2;
  const end = Math.min(lines.length, start + visible);
  const slice = lines.slice(start, end);
  const totalH = Math.max(lines.length, 1) * rowHeight;

  useEffect(() => {
    onVisibleRange?.(start, end);
  }, [start, end, onVisibleRange]);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "h-full min-h-0 overflow-auto font-mono text-xs overscroll-contain",
        className,
      )}
      style={{ WebkitOverflowScrolling: "touch" }}
      onScroll={onScroll}
    >
      <div style={{ height: totalH, position: "relative" }}>
        <div
          className="absolute inset-x-0 will-change-transform"
          style={{ transform: `translateY(${start * rowHeight}px)` }}
        >
          {slice.map((line, i) => {
            const lineNo = start + i;
            if (renderLine) {
              return (
                <div
                  key={lineNo}
                  style={{
                    height: rowHeight,
                    lineHeight: `${rowHeight}px`,
                  }}
                >
                  {renderLine(line, lineNo)}
                </div>
              );
            }
            return (
              <div
                key={lineNo}
                className="px-4 whitespace-pre overflow-hidden"
                style={{
                  height: rowHeight,
                  lineHeight: `${rowHeight}px`,
                }}
              >
                <span className="text-muted-foreground/30 w-8 inline-block text-right mr-3 select-none text-[10px]">
                  {lineNo + 1}
                </span>
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Dual-column virtualized diff — one scroll, paired rows.
 */
export function VirtualizedDiff({
  lines,
  className,
  rowHeight = DEFAULT_ROW_H,
}) {
  const scrollerRef = useRef(null);
  const { scrollTop, onScroll } = useRafScroll();
  const [viewH, setViewH] = useState(400);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setViewH(Math.max(el.clientHeight, 1));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const visible = Math.ceil(viewH / rowHeight) + OVERSCAN * 2;
  const end = Math.min(lines.length, start + visible);
  const slice = lines.slice(start, end);
  const totalH = Math.max(lines.length, 1) * rowHeight;

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "h-full min-h-0 overflow-auto font-mono text-xs overscroll-contain",
        className,
      )}
      style={{
        WebkitOverflowScrolling: "touch",
        lineHeight: `${rowHeight}px`,
      }}
      onScroll={onScroll}
    >
      <div style={{ height: totalH, position: "relative" }}>
        <div
          className="absolute inset-x-0 will-change-transform"
          style={{ transform: `translateY(${start * rowHeight}px)` }}
        >
          {slice.map((line, i) => {
            const lineNo = start + i;
            return (
              <div
                key={lineNo}
                className="grid grid-cols-2 divide-x divide-border/50"
                style={{ height: rowHeight }}
              >
                <div
                  className={
                    line.changed
                      ? line.left !== null
                        ? "bg-red-500/10 border-l-2 border-red-500/50 px-2 overflow-hidden"
                        : "bg-muted/30 px-2 overflow-hidden"
                      : "px-2 overflow-hidden"
                  }
                  title={line.left ?? undefined}
                >
                  <span className="text-muted-foreground/30 w-6 inline-block text-right mr-2 select-none text-[10px]">
                    {lineNo + 1}
                  </span>
                  <span className="whitespace-pre">{line.left ?? ""}</span>
                </div>
                <div
                  className={
                    line.changed
                      ? line.right !== null
                        ? "bg-green-500/10 border-l-2 border-green-500/50 px-2 overflow-hidden"
                        : "bg-muted/30 px-2 overflow-hidden"
                      : "px-2 overflow-hidden"
                  }
                  title={line.right ?? undefined}
                >
                  <span className="text-muted-foreground/30 w-6 inline-block text-right mr-2 select-none text-[10px]">
                    {lineNo + 1}
                  </span>
                  <span className="whitespace-pre">{line.right ?? ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
