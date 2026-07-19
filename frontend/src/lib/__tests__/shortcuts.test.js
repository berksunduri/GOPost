import { describe, it, expect } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUTS,
  formatShortcut,
  matchShortcut,
  keysFromEvent,
  shortcutsEqual,
} from "../shortcuts.js";

describe("shortcuts", () => {
  it("exposes defaults and display list", () => {
    expect(DEFAULT_SHORTCUTS.send).toEqual(["mod", "Enter"]);
    expect(SHORTCUTS.some((s) => s.id === "send")).toBe(true);
  });

  it("formatShortcut joins keys", () => {
    const formatted = formatShortcut(["mod", "s"]);
    expect(formatted.toLowerCase()).toMatch(/s/);
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("matchShortcut requires exact modifiers", () => {
    const event = {
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      key: "Enter",
    };
    // On non-Mac jsdom, mod = ctrl
    expect(matchShortcut(event, ["mod", "Enter"])).toBe(true);
    expect(matchShortcut(event, ["mod", "shift", "Enter"])).toBe(false);
  });

  it("keysFromEvent builds canonical array", () => {
    const keys = keysFromEvent({
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      key: "Tab",
    });
    expect(keys).toContain("mod");
    expect(keys).toContain("shift");
    expect(keys).toContain("Tab");
  });

  it("shortcutsEqual compares arrays", () => {
    expect(shortcutsEqual(["mod", "s"], ["mod", "s"])).toBe(true);
    expect(shortcutsEqual(["mod", "s"], ["mod", "S"])).toBe(false);
    expect(shortcutsEqual(null, ["mod"])).toBe(false);
  });
});
