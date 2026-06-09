import React, { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Label,
} from "@/components/ui";
import { Palette, Keyboard } from "lucide-react";
import { t } from "@/i18n";
import { SHORTCUTS, formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", labelKey: "settingsAppearance", icon: Palette },
  { id: "keybindings", labelKey: "settingsKeybindings", icon: Keyboard },
];

function KeybindingRow({ actionKey, keys }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-foreground/90">{t(actionKey)}</span>
      <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono shrink-0">
        {formatShortcut(keys)}
      </kbd>
    </div>
  );
}

export function SettingsModal({ open, onClose, defaultSection = "appearance" }) {
  const { themeId, setThemeId, themeList } = useTheme();
  const [section, setSection] = useState(defaultSection);

  useEffect(() => {
    if (open) setSection(defaultSection);
  }, [open, defaultSection]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>{t("settings")}</DialogTitle>
        </DialogHeader>

        <div className="flex h-[420px]">
          <nav className="w-[140px] shrink-0 border-r py-2 space-y-0.5 bg-muted/30">
            {SECTIONS.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors",
                  section === id
                    ? "bg-primary/15 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            ))}
          </nav>

          <ScrollArea className="flex-1">
            <div className="p-6">
              {section === "appearance" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold mb-1">
                      {t("settingsAppearance")}
                    </h2>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t("settingsAppearanceDesc")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="theme-select" className="text-xs">
                      {t("settingsTheme")}
                    </Label>
                    <Select value={themeId} onValueChange={setThemeId}>
                      <SelectTrigger
                        id="theme-select"
                        className="w-full h-9 text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {themeList.map((theme) => (
                          <SelectItem
                            key={theme.id}
                            value={theme.id}
                            className="text-sm"
                          >
                            {theme.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {section === "keybindings" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold mb-1">
                      {t("settingsKeybindings")}
                    </h2>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t("settingsKeybindingsDesc")}
                    </p>
                  </div>
                  <div className="rounded-md border bg-card/50 px-3">
                    {SHORTCUTS.map((shortcut) => (
                      <KeybindingRow
                        key={shortcut.id}
                        actionKey={shortcut.actionKey}
                        keys={shortcut.keys}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
