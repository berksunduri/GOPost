import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { api } from "@/api";
import log from "@/lib/log";
import { useAppStatus } from "@/context/AppStatusContext";

const HistoryContext = createContext(null);

export function HistoryProvider({ children }) {
  const { runWithStatus } = useAppStatus();
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const result = await runWithStatus("history", () => api.GetHistory());
      setHistory(result || []);
    } catch (e) {
      log.error("Error loading history:", e);
    }
  }, [runWithStatus]);

  const replayHistoryEntry = useCallback(
    async (entryId) => {
      await api.ReplayHistoryEntry(entryId);
      await loadHistory();
    },
    [loadHistory],
  );

  const value = useMemo(
    () => ({
      history,
      loadHistory,
      replayHistoryEntry,
    }),
    [history, loadHistory, replayHistoryEntry],
  );

  return (
    <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
  );
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error("useHistory must be used within HistoryProvider");
  return ctx;
}
