import React, { useState, useCallback } from "react";
import { Badge, ScrollArea } from "@/components/ui";
import { t } from "@/i18n";
import { Copy, Check } from "lucide-react";

export function ResponseViewer({ response }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!response?.body) return;
    try {
      await navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers or insecure contexts
      const ta = document.createElement("textarea");
      ta.value = response.body;
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
        <div className="ml-auto">
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
      <ScrollArea className="flex-1">
        <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
          {response.body || ""}
        </pre>
      </ScrollArea>
    </div>
  );
}
