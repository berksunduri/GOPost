import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { api } from "@/api";
import { useAppStatus } from "@/context/AppStatusContext";
import { useTabs } from "@/context/TabsContext";

const RequestsContext = createContext(null);

export function RequestsProvider({ children }) {
  const { runWithStatus, searchQuery } = useAppStatus();
  const { closeTabByRequestId } = useTabs();

  const [requestsByCollection, setRequestsByCollection] = useState({});
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [virtualRequest, setVirtualRequest] = useState(null);

  const requests = useMemo(() => {
    if (searchResults !== null) return searchResults;
    if (!activeCollectionId) return [];
    return requestsByCollection[activeCollectionId] ?? [];
  }, [searchResults, activeCollectionId, requestsByCollection]);

  const getRequestsForCollection = useCallback(
    (collectionId) => {
      if (!collectionId || !(collectionId in requestsByCollection)) {
        return null;
      }
      return requestsByCollection[collectionId];
    },
    [requestsByCollection],
  );

  const selectedRequest = useMemo(() => {
    if (virtualRequest) return virtualRequest;
    if (!selectedRequestId) return null;
    const lists = Object.values(requestsByCollection);
    if (searchResults) lists.push(searchResults);
    for (const list of lists) {
      const match = list.find((r) => r.id === selectedRequestId);
      if (match) return match;
    }
    return null;
  }, [
    virtualRequest,
    selectedRequestId,
    requestsByCollection,
    searchResults,
  ]);

  const setSelectedRequest = useCallback((req) => {
    setSelectedRequestId(req?.id || null);
  }, []);

  const loadRequests = useCallback(
    async (collectionId) => {
      if (!collectionId) return;
      try {
        const result = await runWithStatus("requests", () =>
          api.GetRequestsForCollection(collectionId),
        );
        setRequestsByCollection((prev) => ({
          ...prev,
          [collectionId]: result || [],
        }));
        setVirtualRequest(null);
      } catch (e) {
        console.error("Error loading requests:", e);
      }
    },
    [runWithStatus],
  );

  const createRequestInCollection = useCallback(
    async (collectionId) => {
      const req = await api.CreateRequest(
        collectionId,
        "New Request",
        "GET",
        "https://api.example.com",
        {},
        "",
        "",
      );
      await loadRequests(collectionId);
      return req;
    },
    [loadRequests],
  );

  const searchRequests = useCallback(async () => {
    const result = await runWithStatus("search", () =>
      api.SearchRequests(searchQuery),
    );
    setSearchResults(result || []);
    setActiveCollectionId(null);
  }, [runWithStatus, searchQuery]);

  const refreshRequests = useCallback(async () => {
    if (activeCollectionId) {
      await loadRequests(activeCollectionId);
    }
  }, [activeCollectionId, loadRequests]);

  const deleteRequest = useCallback(
    async (requestId, collectionId) => {
      await api.DeleteRequest(requestId);
      await loadRequests(collectionId);
      closeTabByRequestId(requestId);
      if (selectedRequestId === requestId) {
        setSelectedRequestId(null);
      }
    },
    [loadRequests, closeTabByRequestId, selectedRequestId],
  );

  const clearRequests = useCallback(() => {
    setActiveCollectionId(null);
    setSearchResults(null);
    setVirtualRequest(null);
    setSelectedRequestId(null);
  }, []);

  const removeRequestsForCollection = useCallback((collectionId) => {
    setRequestsByCollection((prev) => {
      if (!(collectionId in prev)) return prev;
      const next = { ...prev };
      delete next[collectionId];
      return next;
    });
    setActiveCollectionId((prev) => (prev === collectionId ? null : prev));
  }, []);

  const value = useMemo(
    () => ({
      requests,
      getRequestsForCollection,
      selectedRequest,
      selectedRequestId,
      virtualRequest,
      activeCollectionId,
      setActiveCollectionId,
      setSelectedRequestId,
      setVirtualRequest,
      setSelectedRequest,
      loadRequests,
      createRequestInCollection,
      searchRequests,
      refreshRequests,
      deleteRequest,
      clearRequests,
      removeRequestsForCollection,
    }),
    [
      requests,
      getRequestsForCollection,
      selectedRequest,
      selectedRequestId,
      virtualRequest,
      activeCollectionId,
      setSelectedRequest,
      loadRequests,
      createRequestInCollection,
      searchRequests,
      refreshRequests,
      deleteRequest,
      clearRequests,
      removeRequestsForCollection,
    ],
  );

  return (
    <RequestsContext.Provider value={value}>{children}</RequestsContext.Provider>
  );
}

export function useRequests() {
  const ctx = useContext(RequestsContext);
  if (!ctx) throw new Error("useRequests must be used within RequestsProvider");
  return ctx;
}
