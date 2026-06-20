import React, { useState } from "react";
import { Button, Input, Badge } from "@/components/ui";
import { useMockServer } from "@/context/MockServerContext";
import { Play, Square, Copy, Server, Trash2, ListTree } from "lucide-react";
import { t } from "@/i18n";
import { toast } from "sonner";

const DEFAULT_PORT = 3001;

/**
 * Sidebar panel for controlling the built-in mock server.
 * Shows server status, port configuration, the list of mocked endpoints,
 * and a live request log.
 */
export function MockPanel({ width }) {
  const { status, log, busy, startServer, stopServer, removeMock, clearLog } =
    useMockServer();
  const [portInput, setPortInput] = useState(DEFAULT_PORT);

  const effectivePort = status.running ? status.port : portInput;
  const mockURL = `http://localhost:${effectivePort}`;

  const handleCopyURL = async () => {
    try {
      await navigator.clipboard.writeText(mockURL);
      toast.success(t("mockCopied"));
    } catch {
      const ta = document.createElement("textarea");
      ta.value = mockURL;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const handlers = status.handlers || [];

  return (
    <div className="flex flex-col h-full bg-sidebar overflow-hidden" style={{ width }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t("mockServer")}
          </span>
          {status.running && (
            <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4">
              {t("mockLive")}
            </Badge>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="p-3 space-y-3 border-b shrink-0">
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            value={portInput}
            onChange={(e) => setPortInput(parseInt(e.target.value) || DEFAULT_PORT)}
            disabled={status.running || busy}
            placeholder={t("mockPortPlaceholder")}
            className="h-8 w-20 text-xs font-mono"
            min={1}
            max={65535}
          />
          {status.running ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs gap-1.5 flex-1"
              onClick={stopServer}
              disabled={busy}
            >
              <Square className="h-3 w-3" />
              {busy ? t("mockStopping") : t("mockStop")}
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs gap-1.5 flex-1"
              onClick={() => startServer(portInput)}
              disabled={busy}
            >
              <Play className="h-3 w-3" />
              {busy ? t("mockStarting") : t("mockStart")}
            </Button>
          )}
        </div>

        {status.running && (
          <div className="flex items-center gap-1.5">
            <code className="flex-1 text-[11px] font-mono bg-muted/50 rounded px-2 py-1 truncate text-primary/80">
              {mockURL}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleCopyURL}
              title={t("mockCopied")}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Handler list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {handlers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <Server className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              {status.running ? t("mockNoHandlers") : t("mockNotRunning")}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {handlers.map((h) => (
              <div
                key={h.request_id}
                className="px-3 py-2 border-b border-border/30 last:border-b-0 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 h-4 font-mono shrink-0"
                  >
                    {h.method}
                  </Badge>
                  <code className="text-[11px] font-mono truncate flex-1">
                    {h.path || "/"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 opacity-40 hover:opacity-100"
                    onClick={() => removeMock(h.request_id)}
                    title={t("mockRemoveTitle")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span className="px-1 rounded bg-muted font-mono">
                    {h.status_code || 200}
                  </span>
                  {h.latency_ms > 0 && (
                    <span className="text-muted-foreground/60">
                      {h.latency_ms}ms
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Request log */}
        {status.running && (
          <div className="border-t mt-2">
            <div className="flex items-center justify-between px-3 py-2 sticky top-0 bg-sidebar z-10">
              <div className="flex items-center gap-1.5">
                <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("mockRequestLog")}
                </span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  {log.length}
                </span>
              </div>
              {log.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-40 hover:opacity-100"
                  onClick={clearLog}
                  title={t("mockClearLog")}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            {log.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/60 px-3 pb-3">
                {t("mockLogEmpty")}
              </p>
            ) : (
              <div className="pb-2">
                {log.map((entry, i) => (
                  <div
                    key={`${entry.time}-${i}`}
                    className="px-3 py-1.5 border-b border-border/20 last:border-b-0 hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-mono px-1 rounded shrink-0 ${
                          entry.status_code >= 400
                            ? "bg-destructive/20 text-destructive"
                            : "bg-muted"
                        }`}
                      >
                        {entry.status_code}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 font-mono shrink-0"
                      >
                        {entry.method}
                      </Badge>
                      <code className="text-[10px] font-mono truncate flex-1">
                        {entry.path}
                        {entry.query ? `?${entry.query}` : ""}
                      </code>
                      <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">
                        {entry.duration_ms}ms
                      </span>
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 ml-7 mt-0.5">
                      {entry.matched_id
                        ? `${t("mockLogMatched")} → ${entry.matched_path}`
                        : t("mockLogUnmatched")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
