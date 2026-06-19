import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { HistoryProvider, useHistory } from "../HistoryContext.jsx";
import { WithHistory } from "../../test/providers.jsx";

vi.mock("@/bridge", () => ({ getAppService: () => null }));

vi.mock("@/api", () => ({
  api: {
    GetHistory: vi.fn(),
    ReplayHistoryEntry: vi.fn(),
  },
}));

import { api } from "@/api";

const wrapper = ({ children }) => <WithHistory>{children}</WithHistory>;

describe("HistoryContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.GetHistory.mockResolvedValue([]);
    api.ReplayHistoryEntry.mockResolvedValue({});
  });

  it("throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useHistory());
    }).toThrow("useHistory must be used within HistoryProvider");
  });

  it("initializes with empty history", () => {
    const { result } = renderHook(() => useHistory(), { wrapper });
    expect(result.current.history).toEqual([]);
  });

  it("loadHistory fetches and sets history", async () => {
    const entries = [
      { id: "h1", method: "GET", url: "https://example.com", status: 200 },
      { id: "h2", method: "POST", url: "https://example.com/users", status: 201 },
    ];
    api.GetHistory.mockResolvedValue(entries);

    const { result } = renderHook(() => useHistory(), { wrapper });

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(api.GetHistory).toHaveBeenCalledTimes(1);
    expect(result.current.history).toEqual(entries);
  });

  it("loadHistory handles empty result", async () => {
    api.GetHistory.mockResolvedValue(null);

    const { result } = renderHook(() => useHistory(), { wrapper });

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.history).toEqual([]);
  });

  it("loadHistory handles API error gracefully", async () => {
    api.GetHistory.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useHistory(), { wrapper });

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.history).toEqual([]);
  });

  it("replayHistoryEntry calls API and reloads history", async () => {
    const initial = [{ id: "h1", method: "GET", url: "https://example.com" }];
    const afterReplay = [
      { id: "h2", method: "GET", url: "https://example.com" },
      { id: "h1", method: "GET", url: "https://example.com" },
    ];

    api.GetHistory
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(afterReplay);

    const { result } = renderHook(() => useHistory(), { wrapper });

    await act(async () => {
      await result.current.loadHistory();
    });
    expect(result.current.history).toEqual(initial);

    await act(async () => {
      await result.current.replayHistoryEntry("h1");
    });

    expect(api.ReplayHistoryEntry).toHaveBeenCalledWith("h1");
    expect(result.current.history).toEqual(afterReplay);
  });

  it("exposes loadHistory and replayHistoryEntry functions", () => {
    const { result } = renderHook(() => useHistory(), { wrapper });
    expect(typeof result.current.loadHistory).toBe("function");
    expect(typeof result.current.replayHistoryEntry).toBe("function");
  });
});
