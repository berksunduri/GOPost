import React, { useRef, useState, useEffect, useCallback } from "react";
import { useCollections } from "@/context/CollectionsContext";
import { useTabs } from "@/context/TabsContext";
import { Button } from "@/components/ui";
import { X, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const methodColors = {
  GET: "text-green-400",
  POST: "text-yellow-400",
  PUT: "text-blue-400",
  DELETE: "text-red-400",
  PATCH: "text-purple-400",
};

export const TabBar = React.memo(function TabBar() {
  const { openTabs, activeTabId, openTab, closeTab } = useTabs();
  const { selectedCollection, collections, selectCollection } =
    useCollections();

  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Check overflow on mount, tab changes, and resize
  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [openTabs, checkOverflow]);

  // Also listen to scroll events on the container
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkOverflow, { passive: true });
    return () => el.removeEventListener("scroll", checkOverflow);
  }, [checkOverflow]);

  const scrollBy = (amount) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  const handleNewTab = () => {
    let collId = selectedCollection?.id;
    if (!collId && collections.length > 0) {
      collId = collections[0].id;
      selectCollection(collections[0]);
    }

    const tempId = `new-${Date.now()}`;
    openTab({
      id: tempId,
      name: "New Request",
      method: "GET",
      url: "https://api.example.com",
      headers: {},
      body: "",
      auth: { type: "none" },
      collection_id: collId || "",
    });
  };

  // Helper to determine if "Saved" indicator should show (within 1.5s of lastSave)
  const wasRecentlySaved = (tab) => {
    if (!tab.lastSavedAt) return false;
    return Date.now() - tab.lastSavedAt < 1500;
  };

  if (openTabs.length === 0) {
    return (
      <div className="flex items-center px-3 h-10 border-b shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={handleNewTab}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> New Tab
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center h-10 border-b shrink-0">
      {/* Scroll left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scrollBy(-200)}
          className="h-full px-1 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Scroll tabs left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Scrollable tab container */}
      <div
        ref={scrollRef}
        className="flex items-center h-full overflow-x-auto overflow-y-hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const method = tab.request?.method || "GET";
          const color = methodColors[method] || "text-gray-400";

          return (
            <div
              key={tab.id}
              onClick={() => openTab(tab.request)}
              className={cn(
                "flex items-center gap-1.5 h-full px-3 border-r text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer select-none",
                isActive
                  ? "bg-background text-foreground border-t-2 border-t-primary border-b-0"
                  : "bg-muted/50 text-muted-foreground hover:bg-accent border-t-2 border-t-transparent",
              )}
            >
              <span className={cn("text-[10px] font-mono font-bold", color)}>
                {method}
              </span>
              <span className="max-w-[140px] truncate">
                {tab.request?.name || "New Request"}
              </span>
              {tab.isDirty ? (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"
                  title="Unsaved changes"
                />
              ) : wasRecentlySaved(tab) ? (
                <span
                  className="text-[10px] text-green-400 shrink-0 animate-pulse"
                  title="Saved"
                >
                  ✓
                </span>
              ) : null}
              <button
                className="ml-1 hover:bg-muted rounded-sm p-0.5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                tabIndex={-1}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Scroll right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scrollBy(200)}
          className="h-full px-1 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Scroll tabs right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* New tab button */}
      <button
        onClick={handleNewTab}
        className="h-full px-2 text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
        title="New Tab"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
});
