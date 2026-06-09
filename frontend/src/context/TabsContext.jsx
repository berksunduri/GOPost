import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const TabsContext = createContext(null);

const TAB_STATE_KEY = "gopost.tabs";

export function TabsProvider({ children }) {
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  const openTab = useCallback((request) => {
    if (!request?.id) return;
    setActiveTabId(request.id);
    setOpenTabs((prev) => {
      const exists = prev.find((t) => t.id === request.id);
      if (exists) return prev;
      return [
        ...prev,
        { id: request.id, request, isDirty: false, response: null },
      ];
    });
  }, []);

  const closeTab = useCallback((tabId) => {
    setOpenTabs((prev) => prev.filter((t) => t.id !== tabId));
    setActiveTabId((prev) => (prev === tabId ? null : prev));
  }, []);

  const closeTabByRequestId = useCallback((requestId) => {
    setOpenTabs((prev) => prev.filter((t) => t.id !== requestId));
    setActiveTabId((prev) => (prev === requestId ? null : prev));
  }, []);

  const updateTabData = useCallback((tabId, updates) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
    );
  }, []);

  const markDirty = useCallback((tabId) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isDirty: true } : t)),
    );
  }, []);

  const markSaved = useCallback((tabId) => {
    const savedAt = Date.now();
    setOpenTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, isDirty: false, lastSavedAt: savedAt } : t,
      ),
    );
    setTimeout(() => {
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.id === tabId && t.lastSavedAt === savedAt
            ? { ...t, lastSavedAt: null }
            : t,
        ),
      );
    }, 1500);
  }, []);

  // Persist tab IDs to localStorage so they survive app restarts
  useEffect(() => {
    try {
      const state = {
        ids: openTabs.map((t) => t.id),
        activeId: activeTabId,
      };
      localStorage.setItem(TAB_STATE_KEY, JSON.stringify(state));
    } catch {
      // localStorage may be unavailable
    }
  }, [openTabs, activeTabId]);

  // Read persisted tab IDs from localStorage (called by app on startup)
  const restoreTabIds = useCallback(() => {
    try {
      const raw = localStorage.getItem(TAB_STATE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (state?.ids?.length > 0) {
        return { ids: state.ids, activeId: state.activeId || null };
      }
    } catch {
      // Corrupted data — clear it
      localStorage.removeItem(TAB_STATE_KEY);
    }
    return null;
  }, []);

  useEffect(() => {
    if (!activeTabId && openTabs.length > 0) {
      setActiveTabId(openTabs[0].id);
    }
  }, [activeTabId, openTabs]);

  const value = useMemo(
    () => ({
      openTabs,
      activeTabId,
      openTab,
      closeTab,
      closeTabByRequestId,
      updateTabData,
      markDirty,
      markSaved,
      restoreTabIds,
    }),
    [
      openTabs,
      activeTabId,
      openTab,
      closeTab,
      closeTabByRequestId,
      updateTabData,
      markDirty,
      markSaved,
      restoreTabIds,
    ],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used within TabsProvider");
  return ctx;
}
