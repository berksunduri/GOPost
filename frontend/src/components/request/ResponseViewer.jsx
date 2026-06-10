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
} from "lucide-react";
import { isJSON, beautifyJSON, highlightJSON } from "@/lib/json";

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
    return highlightJSON(displayBody, isLight);
  }, [bodyIsJSON, displayBody, searchOpen, searchQuery, isLight]);

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
        <pre
          ref={bodyContainerRef}
          className="p-4 text-xs font-mono whitespace-pre-wrap break-words"
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
            displayBody || ""
          )}
        </pre>
      </ScrollArea>
    </div>
  );
}
