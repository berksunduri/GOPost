import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

const shortcuts = [
  { keys: "Ctrl+Enter", action: "Send request" },
  { keys: "Ctrl+S", action: "Save request" },
  { keys: "Ctrl+N", action: "New tab" },
  { keys: "Ctrl+W", action: "Close current tab" },
  { keys: "Ctrl+Tab", action: "Next tab" },
  { keys: "Ctrl+Shift+Tab", action: "Previous tab" },
  { keys: "?", action: "Show shortcuts" },
];

export function ShortcutModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground">{s.action}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
