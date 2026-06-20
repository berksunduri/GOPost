import React from "react";
import { Button } from "@/components/ui";
import { FolderTree, GitBranch, Clock, Settings, Server } from "lucide-react";
import { t } from "@/i18n";

const primaryIcons = [
  { id: "explorer", icon: FolderTree, labelKey: "activityExplorer" },
  { id: "git", icon: GitBranch, labelKey: "activityGit" },
  { id: "history", icon: Clock, labelKey: "activityHistory" },
  { id: "mock", icon: Server, labelKey: "activityMock" },
];

const settingsIcon = {
  id: "settings",
  icon: Settings,
  labelKey: "activitySettings",
};

export const ActivityBar = React.memo(function ActivityBar({
  active,
  onSelect,
  onOpenSettings,
}) {
  const renderButton = ({ id, icon: Icon, labelKey }) => (
    <Button
      key={id}
      variant={active === id ? "default" : "ghost"}
      size="icon"
      className="h-9 w-9 rounded-none border-l-2"
      style={{
        borderLeftColor: active === id ? "hsl(var(--primary))" : "transparent",
      }}
      onClick={() => onSelect(id)}
      title={t(labelKey)}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );

  return (
    <div className="flex flex-col items-center gap-0.5 py-2 w-12 bg-sidebar border-r shrink-0 h-full">
      <div className="flex flex-col items-center gap-0.5">
        {primaryIcons.map(renderButton)}
      </div>
      <div className="mt-auto flex flex-col items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-none border-l-2 border-l-transparent"
          onClick={onOpenSettings}
          title={t(settingsIcon.labelKey)}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
});

export { primaryIcons, settingsIcon };
