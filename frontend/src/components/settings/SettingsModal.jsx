import React, { useEffect, useState, useCallback } from "react";
import { useTheme, COLOR_VARS } from "@/context/ThemeContext";
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
import {
  Palette,
  Keyboard,
  FolderOpen,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { t } from "@/i18n";
import { api } from "@/api";
import { useCollections } from "@/context/CollectionsContext";
import { useEnvironments } from "@/context/EnvironmentsContext";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUTS,
  formatShortcut,
  keysFromEvent,
  shortcutsEqual,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

// ── HSL ↔ Hex conversion helpers ──────────────────────────────────────────

/** Parse an HSL string like "215 21% 11%" into [h, s, l] numbers. */
function parseHSL(hsl) {
  const parts = hsl?.trim().split(/\s+/);
  if (!parts || parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if (isNaN(h) || isNaN(s) || isNaN(l)) return null;
  return [h, s, l];
}

/** Convert [h, s%, l%] to a hex color string. */
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Convert a hex color (e.g. "#1e2a3b") to HSL [h, s%, l%]. */
function hexToHSL(hex) {
  let r, g, b;
  if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16) / 255;
    g = parseInt(hex.slice(3, 5), 16) / 255;
    b = parseInt(hex.slice(5, 7), 16) / 255;
  } else if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16) / 255;
    g = parseInt(hex[2] + hex[2], 16) / 255;
    b = parseInt(hex[3] + hex[3], 16) / 255;
  } else {
    return null;
  }
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Get the computed HSL value of a CSS variable from the current theme. */
function getCurrentHSL(varName) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return raw || null;
}

// ── Color picker row component ─────────────────────────────────────────────

function ColorRow({ varKey, label, value, onChange, onReset }) {
  const hsl = value ? parseHSL(value) : null;
  const hex = hsl ? hslToHex(hsl[0], hsl[1], hsl[2]) : "#000000";
  const isCustom = value !== undefined && value !== "";

  const handleHexChange = (e) => {
    const newHex = e.target.value;
    const newHsl = hexToHSL(newHex);
    if (newHsl) {
      onChange(varKey, `${newHsl[0]} ${newHsl[1]}% ${newHsl[2]}%`);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0",
        isCustom && "bg-primary/5 -mx-2 px-2 rounded",
      )}
    >
      <div className="relative shrink-0">
        <input
          type="color"
          value={hex}
          onChange={handleHexChange}
          className="w-7 h-7 rounded border border-border cursor-pointer p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0"
          title={label}
        />
      </div>
      <span className="text-xs flex-1 truncate">{label}</span>
      <code
        className={cn(
          "text-[11px] font-mono shrink-0",
          isCustom ? "text-primary" : "text-muted-foreground",
        )}
      >
        {value || (hsl ? `${hsl[0]} ${hsl[1]}% ${hsl[2]}%` : "—")}
      </code>
      {isCustom && (
        <button
          type="button"
          onClick={() => onReset(varKey)}
          className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
          title={t("resetShortcut")}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Settings modal ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "appearance", labelKey: "settingsAppearance", icon: Palette },
  { id: "workspace", labelKey: "settingsWorkspace", icon: FolderOpen },
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
  const { themeId, setThemeId, themeList, customColors, setCustomColors } =
    useTheme();
  const { shortcuts, updateShortcut, resetShortcut } = useUserConfig();
  const { loadCollections, selectedCollectionId } = useCollections();
  const { loadEnvironments, environments, selectedEnvironmentId } =
    useEnvironments();
  const [section, setSection] = useState(defaultSection);
  const [capturingId, setCapturingId] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [colorGroupOpen, setColorGroupOpen] = useState({});
  const [workspacePath, setWorkspacePath] = useState("");
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [ciCopied, setCiCopied] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSection(defaultSection);
      setCapturingId(null);
      setConflict(null);
      setWorkspaceStatus("");
      setCiCopied(false);
      api.GetStorageInfo().then((info) => {
        const base = info?.base_dir || "";
        setWorkspacePath(base);
        setWorkspaceInput(base);
      });
    }
  }

  const getKeys = useCallback(
    (id) => shortcuts[id] ?? DEFAULT_SHORTCUTS[id] ?? [],
    [shortcuts],
  );

  const openWorkspace = useCallback(async () => {
    const path = workspaceInput.trim();
    if (!path) return;
    try {
      const info = await api.SetWorkspaceDir(path);
      const base = info?.base_dir || path;
      setWorkspacePath(base);
      setWorkspaceInput(base);
      setWorkspaceStatus(t("importSuccess"));
      await Promise.all([loadCollections(), loadEnvironments()]);
    } catch (err) {
      setWorkspaceStatus(err?.message || t("importFailed"));
    }
  }, [workspaceInput, loadCollections, loadEnvironments]);

  const revealWorkspace = useCallback(async () => {
    try {
      await api.RevealWorkspace();
    } catch (err) {
      setWorkspaceStatus(err?.message || t("importFailed"));
    }
  }, []);

  const copyCICommand = useCallback(async () => {
    const env = environments.find((e) => e.id === selectedEnvironmentId);
    try {
      const cmd = await api.BuildCICommand(
        selectedCollectionId || "",
        env?.name || "",
      );
      await navigator.clipboard.writeText(cmd);
      setCiCopied(true);
    } catch (err) {
      setWorkspaceStatus(err?.message || t("importFailed"));
    }
  }, [selectedCollectionId, selectedEnvironmentId, environments]);

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

  const handleColorChange = useCallback(
    (varKey, hslValue) => {
      setCustomColors((prev) => ({ ...prev, [varKey]: hslValue }));
    },
    [setCustomColors],
  );

  const handleColorReset = useCallback(
    (varKey) => {
      setCustomColors((prev) => {
        const next = { ...prev };
        delete next[varKey];
        return next;
      });
    },
    [setCustomColors],
  );

  const handleResetAllColors = useCallback(() => {
    setCustomColors({});
  }, [setCustomColors]);

  const toggleColorGroup = useCallback((group) => {
    setColorGroupOpen((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

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

                  {/* Custom color editor */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold">
                        Customize Colors
                      </Label>
                      {Object.keys(customColors).length > 0 && (
                        <button
                          type="button"
                          onClick={handleResetAllColors}
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Reset all
                        </button>
                      )}
                    </div>
                    <div className="rounded-md border bg-card/50 px-3 py-1">
                      {COLOR_VARS.map(({ group, vars }) => {
                        const isOpen = colorGroupOpen[group] !== false; // default open
                        return (
                          <div key={group}>
                            <button
                              type="button"
                              onClick={() => toggleColorGroup(group)}
                              className="flex items-center gap-2 w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              {group}
                            </button>
                            {isOpen && (
                              <div className="pb-1">
                                {vars.map(({ key, label }) => (
                                  <ColorRow
                                    key={key}
                                    varKey={key}
                                    label={label}
                                    value={customColors[key]}
                                    onChange={handleColorChange}
                                    onReset={handleColorReset}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {section === "workspace" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold mb-1">
                      {t("settingsWorkspace")}
                    </h2>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t("settingsWorkspaceDesc")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workspace-path" className="text-xs">
                      {t("settingsWorkspacePath")}
                    </Label>
                    <input
                      id="workspace-path"
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm font-mono"
                      value={workspaceInput}
                      placeholder={t("settingsWorkspacePlaceholder")}
                      onChange={(e) => setWorkspaceInput(e.target.value)}
                    />
                    {workspacePath && (
                      <p className="text-[11px] text-muted-foreground font-mono break-all">
                        {workspacePath}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openWorkspace}
                      className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs"
                    >
                      {t("settingsWorkspaceOpen")}
                    </button>
                    <button
                      type="button"
                      onClick={revealWorkspace}
                      className="h-8 px-3 rounded-md border text-xs"
                    >
                      {t("settingsWorkspaceReveal")}
                    </button>
                    <button
                      type="button"
                      onClick={copyCICommand}
                      className="h-8 px-3 rounded-md border text-xs"
                    >
                      {ciCopied
                        ? t("settingsWorkspaceCopied")
                        : t("settingsWorkspaceCopyCI")}
                    </button>
                  </div>
                  {workspaceStatus && (
                    <p className="text-xs text-muted-foreground">
                      {workspaceStatus}
                    </p>
                  )}
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
