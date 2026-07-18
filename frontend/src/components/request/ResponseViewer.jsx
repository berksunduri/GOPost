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
import { isJSON, beautifyJSON, highlightJSON, highlightJSONLine } from "@/lib/json";
import { ResponseDiffView } from "./ResponseDiffView";
import { VirtualizedCode, wrapLongLines } from "./VirtualizedCode";
import { useTabs } from "@/context/TabsContext";
import { cn } from "@/lib/utils";

const HIGHLIGHT_MAX = 24 * 1024;
const BEAUTIFY_MAX = 500 * 1024;
const VIRTUALIZE_MIN_CHARS = 8 * 1024;

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

/** Map search matches to line numbers for virtualized jump-to. */
function findMatchLines(body, query) {
  if (!body || !query.trim()) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  const lines = [];
  let line = 0;
  let scanned = 0;
  let match;
  while ((match = regex.exec(body)) !== null) {
    for (let i = scanned; i < match.index; i++) {
      if (body[i] === "\n") line++;
    }
    scanned = match.index;
    lines.push(line);
    if (match[0].length === 0) regex.lastIndex++;
  }
  return lines;
}

export function ResponseViewer({ response }) {
  const [copied, setCopied] = useState(false);
  const [beautified, setBeautified] = useState(false);
  const [beautifyBodyKey, setBeautifyBodyKey] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const searchInputRef = useRef(null);
  const { themeId } = useTheme();
  const isLight = themeId === "light";
  const { openTabs, activeTabId } = useTabs();
  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const responseHistory = activeTab?.responseHistory || [];
  const [compareResponse, setCompareResponse] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const contentType = getContentType(response);
  const bodyIsJSON = useMemo(
    () => isJSON(response?.body, response?.headers),
    [response?.body, response?.headers],
  );
  const isImage = contentType?.startsWith("image/");
  const isHTML = !!contentType?.includes("text/html");
  const isXML =
    !!contentType?.includes("xml") ||
    (!isHTML &&
      !bodyIsJSON &&
      !!(response?.body || "").trim().startsWith("<"));
  const canBeautify = bodyIsJSON || isHTML || isXML;

  // Default beautify on for HTML/XML — minified markup is unreadable raw.
  const bodyKey = response?.body ?? null;
  if (bodyKey !== beautifyBodyKey) {
    setBeautifyBodyKey(bodyKey);
    setBeautified(isHTML || isXML);
  }

  useEffect(() => {
    if (!response?.body) return;
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "f") {
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

  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  const displayBody = useMemo(() => {
    const raw = response?.body || "";
    if (!beautified || !canBeautify) return raw;
    if (raw.length > BEAUTIFY_MAX) return raw;
    if (bodyIsJSON) return beautifyJSON(raw);
    // HTML and XML share the same indent formatter
    return formatXML(raw);
  }, [response?.body, beautified, canBeautify, bodyIsJSON]);

  // Wrap long lines only — do not re-soften (beautify already did that).
  const viewBody = useMemo(
    () => wrapLongLines(displayBody).join("\n"),
    [displayBody],
  );

  const useVirtual = viewBody.length >= VIRTUALIZE_MIN_CHARS;

  const jsonHTML = useMemo(() => {
    if (useVirtual) return null;
    if (searchOpen && searchQuery.trim()) return null;
    if (!bodyIsJSON) return null;
    if (displayBody.length > HIGHLIGHT_MAX) return null;
    return highlightJSON(displayBody, isLight);
  }, [
    useVirtual,
    bodyIsJSON,
    displayBody,
    searchOpen,
    searchQuery,
    isLight,
  ]);

  const matchLines = useMemo(
    () =>
      searchOpen && searchQuery.trim()
        ? findMatchLines(viewBody, searchQuery)
        : [],
    [viewBody, searchOpen, searchQuery],
  );
  const matchCount = matchLines.length;
  const scrollToLine =
    searchOpen && matchCount > 0 ? matchLines[currentMatchIdx] : null;

  const matchLineSet = useMemo(() => {
    if (!searchOpen || !searchQuery.trim() || matchCount === 0) return null;
    return new Set(matchLines);
  }, [searchOpen, searchQuery, matchCount, matchLines]);

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

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setCurrentMatchIdx(0);
  };

  const goToPrevMatch = () => {
    setCurrentMatchIdx((prev) => (prev <= 0 ? matchCount - 1 : prev - 1));
  };

  const goToNextMatch = () => {
    setCurrentMatchIdx((prev) => (prev >= matchCount - 1 ? 0 : prev + 1));
  };

  const renderVirtualLine = useCallback(
    (line, lineNo) => {
      const isMatch = matchLineSet?.has(lineNo);
      const isCurrent = isMatch && matchLines[currentMatchIdx] === lineNo;
      const colored =
        bodyIsJSON && !(searchOpen && searchQuery.trim())
          ? highlightJSONLine(line, isLight)
          : null;
      return (
        <div
          className={cn(
            "px-4 whitespace-pre overflow-hidden",
            isCurrent && "bg-orange-400/40",
            isMatch && !isCurrent && "bg-yellow-400/20",
          )}
        >
          <span className="text-muted-foreground/30 w-8 inline-block text-right mr-3 select-none text-[10px]">
            {lineNo + 1}
          </span>
          {colored ? (
            <span dangerouslySetInnerHTML={{ __html: colored }} />
          ) : (
            line
          )}
        </div>
      );
    },
    [
      matchLineSet,
      matchLines,
      currentMatchIdx,
      bodyIsJSON,
      searchOpen,
      searchQuery,
      isLight,
    ],
  );

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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Status bar */}
      <div className="flex items-center gap-3 p-3 border-b shrink-0">
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
          {canBeautify && (
            <button
              type="button"
              onClick={() => setBeautified((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                beautified
                  ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              title={
                beautified
                  ? t("unbeautify")
                  : bodyIsJSON
                    ? t("beautifyJSON")
                    : t("beautify")
              }
            >
              <Braces className="h-3.5 w-3.5" />
            </button>
          )}
          {responseHistory.length > 0 && (
            <div className="relative">
              <button
                type="button"
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
                      type="button"
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
                        type="button"
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
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Search response body (Ctrl+F)"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
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

      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
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
                type="button"
                onClick={goToPrevMatch}
                disabled={matchCount === 0}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
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
            type="button"
            onClick={handleCloseSearch}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Close search (Escape)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Body — absolute fill so virtualizers always get a real height */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
          {compareResponse ? (
            <ResponseDiffView
              current={response}
              compare={compareResponse}
              onClose={() => setCompareResponse(null)}
            />
          ) : isImage ? (
            <ScrollArea className="h-full">
              <div className="p-4 flex items-center justify-center">
                <img
                  src={`data:${contentType};base64,${btoa(unescape(encodeURIComponent(response.body)))}`}
                  alt="Response"
                  className="max-w-full max-h-[60vh] object-contain rounded border"
                />
              </div>
            </ScrollArea>
          ) : useVirtual || isHTML || isXML || !bodyIsJSON ? (
            <VirtualizedCode
              text={viewBody}
              renderLine={renderVirtualLine}
              scrollToLine={scrollToLine}
            />
          ) : (
            <ScrollArea className="h-full">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
                {jsonHTML ? (
                  <span dangerouslySetInnerHTML={{ __html: jsonHTML }} />
                ) : (
                  displayBody || ""
                )}
              </pre>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
