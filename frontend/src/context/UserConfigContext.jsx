import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { api } from "@/api";
import { DEFAULT_SHORTCUTS } from "@/lib/shortcuts";

const UserConfigContext = createContext(null);

/** Load user config from backend. Falls back to defaults. */
async function loadConfig() {
  try {
    const cfg = await api.GetUserConfig();
    return {
      themeId: cfg?.theme_id || "github-dark",
      shortcuts: {
        ...DEFAULT_SHORTCUTS,
        ...(cfg?.shortcuts || {}),
      },
      customColors: cfg?.custom_colors || {},
    };
  } catch {
    return {
      themeId: "github-dark",
      shortcuts: { ...DEFAULT_SHORTCUTS },
      customColors: {},
    };
  }
}

/** Persist config to backend. Returns true on success. */
async function persistConfig(themeId, shortcuts, customColors) {
  try {
    await api.SaveUserConfig({
      theme_id: themeId,
      shortcuts,
      custom_colors: customColors,
    });
    return true;
  } catch {
    return false;
  }
}

export function UserConfigProvider({ children }) {
  const [themeId, setThemeId] = useState("github-dark");
  const [shortcuts, setShortcuts] = useState({ ...DEFAULT_SHORTCUTS });
  const [customColors, setCustomColors] = useState({});
  const [loaded, setLoaded] = useState(false);
  const themeRef = useRef(themeId);
  const shortcutsRef = useRef(shortcuts);
  const colorsRef = useRef(customColors);

  // Load config on mount
  useEffect(() => {
    let cancelled = false;
    loadConfig().then((cfg) => {
      if (cancelled) return;
      setThemeId(cfg.themeId);
      setShortcuts(cfg.shortcuts);
      setCustomColors(cfg.customColors);
      themeRef.current = cfg.themeId;
      shortcutsRef.current = cfg.shortcuts;
      colorsRef.current = cfg.customColors;
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist theme changes
  useEffect(() => {
    if (!loaded) return;
    themeRef.current = themeId;
    persistConfig(themeId, shortcutsRef.current, colorsRef.current);
  }, [themeId, loaded]);

  // Persist shortcut changes (debounced)
  useEffect(() => {
    if (!loaded) return;
    shortcutsRef.current = shortcuts;
    const timer = setTimeout(() => {
      persistConfig(themeRef.current, shortcuts, colorsRef.current);
    }, 500);
    return () => clearTimeout(timer);
  }, [shortcuts, loaded]);

  // Persist custom color changes (debounced)
  useEffect(() => {
    if (!loaded) return;
    colorsRef.current = customColors;
    const timer = setTimeout(() => {
      persistConfig(themeRef.current, shortcutsRef.current, customColors);
    }, 300);
    return () => clearTimeout(timer);
  }, [customColors, loaded]);

  const updateShortcut = useCallback((actionId, keys) => {
    setShortcuts((prev) => {
      if (keys.length === 0) {
        // Remove custom shortcut → fall back to default
        const next = { ...prev };
        delete next[actionId];
        return next;
      }
      return { ...prev, [actionId]: keys };
    });
  }, []);

  const resetShortcut = useCallback((actionId) => {
    setShortcuts((prev) => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  }, []);

  const value = useMemo(() => {
    // Always merge defaults so reset shortcuts still work
    const resolved = { ...DEFAULT_SHORTCUTS, ...shortcuts };
    return {
      themeId,
      setThemeId,
      shortcuts: resolved,
      updateShortcut,
      resetShortcut,
      customColors,
      setCustomColors,
      loaded,
    };
  }, [themeId, shortcuts, updateShortcut, resetShortcut, customColors, loaded]);

  return (
    <UserConfigContext.Provider value={value}>
      {children}
    </UserConfigContext.Provider>
  );
}

export function useUserConfig() {
  const ctx = useContext(UserConfigContext);
  if (!ctx)
    throw new Error("useUserConfig must be used within UserConfigProvider");
  return ctx;
}
