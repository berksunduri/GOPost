import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { getAppService } from "@/bridge";

const AppStatusContext = createContext(null);

export function AppStatusProvider({ children }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState({
    collections: true,
    environments: true,
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingState, setLoadingState] = useState("");
  const [lastRunReport, setLastRunReport] = useState(null);

  const bridgeMode = getAppService() ? "native" : "fallback";

  const runWithStatus = useCallback(async (label, handler) => {
    setLoadingState(label);
    setErrorMessage("");
    try {
      return await handler();
    } catch (error) {
      setErrorMessage(error.message || String(error));
      throw error;
    } finally {
      setLoadingState("");
    }
  }, []);

  const value = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      isLoading,
      setIsLoading,
      errorMessage,
      setErrorMessage,
      loadingState,
      lastRunReport,
      setLastRunReport,
      bridgeMode,
      runWithStatus,
    }),
    [
      searchQuery,
      isLoading,
      errorMessage,
      loadingState,
      lastRunReport,
      bridgeMode,
      runWithStatus,
    ],
  );

  return (
    <AppStatusContext.Provider value={value}>{children}</AppStatusContext.Provider>
  );
}

export function useAppStatus() {
  const ctx = useContext(AppStatusContext);
  if (!ctx) throw new Error("useAppStatus must be used within AppStatusProvider");
  return ctx;
}
