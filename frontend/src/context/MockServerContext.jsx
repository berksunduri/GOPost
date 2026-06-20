import React, { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";
import { api } from "@/api";
import { toast } from "sonner";
import { t } from "@/i18n";

const MockServerContext = createContext(null);

const POLL_INTERVAL_MS = 5000;
const LOG_POLL_INTERVAL_MS = 2000;

export function MockServerProvider({ children }) {
  const [status, setStatus] = useState({ running: false, port: 3001, handlers: [] });
  const [mockConfigs, setMockConfigs] = useState({}); // requestID → MockConfig
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false); // true while start/stop is in flight
  const startInFlightRef = useRef(false);
  const stopInFlightRef = useRef(false);
  const pollRef = useRef(null);
  const logPollRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.GetMockStatus();
      if (s) setStatus(s);
    } catch { /* server not running — ignore */ }
  }, []);

  const refreshLog = useCallback(async () => {
    try {
      const entries = await api.GetMockLog();
      if (Array.isArray(entries)) setLog(entries);
    } catch { /* ignore */ }
  }, []);

  // Synchronize polling with the running mock backend.
  // useEffect is required here: this synchronizes UI state with an external
  // system (a separate HTTP server) that changes outside the React render cycle.
  useEffect(() => {
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

  const startServer = useCallback(async (port = 3001) => {
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
  }, [refreshStatus, refreshLog]);

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

  const setMock = useCallback(async (requestId, method, path, config = {}) => {
    const mc = {
      statusCode: config.statusCode ?? 200,
      headers: config.headers ?? { "Content-Type": "application/json" },
      body: config.body ?? "{}",
      latencyMs: config.latencyMs ?? 0,
      enabled: config.enabled ?? true,
    };
    try {
      const result = await api.SetMockConfig(requestId, mc);
      setMockConfigs(prev => ({ ...prev, [requestId]: result }));
      if (mc.enabled) {
        toast.success(`${t("mockEnabledFor")} ${method} ${path}`);
      } else {
        toast.success(t("mockDisabledFor"));
      }
      await refreshStatus();
    } catch (err) {
      toast.error(`${t("mockSetFailed")}: ${err?.message || err}`);
    }
  }, [refreshStatus]);

  const removeMock = useCallback(async (requestId) => {
    try {
      await api.RemoveMockConfig(requestId);
      setMockConfigs(prev => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      toast.success(t("mockRemoved"));
      await refreshStatus();
    } catch (err) {
      toast.error(`${t("mockRemoveFailed")}: ${err?.message || err}`);
    }
  }, [refreshStatus]);

  const loadMocks = useCallback(async (collectionId) => {
    try {
      const configs = await api.LoadMockConfigs(collectionId);
      const map = {};
      for (const mc of (configs || [])) {
        map[mc.request_id] = mc;
      }
      setMockConfigs(map);
      await refreshStatus();
    } catch { /* collection may not have mocks */ }
  }, [refreshStatus]);

  const clearLog = useCallback(async () => {
    setLog([]);
    try {
      await api.ClearMockLog();
    } catch {
      // If the backend call fails the next poll will repopulate — acceptable.
    }
  }, []);

  return (
    <MockServerContext.Provider value={{
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
    }}>
      {children}
    </MockServerContext.Provider>
  );
}

export function useMockServer() {
  const ctx = useContext(MockServerContext);
  if (!ctx) throw new Error(t("mockProviderError"));
  return ctx;
}
