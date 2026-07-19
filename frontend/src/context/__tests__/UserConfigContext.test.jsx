import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { UserConfigProvider, useUserConfig } from "../UserConfigContext.jsx";

vi.mock("@/bridge", () => ({ getAppService: () => null }));
vi.mock("@/api", () => ({
  api: {
    GetUserConfig: vi.fn(),
    SaveUserConfig: vi.fn(),
  },
}));

import { api } from "@/api";

const wrapper = ({ children }) => (
  <UserConfigProvider>{children}</UserConfigProvider>
);

describe("UserConfigContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.GetUserConfig.mockResolvedValue({
      theme_id: "dracula",
      shortcuts: { send: ["mod", "Enter"] },
      custom_colors: { "--primary": "210 100% 50%" },
    });
    api.SaveUserConfig.mockResolvedValue({});
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useUserConfig())).toThrow(
      /UserConfigProvider/,
    );
  });

  it("loads config from api", async () => {
    const { result } = renderHook(() => useUserConfig(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.themeId).toBe("dracula");
    expect(result.current.customColors["--primary"]).toBe("210 100% 50%");
  });

  it("updateShortcut and resetShortcut mutate shortcuts", async () => {
    const { result } = renderHook(() => useUserConfig(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.updateShortcut("search", ["mod", "k"]);
    });
    expect(result.current.shortcuts.search).toEqual(["mod", "k"]);

    act(() => {
      result.current.resetShortcut("search");
    });
    expect(result.current.shortcuts.search).toEqual(["mod", "f"]);
  });

  it("falls back when GetUserConfig fails", async () => {
    api.GetUserConfig.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useUserConfig(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.themeId).toBe("github-dark");
  });
});
