import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Terminal as TerminalIcon, Trash2 } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { TERMINAL_ENABLED } from "@/config/features";
import { useTheme } from "@/context/ThemeContext";

const TERM_FONT =
  '"MesloLGS NF", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "Hack Nerd Font", "SFMono Nerd Font", Menlo, Monaco, monospace';

const RESIZE_PREFIX = "\x01";

let XtermMod = null;
let FitAddonMod = null;
let WebLinksMod = null;

async function load() {
  if (XtermMod)
    return {
      Terminal: XtermMod,
      FitAddon: FitAddonMod,
      WebLinksAddon: WebLinksMod,
    };
  const [x, f, w] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
    import("@xterm/addon-web-links"),
  ]);
  XtermMod = x.Terminal;
  FitAddonMod = f.FitAddon;
  WebLinksMod = w.WebLinksAddon;
  return {
    Terminal: XtermMod,
    FitAddon: FitAddonMod,
    WebLinksAddon: WebLinksMod,
  };
}

function sendResize(ws, cols, rows) {
  if (ws?.readyState === WebSocket.OPEN && cols > 0 && rows > 0) {
    ws.send(RESIZE_PREFIX + JSON.stringify({ cols, rows }));
  }
}

function focusTerminal(container, term) {
  term?.focus();
  const textarea = container?.querySelector(".xterm-helper-textarea");
  if (textarea instanceof HTMLTextAreaElement) {
    textarea.focus();
  }
}

function layoutTerminal(container, t, fit, ws) {
  try {
    fit.fit();
  } catch (_) {}
  sendResize(ws, t.cols, t.rows);
  focusTerminal(container, t);
}

export function TerminalPanel() {
  const ref = useRef(null);
  const term = useRef(null);
  const ws = useRef(null);
  const fitRef = useRef(null);
  const [err, setErr] = useState(null);
  const { themeId } = useTheme();

  useEffect(() => {
    if (!TERMINAL_ENABLED || !ref.current) return;
    let disposed = false;
    let resizeObs = null;
    const outq = [];

    (async () => {
      try {
        const { Terminal, FitAddon, WebLinksAddon } = await load();
        if (disposed) return;

        const t = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: TERM_FONT,
          theme:
            themeId === "light"
              ? {
                  background: "#ffffff",
                  foreground: "#1a1a2e",
                  cursor: "#0969da",
                }
              : {
                  background: "#0d1117",
                  foreground: "#c9d1d9",
                  cursor: "#58a6ff",
                },
          rows: 24,
          cols: 80,
          scrollback: 5000,
        });
        const fit = new FitAddon();
        fitRef.current = fit;
        t.loadAddon(fit);
        t.loadAddon(new WebLinksAddon());
        t.open(ref.current);

        // Register input handler before any async gap or shell output.
        t.onData((d) => {
          const socket = ws.current;
          if (socket?.readyState === WebSocket.OPEN) socket.send(d);
          else outq.push(d);
        });

        t.onResize(({ cols, rows }) => sendResize(ws.current, cols, rows));

        const r = await fetch("/api/term-port");
        const { port } = await r.json();
        if (disposed) return;
        if (!port) {
          setErr("No port");
          return;
        }

        const s = new WebSocket(`ws://127.0.0.1:${port}/terminal`);
        s.binaryType = "arraybuffer";
        ws.current = s;

        s.onmessage = (e) => {
          if (e.data instanceof ArrayBuffer) {
            t.write(new Uint8Array(e.data));
          } else if (typeof e.data === "string") {
            t.write(e.data);
          }
        };

        s.onopen = () => {
          if (disposed) return;
          while (outq.length) s.send(outq.shift());
          requestAnimationFrame(() => layoutTerminal(ref.current, t, fit, s));
        };
        s.onclose = () => {
          t.write("\r\n\x1b[31mDisconnected\x1b[0m\r\n");
        };
        s.onerror = () => setErr("WebSocket error");

        resizeObs = new ResizeObserver(() => {
          if (!disposed) layoutTerminal(ref.current, t, fit, s);
        });
        resizeObs.observe(ref.current);

        term.current = t;
        requestAnimationFrame(() => layoutTerminal(ref.current, t, fit, s));
      } catch (e) {
        if (!disposed) setErr(e.message);
      }
    })();

    return () => {
      disposed = true;
      resizeObs?.disconnect();
      ws.current?.close();
      ws.current = null;
      fitRef.current = null;
      term.current?.dispose();
      term.current = null;
    };
  }, [themeId]);

  if (!TERMINAL_ENABLED) return null;

  return (
    <div className="flex flex-col h-full bg-muted border-t">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Terminal
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => term.current?.clear()}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div
        ref={ref}
        className="flex-1 w-full min-h-0 overflow-hidden"
        onMouseDown={(e) => {
          e.stopPropagation();
          focusTerminal(ref.current, term.current);
        }}
      />
      {err && (
        <div className="px-3 py-2 text-xs text-red-400 bg-red-400/10 border-t">
          {err}
        </div>
      )}
    </div>
  );
}
