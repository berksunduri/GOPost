import { describe, it, expect, beforeEach, vi } from "vitest";

// We want to test the HTTP fetch fallback path: getAppService() returns null
vi.mock("../../bridge.js", () => ({ getAppService: () => null }));

import { api } from "../../api.js";

function makeFetchMock(body, options = {}) {
  return vi.fn().mockResolvedValue({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("api.js — fetch fallback path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== Collections ====================

  it("GetCollections: GET /api/collections", async () => {
    const data = [{ id: "c1", name: "My API" }];
    vi.stubGlobal("fetch", makeFetchMock(data));

    const result = await api.GetCollections();

    expect(fetch).toHaveBeenCalledWith(
      "/api/collections",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(result).toEqual(data);
  });

  it("CreateCollection: POST /api/collections", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ id: "new", name: "Test" }));

    await api.CreateCollection("Test");

    expect(fetch).toHaveBeenCalledWith(
      "/api/collections",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      }),
    );
  });

  it("DeleteCollection: DELETE /api/collections/:id", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));

    await api.DeleteCollection("c1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("UpdateCollection: PUT /api/collections/:id", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));

    await api.UpdateCollection("c1", "Renamed");

    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/c1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
  });

  // ==================== Environments ====================

  it("GetEnvironments: GET /api/environments", async () => {
    const envs = [{ id: "e1", name: "Dev" }];
    vi.stubGlobal("fetch", makeFetchMock(envs));

    const result = await api.GetEnvironments();
    expect(result).toEqual(envs);
    expect(fetch).toHaveBeenCalledWith("/api/environments", expect.any(Object));
  });

  it("CreateEnvironment: POST /api/environments", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));

    await api.CreateEnvironment("Staging", { host: "staging.example.com" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/environments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Staging", variables: { host: "staging.example.com" } }),
      }),
    );
  });

  it("DeleteEnvironment: DELETE /api/environments/:id", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.DeleteEnvironment("e1");
    expect(fetch).toHaveBeenCalledWith("/api/environments/e1", expect.objectContaining({ method: "DELETE" }));
  });

  it("UpdateEnvironment: PUT /api/environments/:id", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));

    await api.UpdateEnvironment("e1", "Dev Updated", { port: "3000" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/environments/e1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Dev Updated", variables: { port: "3000" } }),
      }),
    );
  });

  // ==================== Requests ====================

  it("GetRequestsForCollection: GET /api/collections/:id/requests", async () => {
    vi.stubGlobal("fetch", makeFetchMock([]));

    await api.GetRequestsForCollection("col1");

    expect(fetch).toHaveBeenCalledWith("/api/collections/col1/requests", expect.any(Object));
  });

  it("CreateRequest: POST /api/collections/:id/requests", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ id: "r1" }));

    await api.CreateRequest("col1", "Test Req", "POST", "https://api.example.com", {}, '{"key":"val"}', "desc");

    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/col1/requests",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"name":"Test Req"'),
      }),
    );
  });

  it("DeleteRequest: DELETE /api/requests/:id", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.DeleteRequest("r1");
    expect(fetch).toHaveBeenCalledWith("/api/requests/r1", expect.objectContaining({ method: "DELETE" }));
  });

  it("SearchRequests: GET /api/requests/search?q=", async () => {
    vi.stubGlobal("fetch", makeFetchMock([]));

    await api.SearchRequests("my query");

    expect(fetch).toHaveBeenCalledWith(
      "/api/requests/search?q=my%20query",
      expect.any(Object),
    );
  });

  it("SearchRequests: encodes empty query", async () => {
    vi.stubGlobal("fetch", makeFetchMock([]));

    await api.SearchRequests("");

    expect(fetch).toHaveBeenCalledWith("/api/requests/search?q=", expect.any(Object));
  });

  it("DuplicateRequest: POST /api/requests/:id/duplicate", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));

    await api.DuplicateRequest("r1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/requests/r1/duplicate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("ExecuteRequest: POST /api/requests/:id/execute", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.ExecuteRequest("r1");
    expect(fetch).toHaveBeenCalledWith("/api/requests/r1/execute", expect.objectContaining({ method: "POST" }));
  });

  it("ExecuteRequestRaw: POST /api/requests/execute-raw", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.ExecuteRequestRaw({ method: "GET", url: "https://example.com" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/requests/execute-raw",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("ExecuteGraphQLRequestRaw: POST /api/requests/execute-graphql-raw", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.ExecuteGraphQLRequestRaw({
      url: "https://example.com/graphql",
      graphql: { query: "{ __typename }" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/requests/execute-graphql-raw",
      expect.objectContaining({ method: "POST" }),
    );
  });
  // ==================== History ====================

  it("GetHistory: GET /api/history", async () => {
    vi.stubGlobal("fetch", makeFetchMock([]));
    await api.GetHistory();
    expect(fetch).toHaveBeenCalledWith("/api/history", expect.any(Object));
  });

  it("ReplayHistoryEntry: POST /api/history/:id/replay", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.ReplayHistoryEntry("h1");
    expect(fetch).toHaveBeenCalledWith("/api/history/h1/replay", expect.objectContaining({ method: "POST" }));
  });

  // ==================== User Config ====================

  it("GetUserConfig: GET /api/user-config", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ theme: "dark" }));
    const result = await api.GetUserConfig();
    expect(result).toEqual({ theme: "dark" });
    expect(fetch).toHaveBeenCalledWith("/api/user-config", expect.any(Object));
  });

  it("SaveUserConfig: PUT /api/user-config", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ ok: true }));
    const cfg = { theme: "light", fontSize: 14 };
    await api.SaveUserConfig(cfg);
    expect(fetch).toHaveBeenCalledWith(
      "/api/user-config",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(cfg),
      }),
    );
  });

  // ==================== Git ====================

  it("GitInit: POST /api/git/:id/init", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.GitInit("col1");
    expect(fetch).toHaveBeenCalledWith("/api/git/col1/init", expect.objectContaining({ method: "POST" }));
  });

  it("GitStatus: GET /api/git/:id/status", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ is_repo: true }));
    await api.GitStatus("col1");
    expect(fetch).toHaveBeenCalledWith("/api/git/col1/status", expect.any(Object));
  });

  it("GitCommit: POST /api/git/:id/commit", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.GitCommit("col1", "add requests");
    expect(fetch).toHaveBeenCalledWith(
      "/api/git/col1/commit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "add requests" }),
      }),
    );
  });

  it("GitLog: GET /api/git/:id/log", async () => {
    vi.stubGlobal("fetch", makeFetchMock([]));
    await api.GitLog("col1");
    expect(fetch).toHaveBeenCalledWith("/api/git/col1/log", expect.any(Object));
  });

  // ==================== WebSocket ====================

  it("ConnectWebSocket: POST /api/ws/connect", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ connId: "ws-1" }));

    await api.ConnectWebSocket("r1", "ws://example.com", { "X-Auth": "tok" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/ws/connect",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ requestId: "r1", url: "ws://example.com", headers: { "X-Auth": "tok" } }),
      }),
    );
  });

  it("GetWebSocketMessages: GET /api/ws/messages?connId=", async () => {
    vi.stubGlobal("fetch", makeFetchMock([]));
    await api.GetWebSocketMessages("ws-1");
    expect(fetch).toHaveBeenCalledWith("/api/ws/messages?connId=ws-1", expect.any(Object));
  });

  // ==================== SSE ====================

  it("ConnectSSE: POST /api/sse/connect", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ connId: "sse-1" }));

    await api.ConnectSSE("r1", "http://example.com/stream", {});

    expect(fetch).toHaveBeenCalledWith(
      "/api/sse/connect",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("GetSSEEvents: GET /api/sse/events?connId=", async () => {
    vi.stubGlobal("fetch", makeFetchMock([]));
    await api.GetSSEEvents("sse-1");
    expect(fetch).toHaveBeenCalledWith("/api/sse/events?connId=sse-1", expect.any(Object));
  });

  // ==================== Error handling ====================

  it("throws when response.ok is false", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ error: "Not Found" }, { ok: false, status: 404 }));

    await expect(api.GetCollections()).rejects.toThrow("Not Found");
  });

  it("throws generic message when error field is missing", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}, { ok: false, status: 500 }));

    await expect(api.GetCollections()).rejects.toThrow("Request failed");
  });

  // ==================== RunCollection ====================

  it("RunCollection: POST /api/collections/:id/run", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ passed: 1, failed: 0 }));

    await api.RunCollection("col1", true);

    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/col1/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ stopOnFail: true }),
      }),
    );
  });

  // ==================== Import / Export ====================

  it("ExportDataContent: GET /api/export-content", async () => {
    vi.stubGlobal("fetch", makeFetchMock({ data: [] }));
    await api.ExportDataContent();
    expect(fetch).toHaveBeenCalledWith("/api/export-content", expect.any(Object));
  });

  it("ImportDataContent: POST /api/import-content", async () => {
    vi.stubGlobal("fetch", makeFetchMock({}));
    await api.ImportDataContent({ collections: [] }, "merge");
    expect(fetch).toHaveBeenCalledWith(
      "/api/import-content",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ data: { collections: [] }, mode: "merge" }),
      }),
    );
  });
});
