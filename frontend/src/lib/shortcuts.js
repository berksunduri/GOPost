const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/** Default shortcuts — used when user hasn't customized */
export const DEFAULT_SHORTCUTS = {
  send: ["mod", "Enter"],
  save: ["mod", "s"],
  newTab: ["mod", "n"],
  closeTab: ["mod", "w"],
  nextTab: ["mod", "Tab"],
  prevTab: ["mod", "shift", "Tab"],
  search: ["mod", "f"],
  import: ["mod", "i"],
  settings: ["mod", ","],
  shortcuts: ["?"],
};

/** Display version used in the settings UI (read-only reference) */
export const SHORTCUTS = Object.entries(DEFAULT_SHORTCUTS).map(
  ([id, keys]) => ({
    id,
    actionKey: `shortcut${id.charAt(0).toUpperCase() + id.slice(1)}`,
    keys,
  }),
);

const KEY_LABELS = {
  mod: isMac ? "⌘" : "Ctrl",
  shift: isMac ? "⇧" : "Shift",
  alt: isMac ? "⌥" : "Alt",
  Enter: "Enter",
  Tab: "Tab",
  "?": "?",
  ",": ",",
  Escape: "Esc",
};

export function formatShortcut(keys) {
  return keys
    .map((key) => {
      if (KEY_LABELS[key]) return KEY_LABELS[key];
      return key.length === 1 ? key.toUpperCase() : key;
    })
    .join(isMac ? "" : "+");
}

/**
 * Check if a keyboard event matches a shortcut definition.
 * "mod" maps to Ctrl on Windows/Linux and Meta (⌘) on Mac.
 */
export function matchShortcut(event, keys) {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  const shift = event.shiftKey;
  const alt = event.altKey;

  const required = {
    mod: keys.includes("mod"),
    shift: keys.includes("shift"),
    alt: keys.includes("alt"),
  };

  // Modifiers must match exactly
  if (mod !== required.mod) return false;
  if (shift !== required.shift) return false;
  if (alt !== required.alt) return false;

  // The non-modifier key
  const keyPart = keys.find((k) => !["mod", "shift", "alt"].includes(k));
  if (!keyPart) return false;

  // Special keys (Enter, Tab, Escape, etc.) — compare by key name
  if (keyPart.length > 1) {
    return event.key === keyPart;
  }

  // Single character — compare case-insensitively
  return event.key.toLowerCase() === keyPart.toLowerCase();
}

/**
 * Given a KeyboardEvent, produce a canonical keys array like ["mod","Enter"].
 * Used when capturing a new shortcut from user input.
 */
export function keysFromEvent(event) {
  const keys = [];
  if (isMac) {
    if (event.metaKey) keys.push("mod");
  } else {
    if (event.ctrlKey) keys.push("mod");
  }
  if (event.shiftKey) keys.push("shift");
  if (event.altKey) keys.push("alt");

  // The non-modifier key
  const nonModifiers = ["Meta", "Control", "Shift", "Alt"];
  if (!nonModifiers.includes(event.key)) {
    keys.push(event.key === " " ? "Space" : event.key);
  }

  return keys;
}

/**
 * Check if two shortcut arrays are the same.
 */
export function shortcutsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}
