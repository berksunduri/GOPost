const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export const SHORTCUTS = [
  { id: "send", actionKey: "shortcutSend", keys: ["mod", "Enter"] },
  { id: "save", actionKey: "shortcutSave", keys: ["mod", "s"] },
  { id: "newTab", actionKey: "shortcutNewTab", keys: ["mod", "n"] },
  { id: "closeTab", actionKey: "shortcutCloseTab", keys: ["mod", "w"] },
  { id: "nextTab", actionKey: "shortcutNextTab", keys: ["mod", "Tab"] },
  {
    id: "prevTab",
    actionKey: "shortcutPrevTab",
    keys: ["mod", "shift", "Tab"],
  },
  { id: "search", actionKey: "shortcutSearch", keys: ["mod", "f"] },
  { id: "import", actionKey: "shortcutImport", keys: ["mod", "i"] },
  { id: "settings", actionKey: "shortcutSettings", keys: ["mod", ","] },
  { id: "shortcuts", actionKey: "shortcutShowShortcuts", keys: ["?"] },
];

const KEY_LABELS = {
  mod: isMac ? "⌘" : "Ctrl",
  shift: isMac ? "⇧" : "Shift",
  Enter: "Enter",
  Tab: "Tab",
  "?": "?",
  ",": ",",
};

export function formatShortcut(keys) {
  return keys
    .map((key) => {
      if (KEY_LABELS[key]) return KEY_LABELS[key];
      return key.length === 1 ? key.toUpperCase() : key;
    })
    .join(isMac ? "" : "+");
}
