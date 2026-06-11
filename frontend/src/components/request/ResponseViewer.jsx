import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { Badge, ScrollArea } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/context/ThemeContext";
import {
  Copy,
  Check,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Braces,
  GitCompare,
} from "lucide-react";
import { isJSON, beautifyJSON, highlightJSON } from "@/lib/json";
import { ResponseDiffView } from "./ResponseDiffView";
import { useTabs } from "@/context/TabsContext";

/** Get Content-Type from response headers (case-insensitive) */
function getContentType(response) {
  if (!response?.headers) return null;
  for (const key of Object.keys(response.headers)) {
    if (key.toLowerCase() === "content-type") return response.headers[key];
  }
  return null;
}

/** Simple XML pretty-print with basic indentation */
function formatXML(xml) {
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

export function ResponseViewer({ response }) {
  const [copied, setCopied] = useState(false);
  const [beautified, setBeautified] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const searchInputRef = useRef(null);
  const bodyContainerRef = useRef(null);
  const { themeId } = useTheme();
  const isLight = themeId === "light";
  const { openTabs, activeTabId } = useTabs();
  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const responseHistory = activeTab?.responseHistory || [];
  const [compareResponse, setCompareResponse] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);

  // Ctrl+F / Cmd+F to toggle search
  useEffect(() => {
    if (!response?.body) return;

    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "f") {
        // Don't intercept if user is in an input already
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        setCurrentMatchIdx(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [response?.body]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      // Small delay to ensure the input is rendered
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  // JSON detection
  const bodyIsJSON = useMemo(
    () => isJSON(response?.body, response?.headers),
    [response?.body, response?.headers],
  );

  // Compute display body: beautified or raw
  const displayBody = useMemo(() => {
    const raw = response?.body || "";
    if (beautified && bodyIsJSON) return beautifyJSON(raw);
    return raw;
  }, [response?.body, beautified, bodyIsJSON]);

  // Large response handling: cap display at 100KB
  const RESPONSE_CAP = 100 * 1024;
  const bodySize = (response?.body || "").length;
  const isLarge = bodySize > RESPONSE_CAP;
  const [showFull, setShowFull] = useState(false);
  const displayBodyCapped = useMemo(() => {
    if (!isLarge || showFull) return displayBody;
    return (
      displayBody.slice(0, RESPONSE_CAP) +
      "\n\n… (truncated — click 'Show all' to view full response)"
    );
  }, [displayBody, isLarge, showFull]);

  const handleCopy = useCallback(async () => {
    const text = displayBody;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayBody]);

  // Syntax-highlighted HTML for JSON (only when not searching)
  const jsonHTML = useMemo(() => {
    if (searchOpen && searchQuery.trim()) return null;
    if (!bodyIsJSON) return null;
    return highlightJSON(displayBodyCapped, isLight);
  }, [bodyIsJSON, displayBodyCapped, searchOpen, searchQuery, isLight]);

  // Build highlighted body with matches (search takes priority)
  const { highlightedBody, matchCount } = useMemo(() => {
    const body = displayBody;
    if (!searchOpen || !searchQuery.trim()) {
      return { highlightedBody: body, matchCount: 0 };
    }

    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const matches = [...body.matchAll(regex)];
    const count = matches.length;

    if (count === 0) {
      return { highlightedBody: body, matchCount: 0 };
    }

    // Build array of text + mark segments
    const parts = [];
    let lastIdx = 0;
    let matchNum = 0;

    for (const match of matches) {
      const start = match.index;
      const end = start + match[0].length;

      // Text before this match
      if (start > lastIdx) {
        parts.push({
          text: body.slice(lastIdx, start),
          isMatch: false,
        });
      }

      // The match itself
      parts.push({
        text: match[0],
        isMatch: true,
        matchIdx: matchNum,
      });
      matchNum++;
      lastIdx = end;
    }

    // Remaining text after last match
    if (lastIdx < body.length) {
      parts.push({
        text: body.slice(lastIdx),
        isMatch: false,
      });
    }

    return {
      highlightedBody: parts,
      matchCount: count,
    };
  }, [displayBody, searchOpen, searchQuery]);

  // Scroll current match into view
  useEffect(() => {
    if (!searchOpen || matchCount === 0) return;
    const container = bodyContainerRef.current;
    if (!container) return;

    const marks = container.querySelectorAll("mark.search-current");
    if (marks.length > 0) {
      marks[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [currentMatchIdx, searchOpen, matchCount]);

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setCurrentMatchIdx(0);
  };

  // Smart double-click: select just the content inside JSON quotes,
  // even across multiple lines (like browser DevTools Elements panel)
  const handleDoubleClick = useCallback(
    (e) => {
      if (!bodyIsJSON || !bodyContainerRef.current) return;

      const pre = bodyContainerRef.current;
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return;
      const clickRange = sel.getRangeAt(0);

      // Compute flat-text offset of click point
      let offset = 0;
      const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node === clickRange.startContainer) {
          offset += clickRange.startOffset;
          break;
        }
        offset += node.textContent.length;
      }

      const text = pre.textContent || "";
      if (offset >= text.length) return;

      // Count unescaped quotes before the click. If odd, we're inside a
      // JSON string — do smart selection. If even, let the browser handle
      // it naturally (numbers, booleans, null, etc).
      let quoteCount = 0;
      for (let i = 0; i < offset; i++) {
        if (text[i] === '"' && (i === 0 || text[i - 1] !== "\\")) {
          quoteCount++;
        }
      }
      if (quoteCount % 2 === 0) return; // Not inside a quoted string

      // Scan backwards to find the nearest opening `"` before the click
      let openQuote = -1;
      for (let i = offset; i >= 0; i--) {
        if (text[i] === '"' && (i === 0 || text[i - 1] !== "\\")) {
          openQuote = i;
          break;
        }
      }

      // Scan forwards to find the nearest closing `"` after the click
      let closeQuote = -1;
      for (let i = offset; i < text.length; i++) {
        if (text[i] === '"' && (i === 0 || text[i - 1] !== "\\")) {
          closeQuote = i;
          break;
        }
      }

      // Check we have a valid quoted span containing the click
      if (
        openQuote >= 0 &&
        closeQuote > openQuote &&
        offset > openQuote &&
        offset < closeQuote
      ) {
        // Select everything between the quotes (exclude the `"` chars)
        const innerStart = openQuote + 1;
        const innerEnd = closeQuote;

        // Convert flat offsets to text-node positions
        let startNode = null,
          startOff = 0,
          endNode = null,
          endOff = 0,
          acc = 0;
        const walker2 = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
        while ((node = walker2.nextNode())) {
          const len = node.textContent.length;
          if (!startNode && acc + len >= innerStart) {
            startNode = node;
            startOff = innerStart - acc;
          }
          if (!endNode && acc + len >= innerEnd) {
            endNode = node;
            endOff = innerEnd - acc;
            break;
          }
          acc += len;
        }

        if (startNode && endNode) {
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.setStart(startNode, startOff);
          newRange.setEnd(endNode, endOff);
          sel.addRange(newRange);
          e.preventDefault();
        }
      }
    },
    [bodyIsJSON],
  );

  const goToPrevMatch = () => {
    setCurrentMatchIdx((prev) => (prev <= 0 ? matchCount - 1 : prev - 1));
  };

  const goToNextMatch = () => {
    setCurrentMatchIdx((prev) => (prev >= matchCount - 1 ? 0 : prev + 1));
  };

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t("noResponse")}
      </div>
    );
  }

  const statusCode = response.code || response.status;
  const isSuccess = statusCode >= 200 && statusCode < 300;
  const isRedirect = statusCode >= 300 && statusCode < 400;
  const isError = statusCode >= 400;
  const contentType = getContentType(response);
  const isImage = contentType?.startsWith("image/");
  const isHTML = contentType?.includes("text/html");
  const isXML =
    contentType?.includes("xml") ||
    (bodyIsJSON === false && (response?.body || "").trim().startsWith("<"));

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-3 p-3 border-b">
        <Badge
          variant={
            isSuccess ? "default" : isRedirect ? "secondary" : "destructive"
          }
          className="font-mono"
        >
          {statusCode}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {t("time")}: {response.time}ms
        </span>
        {response.status && (
          <span className="text-sm text-muted-foreground">
            {response.status}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {bodyIsJSON && (
            <button
              onClick={() => setBeautified((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                beautified
                  ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              title={beautified ? t("unbeautify") : t("beautifyJSON")}
            >
              <Braces className="h-3.5 w-3.5" />
            </button>
          )}
          {responseHistory.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setCompareOpen((p) => !p)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  compareResponse
                    ? "text-purple-400 bg-purple-500/10 hover:bg-purple-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                title="Compare with previous response"
              >
                <GitCompare className="h-3.5 w-3.5" />
              </button>
              {compareOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 rounded-md border border-border bg-popover shadow-lg z-50 py-1">
                  <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                    Compare with
                  </div>
                  <div className="h-px bg-border mx-1 my-0.5" />
                  {responseHistory.map((hist, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCompareResponse(hist);
                        setCompareOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                    >
                      <span className="text-muted-foreground">
                        {new Date(hist._ts).toLocaleTimeString()}
                      </span>
                      <span className="ml-2 text-muted-foreground/60">
                        ({hist.code || hist.status})
                      </span>
                    </button>
                  ))}
                  {compareResponse && (
                    <>
                      <div className="h-px bg-border mx-1 my-0.5" />
                      <button
                        onClick={() => setCompareResponse(null)}
                        className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                      >
                        Stop comparing
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setSearchOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Search response body (Ctrl+F)"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Copy response body"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Search bar (inline, below status) */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentMatchIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) goToPrevMatch();
                else goToNextMatch();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                handleCloseSearch();
              }
            }}
            placeholder="Find in response..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap select-none">
                {matchCount > 0
                  ? `${currentMatchIdx + 1}/${matchCount}`
                  : "0/0"}
              </span>
              <button
                onClick={goToPrevMatch}
                disabled={matchCount === 0}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={goToNextMatch}
                disabled={matchCount === 0}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Next match (Enter)"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onClick={handleCloseSearch}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Close search (Escape)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Response body */}
      <ScrollArea className="flex-1">
        {compareResponse ? (
          <ResponseDiffView
            current={response}
            compare={compareResponse}
            onClose={() => setCompareResponse(null)}
          />
        ) : isImage ? (
          <div className="p-4 flex items-center justify-center">
            <img
              src={`data:${contentType};base64,${btoa(unescape(encodeURIComponent(response.body)))}`}
              alt="Response"
              className="max-w-full max-h-[60vh] object-contain rounded border"
            />
          </div>
        ) : isHTML ? (
          <iframe
            srcDoc={response.body}
            className="w-full h-full border-0"
            sandbox="allow-same-origin"
            title="HTML Preview"
          />
        ) : isXML ? (
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words text-emerald-400">
            {formatXML(response.body)}
          </pre>
        ) : (
          <pre
            ref={bodyContainerRef}
            className="p-4 text-xs font-mono whitespace-pre-wrap break-words"
            onDoubleClick={handleDoubleClick}
          >
            {Array.isArray(highlightedBody) ? (
              highlightedBody.map((part, i) =>
                part.isMatch ? (
                  <mark
                    key={i}
                    className={
                      part.matchIdx === currentMatchIdx
                        ? "search-current bg-orange-400/50 text-inherit rounded-sm"
                        : "bg-yellow-400/25 text-inherit rounded-sm"
                    }
                  >
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )
            ) : jsonHTML ? (
              <span dangerouslySetInnerHTML={{ __html: jsonHTML }} />
            ) : (
              <>
                {isLarge && !showFull && (
                  <div className="text-center py-2">
                    <span className="text-[11px] text-muted-foreground/60">
                      Response is {Math.round(bodySize / 1024)}KB — showing
                      first 100KB.{" "}
                    </span>
                    <button
                      onClick={() => setShowFull(true)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Show all
                    </button>
                  </div>
                )}
                {displayBodyCapped || ""}
              </>
            )}
          </pre>
        )}
      </ScrollArea>
    </div>
  );
}
