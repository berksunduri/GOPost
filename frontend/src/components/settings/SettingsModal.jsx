import React, { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useUserConfig } from "@/context/UserConfigContext";
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
import { Palette, Keyboard, RotateCcw } from "lucide-react";
import { t } from "@/i18n";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUTS,
  formatShortcut,
  keysFromEvent,
  shortcutsEqual,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", labelKey: "settingsAppearance", icon: Palette },
  { id: "keybindings", labelKey: "settingsKeybindings", icon: Keyboard },
];

function KeybindingRow({ shortcut, currentKeys, onCapture, isCapturing }) {
  const isCustom = !shortcutsEqual(currentKeys, DEFAULT_SHORTCUTS[shortcut.id]);

  const handleClick = () => {
    onCapture(shortcut.id);
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (!isCapturing) return;
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels
      if (e.key === "Escape") {
        onCapture(null);
        return;
      }

      // Ignore pure modifier presses
      if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;

      const keys = keysFromEvent(e);
      if (keys.length === 0) return;
      onCapture(null, keys);
    },
    [isCapturing, onCapture],
  );

  useEffect(() => {
    if (isCapturing) {
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [isCapturing, handleKeyDown]);

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-foreground/90">
        {t(shortcut.actionKey)}
      </span>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "px-2 py-1 rounded text-xs font-mono shrink-0 min-w-[80px] text-center transition-colors",
          isCapturing
            ? "bg-primary/20 text-primary ring-1 ring-primary animate-pulse"
            : isCustom
              ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              : "bg-muted hover:bg-accent",
        )}
        title={isCapturing ? t("capturingShortcut") : t("clickToRebind")}
      >
        {isCapturing ? "..." : formatShortcut(currentKeys)}
      </button>
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
  defaultSection = "appearance",
}) {
  const { themeId, setThemeId, themeList } = useTheme();
  const { shortcuts, updateShortcut, resetShortcut } = useUserConfig();
  const [section, setSection] = useState(defaultSection);
  const [capturingId, setCapturingId] = useState(null);
  const [conflict, setConflict] = useState(null);

  // Resolve with defaults fallback
  const getKeys = useCallback(
    (id) => shortcuts[id] ?? DEFAULT_SHORTCUTS[id] ?? [],
    [shortcuts],
  );

  useEffect(() => {
    if (open) setSection(defaultSection);
  }, [open, defaultSection]);

  // Clear capture state when modal closes
  useEffect(() => {
    if (!open) {
      setCapturingId(null);
      setConflict(null);
    }
  }, [open]);

  const handleCapture = useCallback(
    (actionId, newKeys) => {
      // Cancel: both args undefined/null
      if (actionId === null && newKeys === undefined) {
        setCapturingId(null);
        setConflict(null);
        return;
      }

      // Start capturing: actionId provided, no newKeys
      if (newKeys === undefined) {
        setCapturingId(actionId);
        setConflict(null);
        return;
      }

      // Finish: newKeys provided (actionId may be carried from closure)
      const targetId = actionId ?? capturingId;

      // Check for conflicts with other shortcuts
      const conflictEntry = Object.entries(shortcuts).find(
        ([id, keys]) => id !== targetId && shortcutsEqual(keys, newKeys),
      );
      if (conflictEntry) {
        setConflict(conflictEntry[0]);
        return;
      }

      // Check conflict with defaults
      const defaultConflict = Object.entries(DEFAULT_SHORTCUTS).find(
        ([id, keys]) =>
          id !== targetId && !shortcuts[id] && shortcutsEqual(keys, newKeys),
      );
      if (defaultConflict) {
        setConflict(defaultConflict[0]);
        return;
      }

      updateShortcut(targetId, newKeys);
      setCapturingId(null);
      setConflict(null);
    },
    [shortcuts, updateShortcut, capturingId],
  );

  const handleReset = useCallback(
    (actionId) => {
      resetShortcut(actionId);
      setCapturingId(null);
      setConflict(null);
    },
    [resetShortcut],
  );

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
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("settingsKeybindingsDesc")}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60">
                      {t("clickToRebind")}
                    </p>
                  </div>

                  {capturingId && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded bg-primary/10 border border-primary/30 text-xs text-primary animate-pulse">
                      {conflict ? (
                        <>
                          <span>{t("shortcutConflict")}</span>
                          <code className="font-mono bg-muted px-1 rounded">
                            {t(
                              `shortcut${conflict.charAt(0).toUpperCase() + conflict.slice(1)}`,
                            )}
                          </code>
                        </>
                      ) : (
                        t("capturingShortcut")
                      )}
                    </div>
                  )}

                  <div className="rounded-md border bg-card/50 px-3">
                    {SHORTCUTS.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center gap-2"
                      >
                        <div className="flex-1">
                          <KeybindingRow
                            shortcut={shortcut}
                            currentKeys={getKeys(shortcut.id)}
                            onCapture={handleCapture}
                            isCapturing={capturingId === shortcut.id}
                          />
                        </div>
                        {!shortcutsEqual(
                          getKeys(shortcut.id),
                          DEFAULT_SHORTCUTS[shortcut.id],
                        ) && (
                          <button
                            type="button"
                            onClick={() => handleReset(shortcut.id)}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                            title={t("resetShortcut")}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        )}
                      </div>
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
