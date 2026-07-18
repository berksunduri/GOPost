import React, { useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui";
import { t } from "@/i18n";
import { useTheme } from "@/context/ThemeContext";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Braces,
} from "lucide-react";
import { isJSON, beautifyJSON, highlightJSON } from "@/lib/json";

/**
 * GQLResponseViewer — displays GraphQL responses with data/errors split.
 *
 * When the backend returns a GraphQL response, it includes `data` and `errors`
 * fields alongside the standard HTTP `status`, `code`, `body`, and `time`.
 */
export function GQLResponseViewer({ response }) {
  const [copied, setCopied] = useState(false);
  const [beautified, setBeautified] = useState(true);
  const { themeId } = useTheme();
  const isLight = themeId === "light";

  const handleCopy = useCallback(async () => {
    const text = response?.body;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(String(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = String(text);
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [response?.body]);

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground py-12">
        <p className="text-sm">Send a request to see the response</p>
      </div>
    );
  }

  const { status, code, body, data, errors, time } = response;

  const isSuccess = code >= 200 && code < 300;
  const hasGQLErrors =
    errors && (Array.isArray(errors) ? errors.length > 0 : true);
  const hasData = data != null;

  // JSON detection for raw body
  const bodyIsJSON = useMemo(
    () => isJSON(response?.body, response?.headers),
    [response?.body, response?.headers],
  );

  // Stable reference to beautifyJSON for the raw body highlight memo
  const beautifyJSONStable = useCallback((b) => beautifyJSON(b), []);

  // Syntax-highlighted HTML for raw body
  const rawHighlighted = useMemo(() => {
    if (!bodyIsJSON || !body) return null;
    const formatted = beautified ? beautifyJSONStable(body) : body;
    if (formatted.length > 32 * 1024) return null;
    return highlightJSON(formatted, isLight);
  }, [bodyIsJSON, body, beautified, beautifyJSONStable, isLight]);

  // Pretty-print JSON when beautified, otherwise return raw
  const formatJSON = useCallback(
    (obj) => {
      if (!beautified) return String(obj ?? "");
      try {
        if (typeof obj === "string") {
          const parsed = JSON.parse(obj);
          return JSON.stringify(parsed, null, 2);
        }
        return JSON.stringify(obj, null, 2);
      } catch {
        return String(obj);
      }
    },
    [beautified],
  );

  return (
    <div className="flex flex-col h-full space-y-3 min-h-0">
      {/* Status bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant={isSuccess ? "default" : "destructive"}
          className="text-xs font-mono"
        >
          {code || status}
        </Badge>

        {hasGQLErrors && (
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertCircle className="h-3 w-3" />
            {Array.isArray(errors) ? errors.length : "?"} error
            {(Array.isArray(errors) ? errors.length : 0) !== 1 ? "s" : ""}
          </Badge>
        )}

        {hasData && !hasGQLErrors && (
          <Badge
            variant="outline"
            className="text-xs gap-1 border-green-500/30 text-green-400"
          >
            <CheckCircle2 className="h-3 w-3" />
            Data received
          </Badge>
        )}

        {time != null && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            {time}ms
          </span>
        )}

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
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Copy raw response"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-y-auto">
        {/* Data section */}
        {hasData && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Data
            </h4>
            <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-auto max-h-[50vh] whitespace-pre-wrap break-all border border-border">
              {formatJSON(data)}
            </pre>
          </div>
        )}

        {/* Errors section */}
        {hasGQLErrors && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
              Errors
            </h4>
            <div className="space-y-2">
              {(Array.isArray(errors) ? errors : [errors]).map((err, i) => (
                <div
                  key={i}
                  className="bg-red-500/10 border border-red-500/30 rounded-md p-3"
                >
                  {err.message && (
                    <p className="text-sm font-medium text-red-400">
                      {err.message}
                    </p>
                  )}
                  {err.extensions?.code && (
                    <Badge
                      variant="outline"
                      className="text-[10px] mt-1 border-red-500/30 text-red-400"
                    >
                      {err.extensions.code}
                    </Badge>
                  )}
                  {err.locations && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {err.locations
                        .map((l) => `line ${l.line}:${l.column}`)
                        .join(", ")}
                    </p>
                  )}
                  {err.path && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      path: {err.path.join(" → ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw body (always shown in collapsed state) */}
        <details className="space-y-1">
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground uppercase tracking-wider">
            Raw Response
          </summary>
          <pre className="text-[10px] font-mono bg-muted/30 rounded-md p-3 overflow-auto max-h-[30vh] whitespace-pre-wrap break-all border border-border">
            {rawHighlighted ? (
              <span dangerouslySetInnerHTML={{ __html: rawHighlighted }} />
            ) : (
              formatJSON(body)
            )}
          </pre>
        </details>
      </div>
    </div>
  );
}
