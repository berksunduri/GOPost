import React, { useEffect, useState, useCallback } from "react";
import { Badge, ScrollArea, Button } from "@/components/ui";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api } from "@/api";

function formatTime(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

export function RunHistoryPanel({ collectionId }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    try {
      const data = await api.GetRunHistory(collectionId);
      setRuns(data || []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-1">
        <Clock className="h-5 w-5 opacity-30" />
        <p className="text-[11px]">No run history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {runs.map((run, i) => (
        <details
          key={run._file || i}
          className="rounded border border-border/50 bg-muted/30"
        >
          <summary className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors rounded">
            <span className="text-[10px] text-muted-foreground">
              {formatTime(run.timestamp)}
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              {run.passed > 0 && (
                <Badge
                  variant="default"
                  className="h-4 text-[10px] gap-1 px-1.5"
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {run.passed}
                </Badge>
              )}
              {run.failed > 0 && (
                <Badge
                  variant="destructive"
                  className="h-4 text-[10px] gap-1 px-1.5"
                >
                  <XCircle className="h-2.5 w-2.5" />
                  {run.failed}
                </Badge>
              )}
            </div>
          </summary>
          <div className="px-3 pb-2 space-y-1">
            {run.results?.map((item, j) => (
              <div
                key={j}
                className="flex items-center gap-2 text-[10px] py-0.5"
              >
                {item.success ? (
                  <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                )}
                <span className="font-mono text-muted-foreground truncate">
                  {item.request_name}
                </span>
                {item.error && (
                  <span className="text-red-400/80 truncate text-[9px]">
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
