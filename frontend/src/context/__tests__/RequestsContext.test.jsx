import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useRequests } from "../RequestsContext.jsx";
import { WithRequests } from "../../test/providers.jsx";

vi.mock("@/bridge", () => ({ getAppService: () => null }));

vi.mock("@/api", () => ({
  api: {
    GetRequestsForCollection: vi.fn(),
    CreateRequest: vi.fn(),
    DeleteRequest: vi.fn(),
    SearchRequests: vi.fn(),
  },
}));

import { api } from "@/api";

const wrapper = ({ children }) => <WithRequests>{children}</WithRequests>;

const makeRequest = (id, collectionId = "col1") => ({
  id,
  name: `Request ${id}`,
  method: "GET",
  url: "https://example.com",
  collection_id: collectionId,
});

describe("RequestsContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.GetRequestsForCollection.mockResolvedValue([]);
    api.CreateRequest.mockResolvedValue({ id: "new-req" });
    api.DeleteRequest.mockResolvedValue({});
    api.SearchRequests.mockResolvedValue([]);
  });

  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useRequests())).toThrow(
      "useRequests must be used within RequestsProvider",
    );
  });

  it("initializes with empty state", () => {
    const { result } = renderHook(() => useRequests(), { wrapper });
    expect(result.current.requests).toEqual([]);
    expect(result.current.selectedRequest).toBeNull();
    expect(result.current.selectedRequestId).toBeNull();
    expect(result.current.activeCollectionId).toBeNull();
  });

  it("loadRequests fetches and stores requests for collection", async () => {
    const reqs = [makeRequest("r1"), makeRequest("r2")];
    api.GetRequestsForCollection.mockResolvedValue(reqs);

    const { result } = renderHook(() => useRequests(), { wrapper });

    await act(async () => {
      await result.current.loadRequests("col1");
    });

    expect(api.GetRequestsForCollection).toHaveBeenCalledWith("col1");
    expect(result.current.getRequestsForCollection("col1")).toEqual(reqs);
  });

  it("loadRequests handles null result", async () => {
    api.GetRequestsForCollection.mockResolvedValue(null);

    const { result } = renderHook(() => useRequests(), { wrapper });

    await act(async () => {
      await result.current.loadRequests("col1");
    });

    expect(result.current.getRequestsForCollection("col1")).toEqual([]);
  });

  it("setActiveCollectionId + loadRequests sets requests as active", async () => {
    const reqs = [makeRequest("r1")];
    api.GetRequestsForCollection.mockResolvedValue(reqs);

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setActiveCollectionId("col1"); });

    await act(async () => {
      await result.current.loadRequests("col1");
    });

    expect(result.current.requests).toEqual(reqs);
  });

  it("selectedRequest returns the right request after setSelectedRequestId", async () => {
    const reqs = [makeRequest("r1"), makeRequest("r2")];
    api.GetRequestsForCollection.mockResolvedValue(reqs);

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setActiveCollectionId("col1"); });
    await act(async () => {
      await result.current.loadRequests("col1");
    });

    act(() => { result.current.setSelectedRequestId("r2"); });

    expect(result.current.selectedRequest).toEqual(reqs[1]);
    expect(result.current.selectedRequestId).toBe("r2");
  });

  it("setSelectedRequest by object", async () => {
    const reqs = [makeRequest("r1")];
    api.GetRequestsForCollection.mockResolvedValue(reqs);

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setActiveCollectionId("col1"); });
    await act(async () => {
      await result.current.loadRequests("col1");
    });

    act(() => { result.current.setSelectedRequest(reqs[0]); });

    expect(result.current.selectedRequestId).toBe("r1");
  });

  it("setVirtualRequest overrides selectedRequest", async () => {
    const virtual = { id: "virt", name: "Virtual", method: "POST", url: "http://new" };

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setVirtualRequest(virtual); });

    expect(result.current.selectedRequest).toEqual(virtual);
  });

  it("clearRequests resets all state", async () => {
    const reqs = [makeRequest("r1")];
    api.GetRequestsForCollection.mockResolvedValue(reqs);

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setActiveCollectionId("col1"); });
    await act(async () => {
      await result.current.loadRequests("col1");
    });
    act(() => { result.current.setSelectedRequestId("r1"); });

    act(() => { result.current.clearRequests(); });

    expect(result.current.requests).toEqual([]);
    expect(result.current.selectedRequestId).toBeNull();
    expect(result.current.activeCollectionId).toBeNull();
  });

  it("removeRequestsForCollection removes only that collection", async () => {
    api.GetRequestsForCollection
      .mockResolvedValueOnce([makeRequest("r1", "col1")])
      .mockResolvedValueOnce([makeRequest("r2", "col2")]);

    const { result } = renderHook(() => useRequests(), { wrapper });

    await act(async () => {
      await result.current.loadRequests("col1");
      await result.current.loadRequests("col2");
    });

    act(() => { result.current.removeRequestsForCollection("col1"); });

    expect(result.current.getRequestsForCollection("col1")).toBeNull();
    expect(result.current.getRequestsForCollection("col2")).toHaveLength(1);
  });

  it("deleteRequest calls API and reloads", async () => {
    const reqs = [makeRequest("r1")];
    api.GetRequestsForCollection
      .mockResolvedValueOnce(reqs)
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setActiveCollectionId("col1"); });
    await act(async () => {
      await result.current.loadRequests("col1");
    });

    await act(async () => {
      await result.current.deleteRequest("r1", "col1");
    });

    expect(api.DeleteRequest).toHaveBeenCalledWith("r1");
    expect(result.current.requests).toHaveLength(0);
  });

  it("deleteRequest clears selectedRequestId when deleting selected", async () => {
    const reqs = [makeRequest("r1")];
    api.GetRequestsForCollection
      .mockResolvedValueOnce(reqs)
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setActiveCollectionId("col1"); });
    await act(async () => {
      await result.current.loadRequests("col1");
    });
    act(() => { result.current.setSelectedRequestId("r1"); });

    await act(async () => {
      await result.current.deleteRequest("r1", "col1");
    });

    expect(result.current.selectedRequestId).toBeNull();
  });

  it("searchRequests sets searchResults and clears activeCollectionId", async () => {
    const searchResult = [makeRequest("s1", "col1"), makeRequest("s2", "col2")];
    api.SearchRequests.mockResolvedValue(searchResult);

    const { result } = renderHook(() => useRequests(), { wrapper });

    act(() => { result.current.setActiveCollectionId("col1"); });

    // Must set searchQuery in AppStatusContext — here we test indirectly
    // The context depends on searchQuery from AppStatusContext (defaults to "")
    await act(async () => {
      await result.current.searchRequests();
    });

    expect(api.SearchRequests).toHaveBeenCalled();
    expect(result.current.requests).toEqual(searchResult);
    expect(result.current.activeCollectionId).toBeNull();
  });

  it("createRequestInCollection calls API and reloads", async () => {
    const newReq = makeRequest("new-req");
    api.CreateRequest.mockResolvedValue(newReq);
    api.GetRequestsForCollection
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newReq]);

    const { result } = renderHook(() => useRequests(), { wrapper });

    let created;
    await act(async () => {
      created = await result.current.createRequestInCollection("col1");
    });

    expect(api.CreateRequest).toHaveBeenCalledWith(
      "col1",
      "New Request",
      "GET",
      "https://api.example.com",
      {},
      "",
      "",
    );
    expect(created).toEqual(newReq);
  });

  it("getRequestsForCollection returns null for unknown collection", () => {
    const { result } = renderHook(() => useRequests(), { wrapper });
    expect(result.current.getRequestsForCollection("unknown")).toBeNull();
  });

  it("loadRequests does nothing if collectionId is falsy", async () => {
    const { result } = renderHook(() => useRequests(), { wrapper });

    await act(async () => {
      await result.current.loadRequests(null);
    });

    expect(api.GetRequestsForCollection).not.toHaveBeenCalled();
  });
});
