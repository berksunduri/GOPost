import React from "react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const methodColors = {
  GET: "text-green-400",
  POST: "text-yellow-400",
  PUT: "text-blue-400",
  DELETE: "text-red-400",
  PATCH: "text-purple-400",
};

export function TabBar() {
  const { openTabs, activeTabId, openTab, closeTab, selectedCollection } =
    useApp();

  const handleNewTab = () => {
    if (!selectedCollection?.id) {
      toast.error("Select a collection first to create a request");
      return;
    }
    const tempId = `new-${Date.now()}`;
    openTab({
      id: tempId,
      name: "New Request",
      method: "GET",
      url: "",
      headers: {},
      body: "",
      auth: { type: "none" },
      collection_id: selectedCollection.id,
    });
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
    <div className="flex items-center h-10 border-b shrink-0 overflow-x-auto">
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
            {tab.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
            )}
            <button
              className="ml-1 hover:bg-muted rounded-sm p-0.5"
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

      <button
        onClick={handleNewTab}
        className="h-full px-2 text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
        title="New Tab"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
