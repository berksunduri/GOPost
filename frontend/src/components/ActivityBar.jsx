import React, { useState } from "react";
import { Button } from "@/components/ui";
import { FolderTree, GitBranch, Clock } from "lucide-react";

const icons = [
  { id: "explorer", icon: FolderTree, label: "Explorer" },
  { id: "git", icon: GitBranch, label: "Source Control" },
  { id: "history", icon: Clock, label: "History" },
];

export function ActivityBar({ active, onSelect }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-2 w-12 bg-sidebar border-r shrink-0">
      {icons.map(({ id, icon: Icon, label }) => (
        <Button
          key={id}
          variant={active === id ? "default" : "ghost"}
          size="icon"
          className="h-9 w-9 rounded-none border-l-2"
          style={{ borderLeftColor: active === id ? "hsl(var(--primary))" : "transparent" }}
          onClick={() => onSelect(id)}
          title={label}
        >
          <Icon className="h-5 w-5" />
        </Button>
      ))}
    </div>
  );
}

export { icons };
