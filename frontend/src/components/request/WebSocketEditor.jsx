import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { api } from "@/api";
import { toast } from "sonner";
import {
  Wifi,
  WifiOff,
  Loader2,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react";

const STATUS_CONFIG = {
  connected: { color: "bg-green-500", label: "Connected", icon: Wifi },
  connecting: { color: "bg-yellow-500", label: "Connecting…", icon: Loader2 },
  closed: { color: "bg-red-500", label: "Disconnected", icon: WifiOff },
  error: { color: "bg-red-500", label: "Error", icon: WifiOff },
};

function tryFormatJSON(data) {
  try {
    const parsed = JSON.parse(data);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return data;
  }
}

export function WebSocketEditor({
  url = "",
  headers = [],
  requestId,
  onURLChange,
  savedConnID,
  onConnectionChange,
}) {
  const [status, setStatus] = useState("closed");
  const [connID, setConnID] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef(null);
  const logEndRef = useRef(null);
  const didRestore = useRef(false);

  const isConnected = status === "connected" || status === "connecting";

  // Auto-scroll to bottom of message log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for messages while connected
  const startPolling = useCallback(
    (id) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const msgs = await api.GetWebSocketMessages(id);
          if (msgs && msgs.length > 0) {
            setMessages((prev) => [...prev, ...msgs]);
          }
          const info = await api.GetWebSocketStatus(id);
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
        .GetWebSocketStatus(savedConnID)
        .then((info) => {
          if (
            !info ||
            info.status === "connected" ||
            info.status === "connecting"
          ) {
            setConnID(savedConnID);
            setStatus(info?.status || "connected");
            // Load the FULL message log (not incremental) to restore lost state
            api
              .GetAllWebSocketMessages(savedConnID)
              .then((msgs) => {
                if (msgs && msgs.length > 0) setMessages(msgs);
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
      toast.error("Enter a WebSocket URL (ws:// or wss://)");
      return;
    }
    setConnecting(true);
    setMessages([]);
    didRestore.current = false;
    try {
      const headerMap = {};
      headers.forEach((h) => {
        if (h.key.trim()) headerMap[h.key.trim()] = h.value;
      });
      const result = await api.ConnectWebSocket(
        requestId || "",
        url,
        headerMap,
      );
      setConnID(result.connID);
      setStatus("connected");
      onConnectionChange?.({ connID: result.connID, connType: "ws" });
      toast.success("WebSocket connected");
      startPolling(result.connID);
    } catch (e) {
      setStatus("error");
      toast.error(e.message || "WebSocket connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connID) return;
    try {
      await api.DisconnectWebSocket(connID);
    } catch {
      // Connection may already be closed
    }
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setStatus("closed");
    setConnID(null);
    didRestore.current = false;
    onConnectionChange?.(null);
    toast.info("WebSocket disconnected");
  };

  const handleSend = async () => {
    if (!input.trim() || !connID) return;
    try {
      await api.SendWebSocketMessage(connID, input.trim());
      setInput("");
    } catch (e) {
      toast.error(e.message || "Send failed");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
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
  const totalBytes = messages.reduce((sum, m) => sum + (m.size || 0), 0);

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
          placeholder="wss://echo.example.com/ws"
          className="flex-1 h-8 font-mono text-sm"
          disabled={isConnected}
        />
        {isConnected ? (
          <Button variant="destructive" size="sm" onClick={handleDisconnect}>
            <WifiOff className="h-3.5 w-3.5 mr-1" />
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
              <Wifi className="h-3.5 w-3.5 mr-1" />
            )}
            Connect
          </Button>
        )}
      </div>

      {/* Message log */}
      <div className="flex-1 min-h-0 overflow-y-auto border-y border-border bg-muted/20">
        <div className="p-3 space-y-1 font-mono text-xs leading-relaxed">
          {messages.length === 0 && !isConnected && (
            <div className="text-muted-foreground py-8 text-center text-sm">
              Click <strong>Connect</strong> to start receiving messages
            </div>
          )}
          {messages.length === 0 && isConnected && (
            <div className="text-muted-foreground py-8 text-center text-sm">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
              Waiting for messages…
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 py-0.5 px-1 rounded ${
                msg.direction === "send" ? "text-cyan-400" : "text-green-400"
              }`}
            >
              <span className="shrink-0 mt-px">
                {msg.direction === "send" ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground w-[80px]">
                {formatTimestamp(msg.timestamp)}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground w-[32px]">
                {msg.size}B
              </span>
              <pre className="flex-1 whitespace-pre-wrap break-all m-0 text-xs">
                {tryFormatJSON(msg.data)}
              </pre>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {messages.length} message{messages.length !== 1 ? "s" : ""} ·{" "}
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

      {/* Message input */}
      <div className="flex items-start gap-2 px-4 py-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='{"type": "subscribe", "channel": 1}'
          className="flex-1 min-h-[48px] max-h-[120px] font-mono text-sm"
          rows={2}
          disabled={!isConnected}
          spellCheck={false}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!isConnected || !input.trim()}
          className="h-9 mt-0.5"
        >
          Send
        </Button>
      </div>

      <div className="px-4 pb-2 text-[10px] text-muted-foreground">
        Ctrl+Enter to send · Messages persist until tab is closed
      </div>
    </div>
  );
}
