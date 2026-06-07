import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button, Input } from "@/components/ui";
import { api } from "@/api";
import { toast } from "sonner";
import { Radio, RadioTower, Loader2, Trash2 } from "lucide-react";

const STATUS_CONFIG = {
  connected: { color: "bg-green-500", label: "Streaming", icon: RadioTower },
  connecting: { color: "bg-yellow-500", label: "Connecting…", icon: Loader2 },
  closed: { color: "bg-red-500", label: "Disconnected", icon: Radio },
  error: { color: "bg-red-500", label: "Error", icon: Radio },
};

function tryFormatJSON(data) {
  try {
    const parsed = JSON.parse(data);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return data;
  }
}

export function SSEEditor({
  url = "",
  headers = [],
  requestId,
  onURLChange,
  savedConnID,
  onConnectionChange,
}) {
  const [status, setStatus] = useState("closed");
  const [connID, setConnID] = useState(null);
  const [events, setEvents] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef(null);
  const logEndRef = useRef(null);
  const didRestore = useRef(false);

  const isConnected = status === "connected" || status === "connecting";

  // Auto-scroll
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // Poll for events while connected
  const startPolling = useCallback(
    (id) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const evts = await api.GetSSEEvents(id);
          if (evts && evts.length > 0) {
            setEvents((prev) => [...prev, ...evts]);
          }
          const info = await api.GetSSEStatus(id);
          if (
            info &&
            info.status !== "connected" &&
            info.status !== "connecting"
          ) {
            setStatus(info.status);
            clearInterval(pollRef.current);
            pollRef.current = null;
            onConnectionChange?.(null);
          }
        } catch {
          // Silently handle transient poll errors
        }
      }, 200);
    },
    [onConnectionChange],
  );

  // Restore connection from saved state on mount
  useEffect(() => {
    if (didRestore.current) return;
    if (savedConnID) {
      didRestore.current = true;
      // Verify the connection is still alive before restoring
      api
        .GetSSEStatus(savedConnID)
        .then((info) => {
          if (
            !info ||
            info.status === "connected" ||
            info.status === "connecting"
          ) {
            setConnID(savedConnID);
            setStatus(info?.status || "connected");
            // Load the FULL event log (not incremental) to restore lost state
            api
              .GetAllSSEEvents(savedConnID)
              .then((evts) => {
                if (evts && evts.length > 0) setEvents(evts);
              })
              .catch(() => {});
            startPolling(savedConnID);
          } else {
            // Connection is gone — clear the saved state
            setStatus("closed");
            onConnectionChange?.(null);
          }
        })
        .catch(() => {
          setStatus("closed");
          onConnectionChange?.(null);
        });
    }
  }, [savedConnID, startPolling, onConnectionChange]);

  // Cleanup polling on unmount but DON'T disconnect
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleConnect = async () => {
    if (!url.trim()) {
      toast.error("Enter an SSE endpoint URL");
      return;
    }
    setConnecting(true);
    setEvents([]);
    didRestore.current = false;
    try {
      const headerMap = {};
      headers.forEach((h) => {
        if (h.key.trim()) headerMap[h.key.trim()] = h.value;
      });
      const result = await api.ConnectSSE(requestId || "", url, headerMap);
      setConnID(result.connID);
      setStatus("connected");
      onConnectionChange?.({ connID: result.connID, connType: "sse" });
      toast.success("SSE stream connected");
      startPolling(result.connID);
    } catch (e) {
      setStatus("error");
      toast.error(e.message || "SSE connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connID) return;
    try {
      await api.DisconnectSSE(connID);
    } catch {
      // Connection may already be closed
    }
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setStatus("closed");
    setConnID(null);
    didRestore.current = false;
    onConnectionChange?.(null);
    toast.info("SSE stream disconnected");
  };

  const handleClear = () => {
    setEvents([]);
  };

  const formatTimestamp = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("en-US", {
        hour12: false,
        fractionalSecondDigits: 3,
      });
    } catch {
      return ts;
    }
  };

  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.closed;
  const totalBytes = events.reduce((sum, e) => sum + (e.data?.length || 0), 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Connection bar */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusCfg.color}`}
          />
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusCfg.color}`}
          />
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {statusCfg.label}
        </span>
        <Input
          type="url"
          value={url}
          onChange={(e) => onURLChange?.(e.target.value)}
          placeholder="https://api.example.com/events"
          className="flex-1 h-8 font-mono text-sm"
          disabled={isConnected}
        />
        {isConnected ? (
          <Button variant="destructive" size="sm" onClick={handleDisconnect}>
            <Radio className="h-3.5 w-3.5 mr-1" />
            Disconnect
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleConnect}
            disabled={connecting || !url.trim()}
          >
            {connecting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RadioTower className="h-3.5 w-3.5 mr-1" />
            )}
            Connect
          </Button>
        )}
      </div>

      {/* Event log */}
      <div className="flex-1 min-h-0 overflow-y-auto border-y border-border bg-muted/20">
        <div className="p-3 space-y-2 font-mono text-xs leading-relaxed">
          {events.length === 0 && !isConnected && (
            <div className="text-muted-foreground py-8 text-center text-sm">
              Click <strong>Connect</strong> to start receiving events
            </div>
          )}
          {events.length === 0 && isConnected && (
            <div className="text-muted-foreground py-8 text-center text-sm">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
              Waiting for events…
            </div>
          )}
          {events.map((evt, i) => (
            <div
              key={i}
              className="border border-border rounded-md bg-background/50 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border text-[10px] text-muted-foreground">
                <span>{formatTimestamp(evt.timestamp)}</span>
                {evt.eventType && (
                  <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">
                    {evt.eventType}
                  </span>
                )}
                {evt.id && (
                  <span className="ml-auto text-[10px]">id: {evt.id}</span>
                )}
                {evt.retry > 0 && (
                  <span className="text-[10px]">retry: {evt.retry}ms</span>
                )}
              </div>
              <pre className="px-3 py-2 whitespace-pre-wrap break-all text-xs text-green-400 m-0">
                {tryFormatJSON(evt.data)}
              </pre>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {events.length} event{events.length !== 1 ? "s" : ""} ·{" "}
          {(totalBytes / 1024).toFixed(1)} KB
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px]"
          onClick={handleClear}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>

      {/* Info footer */}
      <div className="px-4 pb-3 text-[10px] text-muted-foreground">
        SSE events stream in real-time · Events persist until tab is closed
      </div>
    </div>
  );
}
