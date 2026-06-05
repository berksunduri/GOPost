import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/api";
import { getAppService } from "@/bridge";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(null);
  const [history, setHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState({
    collections: true,
    environments: true,
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingState, setLoadingState] = useState("");
  const [lastRunReport, setLastRunReport] = useState(null);
  const [virtualRequest, setVirtualRequest] = useState(null);

  const selectedCollection = useMemo(
    () => collections.find((c) => c.id === selectedCollectionId) || null,
    [collections, selectedCollectionId],
  );

  const selectedRequest = useMemo(
    () =>
      virtualRequest ||
      requests.find((r) => r.id === selectedRequestId) ||
      null,
    [requests, selectedRequestId, virtualRequest],
  );

  const selectedEnvironment = useMemo(
    () => environments.find((e) => e.id === selectedEnvironmentId) || null,
    [environments, selectedEnvironmentId],
  );

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

  const loadCollections = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, collections: true }));
    try {
      const result = await runWithStatus("collections", () =>
        api.GetCollections(),
      );
      setCollections(result || []);
    } catch (e) {
      console.error("Error loading collections:", e);
    } finally {
      setIsLoading((prev) => ({ ...prev, collections: false }));
    }
  }, [runWithStatus]);

  const loadEnvironments = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, environments: true }));
    try {
      const result = await runWithStatus("environments", () =>
        api.GetEnvironments(),
      );
      setEnvironments(result || []);
    } catch (e) {
      console.error("Error loading environments:", e);
    } finally {
      setIsLoading((prev) => ({ ...prev, environments: false }));
    }
  }, [runWithStatus]);

  const loadHistory = useCallback(async () => {
    try {
      const result = await runWithStatus("history", () => api.GetHistory());
      setHistory(result || []);
    } catch (e) {
      console.error("Error loading history:", e);
    }
  }, [runWithStatus]);

  const loadRequests = useCallback(
    async (collectionId) => {
      try {
        const result = await runWithStatus("requests", () =>
          api.GetRequestsForCollection(collectionId),
        );
        setRequests(result || []);
        setSelectedRequestId(null);
        setVirtualRequest(null);
      } catch (e) {
        console.error("Error loading requests:", e);
      }
    },
    [runWithStatus],
  );

  const selectCollection = useCallback(
    (collection) => {
      setSelectedCollectionId(collection?.id || null);
      if (collection?.id) {
        loadRequests(collection.id);
      } else {
        setRequests([]);
      }
    },
    [loadRequests],
  );

  const createCollection = useCallback(
    async (name) => {
      await runWithStatus("createCollection", () => api.CreateCollection(name));
      await loadCollections();
    },
    [runWithStatus, loadCollections],
  );

  const deleteCollection = useCallback(
    async (id) => {
      await runWithStatus("deleteCollection", () => api.DeleteCollection(id));
      await loadCollections();
      if (selectedCollectionId === id) {
        setSelectedCollectionId(null);
        setRequests([]);
      }
      if (selectedRequest?.collection_id === id) {
        setSelectedRequestId(null);
      }
    },
    [runWithStatus, loadCollections, selectedCollectionId, selectedRequest],
  );

  const updateCollection = useCallback(
    async (id, name) => {
      await runWithStatus("updateCollection", () =>
        api.UpdateCollection(id, name),
      );
      await loadCollections();
    },
    [runWithStatus, loadCollections],
  );

  const createEnvironment = useCallback(
    async (name) => {
      await runWithStatus("createEnvironment", () =>
        api.CreateEnvironment(name, {}),
      );
      await loadEnvironments();
    },
    [runWithStatus, loadEnvironments],
  );

  const deleteEnvironment = useCallback(
    async (id) => {
      await runWithStatus("deleteEnvironment", () => api.DeleteEnvironment(id));
      await loadEnvironments();
    },
    [runWithStatus, loadEnvironments],
  );

  const updateEnvironment = useCallback(
    async (id, name, variables) => {
      await runWithStatus("updateEnvironment", () =>
        api.UpdateEnvironment(id, name, variables),
      );
      await loadEnvironments();
    },
    [runWithStatus, loadEnvironments],
  );

  const searchRequests = useCallback(async () => {
    const result = await runWithStatus("search", () =>
      api.SearchRequests(searchQuery),
    );
    setRequests(result || []);
  }, [runWithStatus, searchQuery]);

  const refreshRequests = useCallback(async () => {
    if (selectedCollectionId) {
      await loadRequests(selectedCollectionId);
    }
  }, [selectedCollectionId, loadRequests]);

  const runCollection = useCallback(async () => {
    if (!selectedCollectionId) return;
    const report = await runWithStatus("runCollection", () =>
      api.RunCollection(selectedCollectionId, false),
    );
    setLastRunReport(report);
    await loadHistory();
    await loadRequests(selectedCollectionId);
  }, [runWithStatus, selectedCollectionId, loadHistory, loadRequests]);

  const replayHistoryEntry = useCallback(
    async (entryId) => {
      await api.ReplayHistoryEntry(entryId);
      await loadHistory();
    },
    [loadHistory],
  );

  // Load data on mount
  useEffect(() => {
    loadCollections();
    loadEnvironments();
    loadHistory();
  }, [loadCollections, loadEnvironments, loadHistory]);

  const value = useMemo(
    () => ({
      // Data
      collections,
      selectedCollection,
      selectedCollectionId,
      requests,
      selectedRequest,
      selectedRequestId,
      environments,
      selectedEnvironment,
      selectedEnvironmentId,
      history,
      searchQuery,
      isLoading,
      errorMessage,
      loadingState,
      lastRunReport,
      bridgeMode,

      // Setters
      setSelectedCollectionId,
      setSelectedRequestId,
      setSelectedEnvironmentId,
      setSelectedRequest: (req) => setSelectedRequestId(req?.id || null),
      setVirtualRequest,
      setSearchQuery,
      setErrorMessage,
      setLastRunReport,

      // Actions
      createCollection,
      deleteCollection,
      updateCollection,
      selectCollection,
      createEnvironment,
      deleteEnvironment,
      updateEnvironment,
      searchRequests,
      refreshRequests,
      loadHistory,
      runCollection,
      replayHistoryEntry,
      loadCollections,
      loadEnvironments,
      loadRequests,
    }),
    [
      collections,
      selectedCollection,
      selectedCollectionId,
      requests,
      selectedRequest,
      selectedRequestId,
      environments,
      selectedEnvironment,
      selectedEnvironmentId,
      history,
      searchQuery,
      isLoading,
      errorMessage,
      loadingState,
      lastRunReport,
      bridgeMode,
      createCollection,
      deleteCollection,
      updateCollection,
      selectCollection,
      createEnvironment,
      deleteEnvironment,
      updateEnvironment,
      searchRequests,
      refreshRequests,
      loadHistory,
      runCollection,
      replayHistoryEntry,
      loadCollections,
      loadEnvironments,
      loadRequests,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
