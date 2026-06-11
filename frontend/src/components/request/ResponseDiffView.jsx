import React, { useMemo } from "react";
import { ArrowRight, X } from "lucide-react";
import { isJSON, beautifyJSON } from "@/lib/json";

/**
 * Simple line-by-line diff for comparing two response bodies.
 * JSON responses are beautified before comparison.
 */
function lineDiff(a, b) {
  // Beautify if JSON so the diff is readable
  const bodyA = isJSON(a) ? beautifyJSON(a) : a;
  const bodyB = isJSON(b) ? beautifyJSON(b) : b;

  const aLines = (bodyA || "").split("\n");
  const bLines = (bodyB || "").split("\n");
  const result = [];
  const maxLen = Math.max(aLines.length, bLines.length);

  for (let i = 0; i < maxLen; i++) {
    const left = i < aLines.length ? aLines[i] : null;
    const right = i < bLines.length ? bLines[i] : null;
    if (left !== right) {
      result.push({ left, right, changed: true });
    } else {
      result.push({ left, right, changed: false });
    }
  }
  return result;
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b shrink-0">
        <span className="text-[11px] text-muted-foreground">
          Comparing:{" "}
          <span className="text-foreground/80">
            now ({current?.code || "?"})
          </span>{" "}
          <ArrowRight className="h-3 w-3 inline text-muted-foreground/50" />{" "}
          <span className="text-foreground/80">
            {formatTime(compare?._ts)} ({compare?.code || "?"})
          </span>
        </span>
        <button
          onClick={onClose}
          className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Diff body */}
      <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed">
        <div className="grid grid-cols-2 divide-x divide-border/50 min-h-full">
          {/* Left side (current) */}
          <div className="overflow-auto">
            {diff.map((line, i) => (
              <div
                key={i}
                className={
                  line.changed
                    ? line.left !== null
                      ? "bg-red-500/10 border-l-2 border-red-500/50 px-2 py-px"
                      : "bg-muted/30 px-2 py-px"
                    : "px-2 py-px"
                }
              >
                <span className="text-muted-foreground/30 w-6 inline-block text-right mr-2 select-none text-[10px]">
                  {i + 1}
                </span>
                <span className="whitespace-pre-wrap break-all">
                  {line.left ?? ""}
                </span>
              </div>
            ))}
          </div>

          {/* Right side (compare) */}
          <div className="overflow-auto">
            {diff.map((line, i) => (
              <div
                key={i}
                className={
                  line.changed
                    ? line.right !== null
                      ? "bg-green-500/10 border-l-2 border-green-500/50 px-2 py-px"
                      : "bg-muted/30 px-2 py-px"
                    : "px-2 py-px"
                }
              >
                <span className="text-muted-foreground/30 w-6 inline-block text-right mr-2 select-none text-[10px]">
                  {i + 1}
                </span>
                <span className="whitespace-pre-wrap break-all">
                  {line.right ?? ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
