import React, { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, XCircle, Play } from "lucide-react";
import { Button } from "@/components/ui";

// Starlark syntax keywords for highlighting
const KEYWORDS = [
  "def",
  "return",
  "if",
  "else",
  "elif",
  "for",
  "in",
  "not",
  "and",
  "or",
  "True",
  "False",
  "None",
  "pass",
  "lambda",
  "break",
  "continue",
];
const BUILTINS = [
  "request",
  "response",
  "env",
  "json",
  "base64",
  "hmac",
  "uuid",
  "now",
  "assert",
  "print",
  "len",
  "str",
  "int",
  "bool",
  "list",
  "dict",
];

function highlightStarlark(code) {
  if (!code) return "";
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("[^"\\]*(?:\\.[^"\\]*)*")|('[^'\\]*(?:\\.[^'\\]*)*')/g,
      `<span class="text-yellow-400">$1$2</span>`,
    )
    .replace(/#.*/g, `<span class="text-green-500/70">$&</span>`)
    .replace(/\b(\d+\.?\d*)\b/g, `<span class="text-purple-400">$1</span>`)
    .replace(
      new RegExp(`\\b(${KEYWORDS.join("|")})\\b`, "g"),
      `<span class="text-pink-400">$1</span>`,
    )
    .replace(
      new RegExp(`\\b(${BUILTINS.join("|")})\\b`, "g"),
      `<span class="text-cyan-400">$1</span>`,
    );
}

function TestResultBadge({ result }) {
  if (!result) return null;

  if (result.passed) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/10 border border-green-500/30 text-green-400">
        <CheckCircle className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">
          Passed ({result.duration_ms}ms)
        </span>
      </div>
    );
  }

  const firstFailure = result.failures?.[0] || result.error || "Unknown error";
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 max-w-[400px]">
      <XCircle className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs font-medium shrink-0">
        Failed ({result.duration_ms}ms):
      </span>
      <span className="text-xs text-red-300/80 truncate font-mono">
        {firstFailure}
      </span>
    </div>
  );
}

export function ScriptEditor({
  script = "",
  onChange,
  label,
  testResult,
  onRun,
  readOnly = false,
}) {
  const [code, setCode] = useState(script);
  const [highlighted, setHighlighted] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);

  useEffect(() => {
    setCode(script);
  }, [script]);

  useEffect(() => {
    setHighlighted(highlightStarlark(code));
  }, [code]);

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setCode(val);
      onChange?.(val);
      setScrollTop(e.target.scrollTop);
      setScrollLeft(e.target.scrollLeft);
    },
    [onChange],
  );

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
    setScrollLeft(e.target.scrollLeft);
    // Sync gutter scroll
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.target.scrollTop;
    }
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      // Tab key inserts spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = e.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newVal = code.substring(0, start) + "    " + code.substring(end);
        setCode(newVal);
        onChange?.(newVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 4;
        }, 0);
      }

      // Cmd/Ctrl+A → select all inside the editor only
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.stopPropagation();
        const textarea = e.target;
        textarea.select();
      }
    },
    [code, onChange],
  );

  const lineCount = code ? code.split("\n").length : 1;
  const gutterNums = Array.from(
    { length: Math.max(lineCount, 15) },
    (_, i) => i + 1,
  )
    .map((n) => `<span>${n}</span>`)
    .join("\n");

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header with label and test result */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {testResult && <TestResultBadge result={testResult} />}
          {onRun && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => onRun(code)}
            >
              <Play className="h-3 w-3" />
              Run
            </Button>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-h-0 rounded-md border border-border bg-[#0d1117] overflow-hidden">
        <div className="flex h-full">
          {/* Line number gutter */}
          <pre
            ref={gutterRef}
            className="shrink-0 w-12 pt-3 pb-3 pl-2 pr-1 font-mono text-xs leading-relaxed text-muted-foreground/30 select-none text-right overflow-hidden bg-black/20 border-r border-border/50"
            dangerouslySetInnerHTML={{ __html: gutterNums }}
          />
          {/* Code area with syntax highlight overlay */}
          <div className="flex-1 relative min-w-0">
            <pre
              className="absolute inset-0 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all pointer-events-none overflow-hidden"
              style={{
                transform: `translate(-${scrollLeft}px, -${scrollTop}px)`,
              }}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
              ref={textareaRef}
              value={code}
              onChange={handleChange}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              spellCheck={false}
              className="absolute inset-0 w-full h-full p-3 font-mono text-sm leading-relaxed bg-transparent text-transparent caret-white resize-none outline-none overflow-auto whitespace-pre-wrap break-all"
              placeholder={
                "# Write your " + label.toLowerCase() + " script here..."
              }
            />
          </div>
        </div>
      </div>

      {/* Quick reference */}
      <details className="shrink-0 text-xs text-muted-foreground/60">
        <summary className="cursor-pointer hover:text-muted-foreground">
          Script API reference
        </summary>
        <div className="mt-2 p-3 rounded-md bg-muted/30 border border-border space-y-1 font-mono">
          <p>
            <span className="text-cyan-400">request</span>.headers["key"] = val
          </p>
          <p>
            <span className="text-cyan-400">request</span>.body =
            json.encode(..)
          </p>
          <p>
            <span className="text-cyan-400">env</span>["key"] = val
          </p>
          <p>
            <span className="text-cyan-400">assert</span>.status(expected_code)
          </p>
          <p>
            <span className="text-cyan-400">assert</span>.header(name,
            expected_value)
          </p>
          <p>
            <span className="text-cyan-400">assert</span>.json_path(path,
            expected)
          </p>
          <p>
            <span className="text-cyan-400">assert</span>.body_contains(text)
          </p>
          <p>
            <span className="text-cyan-400">assert</span>
            .response_time_less_than(ms)
          </p>
          <p>
            <span className="text-cyan-400">response</span>.json() → parsed JSON
          </p>
        </div>
      </details>
    </div>
  );
}
