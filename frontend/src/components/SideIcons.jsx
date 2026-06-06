import React, { useState } from "react";
import { Button } from "@/components/ui";
import { Clock, PanelRightClose } from "lucide-react";
import HistoryPanel from "@/components/HistoryPanel";

export function SideIcons() {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex h-full relative">
      {showHistory && (
        <div
          className="flex flex-col h-full border-l bg-card animate-slide-in-from-right shrink-0 overflow-hidden absolute right-10 top-0 bottom-0 z-10"
          style={{ width: 320 }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              History
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setShowHistory(false)}
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <HistoryPanel width={300} />
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-1 py-2 px-1 border-l bg-sidebar shrink-0">
        <Button
          variant={showHistory ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setShowHistory((s) => !s)}
          title="History"
        >
          <Clock className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
