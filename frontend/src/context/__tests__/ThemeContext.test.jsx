import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme, THEMES, COLOR_VARS } from "../ThemeContext.jsx";
import { UserConfigProvider } from "../UserConfigContext.jsx";

vi.mock("@/bridge", () => ({ getAppService: () => null }));
vi.mock("@/api", () => ({
  api: {
    GetUserConfig: vi.fn().mockResolvedValue({ theme_id: "github-dark" }),
    SaveUserConfig: vi.fn().mockResolvedValue({}),
  },
}));

const wrapper = ({ children }) => (
  <UserConfigProvider>
    <ThemeProvider>{children}</ThemeProvider>
  </UserConfigProvider>
);

describe("ThemeContext", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });

  it("exposes theme list and applies CSS variables", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.themeId).toBe("github-dark"));
    expect(result.current.themeList.length).toBe(Object.keys(THEMES).length);
    expect(COLOR_VARS.length).toBeGreaterThan(0);
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).not.toBe("");
  });

  it("setThemeId switches theme", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.themeId).toBe("github-dark"));
    act(() => {
      result.current.setThemeId("dracula");
    });
    expect(result.current.themeId).toBe("dracula");
    expect(result.current.theme.name).toBe("Dracula");
  });
});
