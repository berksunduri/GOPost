import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useCollections } from "../CollectionsContext.jsx";
import { AllProviders } from "../../test/providers.jsx";

vi.mock("@/bridge", () => ({ getAppService: () => null }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("@/api", () => ({
  api: {
    GetCollections: vi.fn(),
    CreateCollection: vi.fn(),
    DeleteCollection: vi.fn(),
    UpdateCollection: vi.fn(),
    RunCollection: vi.fn(),
    GetRequestsForCollection: vi.fn(),
    GetHistory: vi.fn(),
    GetEnvironments: vi.fn(),
    CreateRequest: vi.fn(),
    DeleteRequest: vi.fn(),
    SearchRequests: vi.fn(),
    ReplayHistoryEntry: vi.fn(),
    CreateEnvironment: vi.fn(),
    DeleteEnvironment: vi.fn(),
    UpdateEnvironment: vi.fn(),
  },
}));

import { api } from "@/api";

const wrapper = ({ children }) => <AllProviders>{children}</AllProviders>;

const makeCollection = (id, name = `Collection ${id}`) => ({ id, name });

describe("CollectionsContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.GetCollections.mockResolvedValue([]);
    api.CreateCollection.mockResolvedValue({});
    api.DeleteCollection.mockResolvedValue({});
    api.UpdateCollection.mockResolvedValue({});
    api.RunCollection.mockResolvedValue({ passed: 2, failed: 0 });
    api.GetRequestsForCollection.mockResolvedValue([]);
    api.GetHistory.mockResolvedValue([]);
    api.GetEnvironments.mockResolvedValue([]);
    api.SearchRequests.mockResolvedValue([]);
    api.ReplayHistoryEntry.mockResolvedValue({});
    api.CreateRequest.mockResolvedValue({});
    api.DeleteRequest.mockResolvedValue({});
    api.CreateEnvironment.mockResolvedValue({});
    api.DeleteEnvironment.mockResolvedValue({});
    api.UpdateEnvironment.mockResolvedValue({});
  });

  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useCollections())).toThrow(
      "useCollections must be used within CollectionsProvider",
    );
  });

  it("initializes with empty collections", () => {
    const { result } = renderHook(() => useCollections(), { wrapper });
    expect(result.current.collections).toEqual([]);
    expect(result.current.selectedCollection).toBeNull();
    expect(result.current.selectedCollectionId).toBeNull();
  });

  it("loadCollections fetches and sets collections", async () => {
    const cols = [makeCollection("c1"), makeCollection("c2")];
    api.GetCollections.mockResolvedValue(cols);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    expect(api.GetCollections).toHaveBeenCalled();
    expect(result.current.collections).toEqual(cols);
  });

  it("loadCollections handles null result", async () => {
    api.GetCollections.mockResolvedValue(null);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    expect(result.current.collections).toEqual([]);
  });

  it("selectedCollection derives from selectedCollectionId", async () => {
    const cols = [makeCollection("c1"), makeCollection("c2")];
    api.GetCollections.mockResolvedValue(cols);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    act(() => {
      result.current.setSelectedCollectionId("c2");
    });

    expect(result.current.selectedCollection).toEqual(cols[1]);
  });

  it("selectCollection sets collection and loads requests", async () => {
    const cols = [makeCollection("c1")];
    const reqs = [{ id: "r1", name: "Req", method: "GET", url: "https://x.com" }];
    api.GetCollections.mockResolvedValue(cols);
    api.GetRequestsForCollection.mockResolvedValue(reqs);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    await act(async () => {
      await result.current.selectCollection(cols[0]);
    });

    expect(result.current.selectedCollectionId).toBe("c1");
    expect(api.GetRequestsForCollection).toHaveBeenCalledWith("c1");
  });

  it("selectCollection with null clears selection and requests", async () => {
    const cols = [makeCollection("c1")];
    api.GetCollections.mockResolvedValue(cols);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    act(() => { result.current.setSelectedCollectionId("c1"); });

    await act(async () => {
      await result.current.selectCollection(null);
    });

    expect(result.current.selectedCollectionId).toBeNull();
  });

  it("createCollection calls API and reloads", async () => {
    const after = [makeCollection("c1", "My Collection")];
    api.GetCollections
      .mockResolvedValueOnce(after);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.createCollection("My Collection");
    });

    expect(api.CreateCollection).toHaveBeenCalledWith("My Collection");
    expect(result.current.collections).toHaveLength(1);
  });

  it("deleteCollection calls API and reloads", async () => {
    const cols = [makeCollection("c1"), makeCollection("c2")];
    api.GetCollections
      .mockResolvedValueOnce(cols)
      .mockResolvedValueOnce([makeCollection("c2")]);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    await act(async () => {
      await result.current.deleteCollection("c1");
    });

    expect(api.DeleteCollection).toHaveBeenCalledWith("c1");
    expect(result.current.collections).toHaveLength(1);
  });

  it("deleteCollection clears selectedCollectionId if it was the deleted one", async () => {
    const cols = [makeCollection("c1")];
    api.GetCollections
      .mockResolvedValueOnce(cols)
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    act(() => { result.current.setSelectedCollectionId("c1"); });

    await act(async () => {
      await result.current.deleteCollection("c1");
    });

    expect(result.current.selectedCollectionId).toBeNull();
  });

  it("deleteCollection keeps selection if a different collection was deleted", async () => {
    const cols = [makeCollection("c1"), makeCollection("c2")];
    api.GetCollections
      .mockResolvedValueOnce(cols)
      .mockResolvedValueOnce([makeCollection("c1")]);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    act(() => { result.current.setSelectedCollectionId("c1"); });

    await act(async () => {
      await result.current.deleteCollection("c2");
    });

    expect(result.current.selectedCollectionId).toBe("c1");
  });

  it("updateCollection calls API and reloads", async () => {
    const cols = [makeCollection("c1")];
    const updated = [makeCollection("c1", "Renamed")];
    api.GetCollections
      .mockResolvedValueOnce(cols)
      .mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    await act(async () => {
      await result.current.updateCollection("c1", "Renamed");
    });

    expect(api.UpdateCollection).toHaveBeenCalledWith("c1", "Renamed");
    expect(result.current.collections[0].name).toBe("Renamed");
  });

  it("runCollection calls RunCollection API with current selectedCollectionId", async () => {
    const cols = [makeCollection("c1")];
    api.GetCollections.mockResolvedValue(cols);

    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.loadCollections();
    });

    act(() => { result.current.setSelectedCollectionId("c1"); });

    await act(async () => {
      await result.current.runCollection();
    });

    expect(api.RunCollection).toHaveBeenCalledWith("c1", false);
  });

  it("runCollection does nothing when no collection is selected", async () => {
    const { result } = renderHook(() => useCollections(), { wrapper });

    await act(async () => {
      await result.current.runCollection();
    });

    expect(api.RunCollection).not.toHaveBeenCalled();
  });
});
