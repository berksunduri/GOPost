import React from "react";
import { Badge, ScrollArea } from "@/components/ui";
import { t } from "@/i18n";

export function ResponseViewer({ response }) {
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
          variant={isSuccess ? "default" : isRedirect ? "secondary" : "destructive"}
          className="font-mono"
        >
          {statusCode}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {t("time")}: {response.time}ms
        </span>
        {response.status && (
          <span className="text-sm text-muted-foreground">{response.status}</span>
        )}
      </div>
      <ScrollArea className="flex-1">
        <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
          {response.body || ""}
        </pre>
      </ScrollArea>
    </div>
  );
}
