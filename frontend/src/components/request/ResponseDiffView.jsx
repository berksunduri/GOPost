import React, { useMemo } from "react";
import { ArrowRight, X } from "lucide-react";
import { isJSON, beautifyJSON } from "@/lib/json";
import { VirtualizedDiff, wrapLongLines } from "./VirtualizedCode";

const BEAUTIFY_MAX = 500 * 1024;

function prepareBody(body) {
  if (!body) return "";
  const t = body.trimStart();
  // Pretty-print markup the same way the response viewer does
  if (t.startsWith("<") || t.startsWith("<!")) {
    return formatMarkup(body);
  }
  if (body.length <= BEAUTIFY_MAX && isJSON(body)) {
    return beautifyJSON(body);
  }
  return body;
}

/** Indent HTML/XML tags for readable diffs. */
function formatMarkup(xml) {
  if (!xml) return "";
  let formatted = "";
  let indent = 0;
  const lines = xml
    .replace(/>\s*</g, "><")
    .replace(/(<[^/][^>]*>)/g, "\n$1")
    .replace(/(<\/[^>]*>)/g, "$1\n")
    .split("\n")
    .filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("</")) indent = Math.max(0, indent - 1);
    formatted += "  ".repeat(indent) + trimmed + "\n";
    if (
      trimmed.startsWith("<") &&
      !trimmed.startsWith("</") &&
      !trimmed.endsWith("/>") &&
      !trimmed.includes("</")
    ) {
      indent++;
    }
  }
  return formatted;
}

/**
 * Expand each aligned diff row so long lines wrap into readable chunks.
 */
function expandWrappedDiff(rows) {
  const out = [];
  for (const row of rows) {
    const leftParts =
      row.left === null ? [null] : wrapLongLines(row.left);
    const rightParts =
      row.right === null ? [null] : wrapLongLines(row.right);
    const n = Math.max(leftParts.length, rightParts.length);
    for (let i = 0; i < n; i++) {
      const left =
        i < leftParts.length
          ? leftParts[i]
          : row.left === null
            ? null
            : "";
      const right =
        i < rightParts.length
          ? rightParts[i]
          : row.right === null
            ? null
            : "";
      out.push({ left, right, changed: row.changed });
    }
  }
  return out;
}

function lineDiff(a, b) {
  const bodyA = prepareBody(a);
  const bodyB = prepareBody(b);

  const aLines = bodyA.split("\n");
  const bLines = bodyB.split("\n");
  const maxLen = Math.max(aLines.length, bLines.length);
  const result = new Array(maxLen);

  for (let i = 0; i < maxLen; i++) {
    const left = i < aLines.length ? aLines[i] : null;
    const right = i < bLines.length ? bLines[i] : null;
    result[i] = { left, right, changed: left !== right };
  }
  return expandWrappedDiff(result);
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString();
}

export function ResponseDiffView({ current, compare, onClose }) {
  const diff = useMemo(
    () => lineDiff(current?.body, compare?.body),
    [current?.body, compare?.body],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 border-b shrink-0">
        <span className="text-[11px] text-muted-foreground truncate">
          Comparing:{" "}
          <span className="text-foreground/80">
            now ({current?.code || "?"})
          </span>{" "}
          <ArrowRight className="h-3 w-3 inline text-muted-foreground/50" />{" "}
          <span className="text-foreground/80">
            {formatTime(compare?._ts)} ({compare?.code || "?"})
          </span>
          <span className="ml-2 text-muted-foreground/50">
            {diff.length.toLocaleString()} lines
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
          <VirtualizedDiff lines={diff} />
        </div>
      </div>
    </div>
  );
}
