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
import { useHistory } from "@/context/HistoryContext";
import { useRequests } from "@/context/RequestsContext";

const CollectionsContext = createContext(null);

export function CollectionsProvider({ children }) {
  const { runWithStatus, setIsLoading, setLastRunReport } = useAppStatus();
  const { loadHistory } = useHistory();
  const {
    loadRequests,
    clearRequests,
    removeRequestsForCollection,
    setActiveCollectionId,
    selectedRequest,
    setSelectedRequestId,
  } = useRequests();

  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState(null);

  const selectedCollection = useMemo(
    () => collections.find((c) => c.id === selectedCollectionId) || null,
    [collections, selectedCollectionId],
  );

  const loadCollections = useCallback(async () => {
    setIsLoading((prev) => ({ ...prev, collections: true }));
    try {
      const result = await runWithStatus("collections", () =>
        api.GetCollections(),
      );
      setCollections(result || []);
    } catch (e) {
      log.error("Error loading collections:", e);
    } finally {
      setIsLoading((prev) => ({ ...prev, collections: false }));
    }
  }, [runWithStatus, setIsLoading]);

  const selectCollection = useCallback(
    (collection) => {
      setSelectedCollectionId(collection?.id || null);
      setSelectedRequestId(null);
      if (collection?.id) {
        setActiveCollectionId(collection.id);
        loadRequests(collection.id);
      } else {
        clearRequests();
      }
    },
    [
      loadRequests,
      clearRequests,
      setActiveCollectionId,
      setSelectedRequestId,
    ],
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
      removeRequestsForCollection(id);
      if (selectedCollectionId === id) {
        setSelectedCollectionId(null);
        clearRequests();
      }
      if (selectedRequest?.collection_id === id) {
        setSelectedRequestId(null);
      }
    },
    [
      runWithStatus,
      loadCollections,
      selectedCollectionId,
      selectedRequest,
      removeRequestsForCollection,
      clearRequests,
      setSelectedRequestId,
    ],
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

  const runCollection = useCallback(async () => {
    if (!selectedCollectionId) return;
    const report = await runWithStatus("runCollection", () =>
      api.RunCollection(selectedCollectionId, false),
    );
    setLastRunReport(report);
    await loadHistory();
    await loadRequests(selectedCollectionId);
  }, [
    runWithStatus,
    selectedCollectionId,
    setLastRunReport,
    loadHistory,
    loadRequests,
  ]);

  const value = useMemo(
    () => ({
      collections,
      selectedCollection,
      selectedCollectionId,
      setSelectedCollectionId,
      loadCollections,
      selectCollection,
      createCollection,
      deleteCollection,
      updateCollection,
      runCollection,
    }),
    [
      collections,
      selectedCollection,
      selectedCollectionId,
      loadCollections,
      selectCollection,
      createCollection,
      deleteCollection,
      updateCollection,
      runCollection,
    ],
  );

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

export function useCollections() {
  const ctx = useContext(CollectionsContext);
  if (!ctx) {
    throw new Error("useCollections must be used within CollectionsProvider");
  }
  return ctx;
}
