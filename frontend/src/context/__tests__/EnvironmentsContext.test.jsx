import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useEnvironments } from "../EnvironmentsContext.jsx";
import { WithEnvironments } from "../../test/providers.jsx";

vi.mock("@/bridge", () => ({ getAppService: () => null }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("@/api", () => ({
  api: {
    GetEnvironments: vi.fn(),
    CreateEnvironment: vi.fn(),
    DeleteEnvironment: vi.fn(),
    UpdateEnvironment: vi.fn(),
  },
}));

import { api } from "@/api";
import { toast } from "sonner";

const wrapper = ({ children }) => <WithEnvironments>{children}</WithEnvironments>;

describe("EnvironmentsContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.GetEnvironments.mockResolvedValue([]);
    api.CreateEnvironment.mockResolvedValue({});
    api.DeleteEnvironment.mockResolvedValue({});
    api.UpdateEnvironment.mockResolvedValue({});
  });

  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useEnvironments())).toThrow(
      "useEnvironments must be used within EnvironmentsProvider",
    );
  });

  it("initializes with empty environments", () => {
    const { result } = renderHook(() => useEnvironments(), { wrapper });
    expect(result.current.environments).toEqual([]);
    expect(result.current.selectedEnvironmentId).toBeNull();
    expect(result.current.selectedEnvironment).toBeNull();
  });

  it("loadEnvironments fetches and sets environments", async () => {
    const envs = [
      { id: "e1", name: "Dev", variables: { host: "localhost" } },
      { id: "e2", name: "Prod", variables: { host: "prod.example.com" } },
    ];
    api.GetEnvironments.mockResolvedValue(envs);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    expect(result.current.environments).toEqual(envs);
  });

  it("loadEnvironments handles null result", async () => {
    api.GetEnvironments.mockResolvedValue(null);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    expect(result.current.environments).toEqual([]);
  });

  it("selectedEnvironment reflects selectedEnvironmentId", async () => {
    const envs = [
      { id: "e1", name: "Dev", variables: {} },
      { id: "e2", name: "Prod", variables: {} },
    ];
    api.GetEnvironments.mockResolvedValue(envs);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    act(() => {
      result.current.setSelectedEnvironmentId("e1");
    });

    expect(result.current.selectedEnvironment).toEqual(envs[0]);
    expect(result.current.selectedEnvironmentId).toBe("e1");
  });

  it("setSelectedEnvironmentId to null clears selected", async () => {
    const envs = [{ id: "e1", name: "Dev", variables: {} }];
    api.GetEnvironments.mockResolvedValue(envs);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    act(() => {
      result.current.setSelectedEnvironmentId("e1");
    });
    act(() => {
      result.current.setSelectedEnvironmentId(null);
    });

    expect(result.current.selectedEnvironment).toBeNull();
  });

  it("selectEnvironment shows diff toast when variables differ", async () => {
    const envs = [
      { id: "e1", name: "Dev", variables: { host: "localhost", port: "3000" } },
      { id: "e2", name: "Prod", variables: { host: "prod.example.com", port: "443" } },
    ];
    api.GetEnvironments.mockResolvedValue(envs);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    act(() => {
      result.current.setSelectedEnvironmentId("e1");
    });
    act(() => {
      result.current.setSelectedEnvironmentId("e2");
    });

    expect(toast).toHaveBeenCalled();
    const toastMsg = toast.mock.calls[0][0];
    expect(toastMsg).toContain("Switched to Prod");
  });

  it("selectEnvironment shows no-changes toast when variables are identical", async () => {
    const vars = { host: "same.example.com" };
    const envs = [
      { id: "e1", name: "Env1", variables: vars },
      { id: "e2", name: "Env2", variables: { ...vars } },
    ];
    api.GetEnvironments.mockResolvedValue(envs);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    act(() => { result.current.setSelectedEnvironmentId("e1"); });
    act(() => { result.current.setSelectedEnvironmentId("e2"); });

    expect(toast).toHaveBeenCalledWith("Switched to Env2 (no changes)");
  });

  it("createEnvironment calls API and reloads", async () => {
    api.GetEnvironments
      .mockResolvedValueOnce([{ id: "e1", name: "Staging", variables: {} }]);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.createEnvironment("Staging");
    });

    expect(api.CreateEnvironment).toHaveBeenCalledWith("Staging", {});
    expect(result.current.environments).toHaveLength(1);
  });

  it("deleteEnvironment calls API and reloads", async () => {
    const envs = [{ id: "e1", name: "Dev", variables: {} }];
    api.GetEnvironments
      .mockResolvedValueOnce(envs)
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    await act(async () => {
      await result.current.deleteEnvironment("e1");
    });

    expect(api.DeleteEnvironment).toHaveBeenCalledWith("e1");
    expect(result.current.environments).toHaveLength(0);
  });

  it("deleteEnvironment clears selected if it was the deleted one", async () => {
    const envs = [{ id: "e1", name: "Dev", variables: {} }];
    api.GetEnvironments
      .mockResolvedValueOnce(envs)
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    act(() => { result.current.setSelectedEnvironmentId("e1"); });
    expect(result.current.selectedEnvironmentId).toBe("e1");

    await act(async () => {
      await result.current.deleteEnvironment("e1");
    });

    expect(result.current.selectedEnvironmentId).toBeNull();
  });

  it("deleteEnvironment keeps selected if a different one was deleted", async () => {
    const envs = [
      { id: "e1", name: "Dev", variables: {} },
      { id: "e2", name: "Prod", variables: {} },
    ];
    api.GetEnvironments
      .mockResolvedValueOnce(envs)
      .mockResolvedValueOnce([{ id: "e1", name: "Dev", variables: {} }]);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    act(() => { result.current.setSelectedEnvironmentId("e1"); });

    await act(async () => {
      await result.current.deleteEnvironment("e2");
    });

    expect(result.current.selectedEnvironmentId).toBe("e1");
  });

  it("updateEnvironment calls API and reloads", async () => {
    const updated = { id: "e1", name: "Dev Updated", variables: { host: "newhost" } };
    api.GetEnvironments
      .mockResolvedValueOnce([{ id: "e1", name: "Dev", variables: {} }])
      .mockResolvedValueOnce([updated]);

    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await act(async () => {
      await result.current.loadEnvironments();
    });

    await act(async () => {
      await result.current.updateEnvironment("e1", "Dev Updated", { host: "newhost" });
    });

    expect(api.UpdateEnvironment).toHaveBeenCalledWith("e1", "Dev Updated", { host: "newhost" });
    expect(result.current.environments[0].name).toBe("Dev Updated");
  });
});
