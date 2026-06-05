import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Button, ScrollArea, Badge } from "@/components/ui";
import { RotateCcw, ExternalLink, Clock, Loader2 } from "lucide-react";
import { t } from "@/i18n";
import { api } from "@/api";
import { toast } from "sonner";

function HistoryPanel() {
  const {
    history,
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
    setSelectedRequestId,
    setVirtualRequest,
    loadHistory,
    loadRequests,
  } = useApp();

  const [replayingId, setReplayingId] = useState(null);

  const handleReplay = async (entryId) => {
    setReplayingId(entryId);
    try {
      const result = await api.ReplayHistoryEntry(entryId);
      await loadHistory();
      toast.success(
        `Replayed \u2014 ${result.code || result.status} in ${result.time}ms`,
      );
    } catch (e) {
      toast.error("Replay failed");
    } finally {
      setReplayingId(null);
    }
  };

  const handleOpenInEditor = (entry) => {
    if (entry.collection_id && entry.collection_id !== selectedCollectionId) {
      const match = collections.find((c) => c.id === entry.collection_id);
      if (match) {
        setSelectedCollectionId(match.id);
        loadRequests(match.id);
      }
    }
    setVirtualRequest({
      id: entry.request_id || `hist-${entry.id}`,
      name: entry.request_name || entry.url || "Request",
      method: entry.method,
      url: entry.url,
      headers: entry.request_headers || {},
      body: entry.request_body || "",
      auth: entry.request_auth || { type: "none" },
      collection_id: entry.collection_id,
    });
    setSelectedRequestId(entry.request_id || `hist-${entry.id}`);
    toast.success("Loaded from history");
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
        <Clock className="h-8 w-8 opacity-30" />
        <p className="text-xs text-center">
          No history yet.
          <br />
          Send a request to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center px-3 py-2.5 border-b shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("history")} ({history.length})
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-1">
          {history.map((entry) => {
            const statusCode = entry.code;
            const isSuccess = statusCode >= 200 && statusCode < 300;
            const isErr = statusCode >= 400;
            const isReplaying = replayingId === entry.id;

            return (
              <div
                key={entry.id}
                className="rounded-md hover:bg-accent/50 p-2 transition-colors"
              >
                {/* Method + status + url */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground shrink-0 w-8">
                    {entry.method}
                  </span>
                  <Badge
                    variant={
                      isSuccess
                        ? "default"
                        : isErr
                          ? "destructive"
                          : "secondary"
                    }
                    className="font-mono text-[10px] h-4 px-1 shrink-0"
                  >
                    {statusCode}
                  </Badge>
                  <span className="truncate text-[11px] text-foreground/80">
                    {entry.url}
                  </span>
                </div>

                {/* Time */}
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {entry.time_ms}ms
                  </span>
                </div>

                {/* Action buttons — text labels, always visible, stacked if narrow */}
                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => handleReplay(entry.id)}
                    disabled={isReplaying}
                  >
                    {isReplaying ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    <span className="ml-1">{t("replay")}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => handleOpenInEditor(entry)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="ml-1">{t("openInEditor")}</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export default HistoryPanel;
