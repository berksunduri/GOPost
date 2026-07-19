import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { MockServerProvider, useMockServer } from "../MockServerContext.jsx";

vi.mock("@/bridge", () => ({ getAppService: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n", () => ({
  t: (key) => key,
}));
vi.mock("@/api", () => ({
  api: {
    GetMockStatus: vi.fn(),
    GetMockLog: vi.fn(),
    StartMockServer: vi.fn(),
    StopMockServer: vi.fn(),
    SetMockConfig: vi.fn(),
    RemoveMockConfig: vi.fn(),
    LoadMockConfigs: vi.fn(),
    ClearMockLog: vi.fn(),
  },
}));

import { api } from "@/api";
import { toast } from "sonner";

const wrapper = ({ children }) => (
  <MockServerProvider>{children}</MockServerProvider>
);

describe("MockServerContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.GetMockStatus.mockResolvedValue({
      running: false,
      port: 3001,
      handlers: [],
    });
    api.GetMockLog.mockResolvedValue([]);
    api.StartMockServer.mockResolvedValue({});
    api.StopMockServer.mockResolvedValue({});
    api.SetMockConfig.mockResolvedValue({
      request_id: "r1",
      status_code: 200,
    });
    api.RemoveMockConfig.mockResolvedValue({});
    api.LoadMockConfigs.mockResolvedValue([
      { request_id: "r1", status_code: 201 },
    ]);
    api.ClearMockLog.mockResolvedValue({});
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useMockServer())).toThrow(/mockProviderError/);
  });

  it("start and stop server", async () => {
    const { result } = renderHook(() => useMockServer(), { wrapper });

    await act(async () => {
      await result.current.startServer(3002);
    });
    expect(api.StartMockServer).toHaveBeenCalledWith(3002);
    expect(toast.success).toHaveBeenCalled();

    api.GetMockStatus.mockResolvedValue({
      running: true,
      port: 3002,
      handlers: [],
    });
    await act(async () => {
      await result.current.refreshStatus();
    });
    expect(result.current.status.running).toBe(true);

    await act(async () => {
      await result.current.stopServer();
    });
    expect(api.StopMockServer).toHaveBeenCalled();
  });

  it("setMock removeMock loadMocks clearLog", async () => {
    const { result } = renderHook(() => useMockServer(), { wrapper });

    await act(async () => {
      await result.current.setMock("r1", "GET", "/x", { statusCode: 200 });
    });
    expect(api.SetMockConfig).toHaveBeenCalled();
    expect(result.current.mockConfigs.r1).toBeTruthy();

    await act(async () => {
      await result.current.loadMocks("c1");
    });
    expect(api.LoadMockConfigs).toHaveBeenCalledWith("c1");

    await act(async () => {
      await result.current.removeMock("r1");
    });
    expect(api.RemoveMockConfig).toHaveBeenCalledWith("r1");

    await act(async () => {
      await result.current.clearLog();
    });
    expect(api.ClearMockLog).toHaveBeenCalled();
    expect(result.current.log).toEqual([]);
  });
});
