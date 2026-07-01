import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
} from "react";
import { api } from "@/api";
import { toast } from "sonner";
import { t } from "@/i18n";

const MockServerContext = createContext(null);

const POLL_INTERVAL_MS = 5000;
const LOG_POLL_INTERVAL_MS = 2000;

// wailsEventsAvailable checks if the Wails runtime event bus is accessible
// (native mode). Falls back to polling when running in browser/HTTP fallback.
function wailsEventsAvailable() {
  try {
    return typeof window !== "undefined" && window.__wails__ != null;
  } catch {
    return false;
  }
}

/**
 * Load the Wails runtime module. Returns null if unavailable (HTTP fallback).
 */
async function loadWailsRuntime() {
  try {
    return await import("/wails/runtime.js");
  } catch {
    return null;
  }
}

export function MockServerProvider({ children }) {
  const [status, setStatus] = useState({
    running: false,
    port: 3001,
    handlers: [],
  });
  const [mockConfigs, setMockConfigs] = useState({}); // requestID → MockConfig
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false); // true while start/stop is in flight
  const startInFlightRef = useRef(false);
  const stopInFlightRef = useRef(false);
  const pollRef = useRef(null);
  const logPollRef = useRef(null);
  const unsubRef = useRef(null); // cleanup for Wails event subscriptions

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.GetMockStatus();
      if (s) setStatus(s);
    } catch {
      /* server not running — ignore */
    }
  }, []);

  const refreshLog = useCallback(async () => {
    try {
      const entries = await api.GetMockLog();
      if (Array.isArray(entries)) setLog(entries);
    } catch {
      /* ignore */
    }
  }, []);

  // Bootstrap: subscribe to Wails events (native mode) or start polling (fallback).
  // useEffect is required here — we're synchronizing with an external event bus.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!wailsEventsAvailable()) return; // use polling fallback below

      const wails = await loadWailsRuntime();
      if (!wails || cancelled) return;

      // Subscribe to mock:status events from the backend
      const unsubStatus = wails.Events.On("mock:status", (event) => {
        const s = event?.data;
        if (s && typeof s === "object" && "running" in s && !cancelled) {
          setStatus((prev) => {
            // Preserve running/port/handlers; event data may be partial
            if (s.running !== undefined) {
              const next = { ...prev, ...s };
              // Ensure handlers array
              if (!Array.isArray(next.handlers)) next.handlers = [];
              return next;
            }
            return prev;
          });
        }
      });

      // Subscribe to mock:log events — each event is a single LogEntry
      const unsubLog = wails.Events.On("mock:log", (event) => {
        const entry = event?.data;
        if (entry && !cancelled) {
          setLog((prev) => {
            const next = [entry, ...prev];
            // Keep cap reasonable
            if (next.length > 500) return next.slice(0, 500);
            return next;
          });
        }
      });

      // Also do an initial fetch to get current state
      refreshStatus();
      refreshLog();

      unsubRef.current = () => {
        unsubStatus();
        unsubLog();
      };
    })();

    return () => {
      cancelled = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [refreshStatus, refreshLog]);

  // Fallback: poll when the server is running and Wails events aren't available.
  // The event subscription above covers native mode; this covers HTTP fallback.
  useEffect(() => {
    if (wailsEventsAvailable()) return; // events handle it

    if (status.running) {
      pollRef.current = setInterval(refreshStatus, POLL_INTERVAL_MS);
      logPollRef.current = setInterval(refreshLog, LOG_POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (logPollRef.current) {
        clearInterval(logPollRef.current);
        logPollRef.current = null;
      }
    };
  }, [status.running, refreshStatus, refreshLog]);

  const startServer = useCallback(
    async (port = 3001) => {
      if (startInFlightRef.current) return;
      startInFlightRef.current = true;
      setBusy(true);
      try {
        await api.StartMockServer(port);
        toast.success(`${t("mockServerStarted")} ${port}`);
        await Promise.all([refreshStatus(), refreshLog()]);
      } catch (err) {
        toast.error(`${t("mockStartFailed")}: ${err?.message || err}`);
      } finally {
        startInFlightRef.current = false;
        setBusy(false);
      }
    },
    [refreshStatus, refreshLog],
  );

  const stopServer = useCallback(async () => {
    if (stopInFlightRef.current) return;
    stopInFlightRef.current = true;
    setBusy(true);
    try {
      await api.StopMockServer();
      toast.success(t("mockServerStopped"));
      await refreshStatus();
    } catch (err) {
      toast.error(`${t("mockStopFailed")}: ${err?.message || err}`);
    } finally {
      stopInFlightRef.current = false;
      setBusy(false);
    }
  }, [refreshStatus]);

  const setMock = useCallback(
    async (requestId, method, path, config = {}) => {
      const mc = {
        statusCode: config.statusCode ?? 200,
        headers: config.headers ?? { "Content-Type": "application/json" },
        body: config.body ?? "{}",
        latencyMs: config.latencyMs ?? 0,
        enabled: config.enabled ?? true,
      };
      try {
        const result = await api.SetMockConfig(requestId, mc);
        setMockConfigs((prev) => ({ ...prev, [requestId]: result }));
        if (mc.enabled) {
          toast.success(`${t("mockEnabledFor")} ${method} ${path}`);
        } else {
          toast.success(t("mockDisabledFor"));
        }
        await refreshStatus();
      } catch (err) {
        toast.error(`${t("mockSetFailed")}: ${err?.message || err}`);
      }
    },
    [refreshStatus],
  );

  const removeMock = useCallback(
    async (requestId) => {
      try {
        await api.RemoveMockConfig(requestId);
        setMockConfigs((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
        toast.success(t("mockRemoved"));
        await refreshStatus();
      } catch (err) {
        toast.error(`${t("mockRemoveFailed")}: ${err?.message || err}`);
      }
    },
    [refreshStatus],
  );

  const loadMocks = useCallback(
    async (collectionId) => {
      try {
        const configs = await api.LoadMockConfigs(collectionId);
        const map = {};
        for (const mc of configs || []) {
          map[mc.request_id] = mc;
        }
        setMockConfigs(map);
        await refreshStatus();
      } catch {
        /* collection may not have mocks */
      }
    },
    [refreshStatus],
  );

  const clearLog = useCallback(async () => {
    setLog([]);
    try {
      await api.ClearMockLog();
    } catch {
      // If the backend call fails the next poll will repopulate — acceptable.
    }
  }, []);

  return (
    <MockServerContext.Provider
      value={{
        status,
        mockConfigs,
        log,
        busy,
        startServer,
        stopServer,
        setMock,
        removeMock,
        loadMocks,
        refreshStatus,
        refreshLog,
        clearLog,
      }}
    >
      {children}
    </MockServerContext.Provider>
  );
}

export function useMockServer() {
  const ctx = useContext(MockServerContext);
  if (!ctx) throw new Error(t("mockProviderError"));
  return ctx;
}
