import { getAppService } from "./bridge";

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data;
}

export const api = {
  async GetCollections() {
    const service = getAppService();
    if (service) return service.GetCollections();
    return fetchJSON("/api/collections");
  },
  async CreateCollection(name) {
    const service = getAppService();
    if (service) return service.CreateCollection(name);
    return fetchJSON("/api/collections", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  async DeleteCollection(id) {
    const service = getAppService();
    if (service) return service.DeleteCollection(id);
    return fetchJSON(`/api/collections/${id}`, { method: "DELETE" });
  },
  async UpdateCollection(id, name) {
    const service = getAppService();
    if (service && typeof service.UpdateCollection === "function")
      return service.UpdateCollection(id, name);
    return fetchJSON(`/api/collections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },
  async GetEnvironments() {
    const service = getAppService();
    if (service) return service.GetEnvironments();
    return fetchJSON("/api/environments");
  },
  async CreateEnvironment(name, variables = {}) {
    const service = getAppService();
    if (service) return service.CreateEnvironment(name, variables);
    return fetchJSON("/api/environments", {
      method: "POST",
      body: JSON.stringify({ name, variables }),
    });
  },
  async DeleteEnvironment(id) {
    const service = getAppService();
    if (service) return service.DeleteEnvironment(id);
    return fetchJSON(`/api/environments/${id}`, { method: "DELETE" });
  },
  async UpdateEnvironment(id, name, variables = {}) {
    const service = getAppService();
    if (service && typeof service.UpdateEnvironment === "function")
      return service.UpdateEnvironment(id, name, variables);
    return fetchJSON(`/api/environments/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, variables }),
    });
  },
  async GetRequestsForCollection(collectionId) {
    const service = getAppService();
    if (service) return service.GetRequestsForCollection(collectionId);
    return fetchJSON(`/api/collections/${collectionId}/requests`);
  },
  async GetRequest(id) {
    const service = getAppService();
    if (service) return service.GetRequest(id);
    return fetchJSON(`/api/requests/${id}`);
  },
  async MoveRequest(id, collectionId) {
    const service = getAppService();
    if (service) return service.MoveRequest(id, collectionId);
    return fetchJSON(`/api/requests/${id}/move`, {
      method: "PUT",
      body: JSON.stringify({ collection_id: collectionId }),
    });
  },
  async SearchRequests(query) {
    const service = getAppService();
    if (service) return service.SearchRequests(query);
    return fetchJSON(
      `/api/requests/search?q=${encodeURIComponent(query || "")}`,
    );
  },
  async DuplicateRequest(requestId) {
    const service = getAppService();
    if (service) return service.DuplicateRequest(requestId);
    return fetchJSON(`/api/requests/${requestId}/duplicate`, {
      method: "POST",
    });
  },
  async DeleteRequest(requestId) {
    const service = getAppService();
    if (service) return service.DeleteRequest(requestId);
    return fetchJSON(`/api/requests/${requestId}`, { method: "DELETE" });
  },
  async ImportHTTPContent(collectionId, content) {
    const service = getAppService();
    if (service && typeof service.ImportHTTPContent === "function")
      return service.ImportHTTPContent(content, collectionId);
    return fetchJSON(`/api/collections/${collectionId}/import-http`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  async ExportCollectionAsHTTPContent(collectionId) {
    const service = getAppService();
    if (service && typeof service.ExportCollectionAsHTTPContent === "function")
      return service.ExportCollectionAsHTTPContent(collectionId);
    return fetchJSON(`/api/collections/${collectionId}/export-http`);
  },
  async ExportCollectionAsHTTPFile(collectionId) {
    const service = getAppService();
    if (service && typeof service.ExportCollectionAsHTTPFile === "function")
      return service.ExportCollectionAsHTTPFile(collectionId);
    return fetchJSON(`/api/collections/${collectionId}/export-http-file`, {
      method: "POST",
    });
  },
  async IntrospectGraphQLSchema(endpointURL) {
    const service = getAppService();
    if (service && typeof service.IntrospectGraphQLSchema === "function")
      return service.IntrospectGraphQLSchema(endpointURL);
    return fetchJSON("/api/graphql/introspect", {
      method: "POST",
      body: JSON.stringify({ url: endpointURL }),
    });
  },
  async GetCachedGraphQLSchema(url) {
    const service = getAppService();
    if (service && typeof service.GetCachedGraphQLSchema === "function")
      return service.GetCachedGraphQLSchema(url);
    return fetchJSON(
      `/api/graphql/schema?url=${encodeURIComponent(url || "")}`,
    );
  },
  async ExecuteGraphQLRequest(id) {
    const service = getAppService();
    if (service && typeof service.ExecuteGraphQLRequest === "function")
      return service.ExecuteGraphQLRequest(id);
    return fetchJSON(`/api/requests/${id}/execute-graphql`, { method: "POST" });
  },
  async SetRequestGraphQL(id, query, variables, operationName, schemaURL) {
    const service = getAppService();
    if (service && typeof service.SetRequestGraphQL === "function")
      return service.SetRequestGraphQL(
        id,
        query,
        variables,
        operationName,
        schemaURL,
      );
    return fetchJSON(`/api/requests/${id}/graphql`, {
      method: "PUT",
      body: JSON.stringify({ query, variables, operationName, schemaURL }),
    });
  },
  async UpdateRequestWithGraphQL(
    id,
    name,
    method,
    url,
    headers,
    body,
    description,
    graphqlQuery,
    graphqlVariables,
    graphqlOperationName,
    graphqlSchemaURL,
  ) {
    const service = getAppService();
    if (service && typeof service.UpdateRequestWithGraphQL === "function")
      return service.UpdateRequestWithGraphQL(
        id,
        name,
        method,
        url,
        headers,
        body,
        description,
        graphqlQuery,
        graphqlVariables,
        graphqlOperationName,
        graphqlSchemaURL,
      );
    return fetchJSON(`/api/requests/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name,
        method,
        url,
        headers,
        body,
        description,
        graphql: {
          query: graphqlQuery,
          variables: graphqlVariables,
          operationName: graphqlOperationName,
          schemaURL: graphqlSchemaURL,
        },
      }),
    });
  },
  async GetHistory() {
    const service = getAppService();
    if (service) return service.GetHistory();
    return fetchJSON("/api/history");
  },
  async GetUserConfig() {
    const service = getAppService();
    if (service) return service.GetUserConfig();
    return fetchJSON("/api/user-config");
  },
  async SaveUserConfig(cfg) {
    const service = getAppService();
    if (service) return service.SaveUserConfig(cfg);
    return fetchJSON("/api/user-config", {
      method: "PUT",
      body: JSON.stringify(cfg),
    });
  },
  async GetRunHistory(collectionID) {
    const service = getAppService();
    if (service) return service.GetRunHistory(collectionID);
    return fetchJSON(`/api/runs/${collectionID}`);
  },
  async ReplayHistoryEntry(entryId) {
    const service = getAppService();
    if (service) return service.ReplayHistoryEntry(entryId);
    return fetchJSON(`/api/history/${entryId}/replay`, { method: "POST" });
  },
  async ImportData(path) {
    const service = getAppService();
    if (service) return service.ImportData(path);
    return fetchJSON("/api/import", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  },
  async ExportData(path) {
    const service = getAppService();
    if (service) return service.ExportData(path);
    return fetchJSON("/api/export", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  },
  async ExportDataContent() {
    return fetchJSON("/api/export-content");
  },
  async ImportDataContent(data, mode = "replace") {
    return fetchJSON("/api/import-content", {
      method: "POST",
      body: JSON.stringify({ data, mode }),
    });
  },
  async CreateRequest(
    collectionId,
    name,
    method,
    url,
    headers,
    body,
    description,
  ) {
    const service = getAppService();
    if (service)
      return service.CreateRequest(
        collectionId,
        name,
        method,
        url,
        headers,
        body,
        description,
      );
    return fetchJSON(`/api/collections/${collectionId}/requests`, {
      method: "POST",
      body: JSON.stringify({ name, method, url, headers, body, description }),
    });
  },
  async RunCollection(collectionId, stopOnFail = false) {
    const service = getAppService();
    if (service && typeof service.RunCollection === "function")
      return service.RunCollection(collectionId, stopOnFail);
    return fetchJSON(`/api/collections/${collectionId}/run`, {
      method: "POST",
      body: JSON.stringify({ stopOnFail }),
    });
  },
  async UpdateRequest(id, name, method, url, headers, body, description) {
    const service = getAppService();
    if (service)
      return service.UpdateRequest(
        id,
        name,
        method,
        url,
        headers,
        body,
        description,
      );
    return fetchJSON(`/api/requests/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, method, url, headers, body, description }),
    });
  },
  async SetRequestAuth(
    id,
    authType,
    token,
    username,
    password,
    apiKey,
    apiKeyValue,
    apiKeyIn,
  ) {
    const service = getAppService();
    if (service)
      return service.SetRequestAuth(
        id,
        authType,
        token,
        username,
        password,
        apiKey,
        apiKeyValue,
        apiKeyIn,
      );
    return fetchJSON(`/api/requests/${id}/auth`, {
      method: "POST",
      body: JSON.stringify({
        authType,
        token,
        username,
        password,
        apiKey,
        apiKeyValue,
        apiKeyIn,
      }),
    });
  },
  async ExecuteRequest(id, envVars) {
    const service = getAppService();
    if (service) return service.ExecuteRequest(id, envVars || {});
    return fetchJSON(`/api/requests/${id}/execute`, {
      method: "POST",
      body: JSON.stringify({ envVars: envVars || {} }),
    });
  },
  async ExecuteRequestRaw(payload) {
    const service = getAppService();
    if (service && typeof service.ExecuteRequestRaw === "function")
      return service.ExecuteRequestRaw(payload);
    return fetchJSON("/api/requests/execute-raw", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
  async ExecuteGraphQLRequestRaw(payload) {
    const service = getAppService();
    if (service && typeof service.ExecuteGraphQLRequestRaw === "function")
      return service.ExecuteGraphQLRequestRaw(payload);
    return fetchJSON("/api/requests/execute-graphql-raw", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
  async ExecCommand(command) {
    const service = getAppService();
    if (service && typeof service.ExecCommand === "function")
      return service.ExecCommand(command);
    return fetchJSON("/api/exec", {
      method: "POST",
      body: JSON.stringify({ command }),
    });
  },
  async RevealInFinder(collectionId) {
    const service = getAppService();
    if (service && typeof service.RevealInFinder === "function")
      return service.RevealInFinder(collectionId);
    return fetchJSON(`/api/collections/${collectionId}/reveal`, {
      method: "POST",
    });
  },
  async GitInit(collectionId) {
    const service = getAppService();
    if (service && typeof service.GitInit === "function")
      return service.GitInit(collectionId);
    return fetchJSON(`/api/git/${collectionId}/init`, { method: "POST" });
  },
  async GitStatus(collectionId) {
    const service = getAppService();
    if (service && typeof service.GitStatus === "function")
      return service.GitStatus(collectionId);
    return fetchJSON(`/api/git/${collectionId}/status`);
  },
  async GitCommit(collectionId, message) {
    const service = getAppService();
    if (service && typeof service.GitCommit === "function")
      return service.GitCommit(collectionId, message);
    return fetchJSON(`/api/git/${collectionId}/commit`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },
  async GitLog(collectionId) {
    const service = getAppService();
    if (service && typeof service.GitLog === "function")
      return service.GitLog(collectionId);
    return fetchJSON(`/api/git/${collectionId}/log`);
  },
  async GitAddRemote(collectionId, name, url) {
    const service = getAppService();
    if (service && typeof service.GitAddRemote === "function")
      return service.GitAddRemote(collectionId, name, url);
    return fetchJSON(`/api/git/${collectionId}/remote`, {
      method: "POST",
      body: JSON.stringify({ name, url }),
    });
  },
  async GitPush(collectionId, remote) {
    const service = getAppService();
    if (service && typeof service.GitPush === "function")
      return service.GitPush(collectionId, remote);
    return fetchJSON(`/api/git/${collectionId}/push`, {
      method: "POST",
      body: JSON.stringify({ remote: remote || "origin" }),
    });
  },
  async GitPull(collectionId, remote) {
    const service = getAppService();
    if (service && typeof service.GitPull === "function")
      return service.GitPull(collectionId, remote);
    return fetchJSON(`/api/git/${collectionId}/pull`, {
      method: "POST",
      body: JSON.stringify({ remote: remote || "origin" }),
    });
  },

  // WebSocket
  async ConnectWebSocket(requestId, url, headers = {}) {
    const service = getAppService();
    if (service && typeof service.ConnectWebSocket === "function")
      return service.ConnectWebSocket(requestId, url, headers);
    return fetchJSON("/api/ws/connect", {
      method: "POST",
      body: JSON.stringify({ requestId, url, headers }),
    });
  },
  async DisconnectWebSocket(connId) {
    const service = getAppService();
    if (service && typeof service.DisconnectWebSocket === "function")
      return service.DisconnectWebSocket(connId);
    return fetchJSON("/api/ws/disconnect", {
      method: "POST",
      body: JSON.stringify({ connId }),
    });
  },
  async SendWebSocketMessage(connId, message) {
    const service = getAppService();
    if (service && typeof service.SendWebSocketMessage === "function")
      return service.SendWebSocketMessage(connId, message);
    return fetchJSON("/api/ws/send", {
      method: "POST",
      body: JSON.stringify({ connId, message }),
    });
  },
  async GetWebSocketMessages(connId) {
    const service = getAppService();
    if (service && typeof service.GetWebSocketMessages === "function")
      return service.GetWebSocketMessages(connId);
    return fetchJSON(`/api/ws/messages?connId=${encodeURIComponent(connId)}`);
  },
  async GetAllWebSocketMessages(connId) {
    const service = getAppService();
    if (service && typeof service.GetAllWebSocketMessages === "function")
      return service.GetAllWebSocketMessages(connId);
    return fetchJSON(
      `/api/ws/messages/all?connId=${encodeURIComponent(connId)}`,
    );
  },
  async GetWebSocketStatus(connId) {
    const service = getAppService();
    if (service && typeof service.GetWebSocketStatus === "function")
      return service.GetWebSocketStatus(connId);
    return fetchJSON(`/api/ws/status?connId=${encodeURIComponent(connId)}`);
  },

  // SSE
  async ConnectSSE(requestId, url, headers = {}) {
    const service = getAppService();
    if (service && typeof service.ConnectSSE === "function")
      return service.ConnectSSE(requestId, url, headers);
    return fetchJSON("/api/sse/connect", {
      method: "POST",
      body: JSON.stringify({ requestId, url, headers }),
    });
  },
  async DisconnectSSE(connId) {
    const service = getAppService();
    if (service && typeof service.DisconnectSSE === "function")
      return service.DisconnectSSE(connId);
    return fetchJSON("/api/sse/disconnect", {
      method: "POST",
      body: JSON.stringify({ connId }),
    });
  },
  async GetSSEEvents(connId) {
    const service = getAppService();
    if (service && typeof service.GetSSEEvents === "function")
      return service.GetSSEEvents(connId);
    return fetchJSON(`/api/sse/events?connId=${encodeURIComponent(connId)}`);
  },
  async GetAllSSEEvents(connId) {
    const service = getAppService();
    if (service && typeof service.GetAllSSEEvents === "function")
      return service.GetAllSSEEvents(connId);
    return fetchJSON(
      `/api/sse/events/all?connId=${encodeURIComponent(connId)}`,
    );
  },
  async GetSSEStatus(connId) {
    const service = getAppService();
    if (service && typeof service.GetSSEStatus === "function")
      return service.GetSSEStatus(connId);
    return fetchJSON(`/api/sse/status?connId=${encodeURIComponent(connId)}`);
  },

  // Scripting
  async GetRequestScripts(requestId) {
    const service = getAppService();
    if (service && typeof service.GetRequestScripts === "function")
      return service.GetRequestScripts(requestId);
    return fetchJSON(`/api/scripts/${encodeURIComponent(requestId)}/get`);
  },
  async SetRequestScripts(requestId, preRequestScript, testScript) {
    const service = getAppService();
    if (service && typeof service.SetRequestScripts === "function")
      return service.SetRequestScripts(requestId, preRequestScript, testScript);
    return fetchJSON(`/api/scripts/${encodeURIComponent(requestId)}/set`, {
      method: "PUT",
      body: JSON.stringify({ preRequestScript, testScript }),
    });
  },
  async RunPreRequestScript(requestId, script) {
    const service = getAppService();
    if (service && typeof service.RunPreRequestScript === "function")
      return service.RunPreRequestScript(requestId, script);
    return fetchJSON(
      `/api/scripts/${encodeURIComponent(requestId)}/pre-request`,
      {
        method: "POST",
        body: JSON.stringify({ script }),
      },
    );
  },
  async RunTestScript(requestId, script, response) {
    const service = getAppService();
    if (service && typeof service.RunTestScript === "function")
      return service.RunTestScript(requestId, script, response);
    return fetchJSON(`/api/scripts/${encodeURIComponent(requestId)}/test`, {
      method: "POST",
      body: JSON.stringify({ script, response }),
    });
  },

  // ==================== Mock Server ====================
  async StartMockServer(port) {
    const service = getAppService();
    if (service && typeof service.StartMockServer === "function")
      return service.StartMockServer(port);
    return fetchJSON("/api/mock/start", {
      method: "POST",
      body: JSON.stringify({ port }),
    });
  },
  async StopMockServer() {
    const service = getAppService();
    if (service && typeof service.StopMockServer === "function")
      return service.StopMockServer();
    return fetchJSON("/api/mock/stop", { method: "POST" });
  },
  async GetMockStatus() {
    const service = getAppService();
    if (service && typeof service.GetMockStatus === "function")
      return service.GetMockStatus();
    return fetchJSON("/api/mock/status");
  },
  async SetMockConfig(
    requestId,
    { statusCode, headers, body, latencyMs, enabled },
  ) {
    const service = getAppService();
    if (service && typeof service.SetMockConfig === "function")
      return service.SetMockConfig(
        requestId,
        statusCode,
        headers,
        body,
        latencyMs,
        enabled,
      );
    return fetchJSON(`/api/mock/config/${encodeURIComponent(requestId)}/set`, {
      method: "POST",
      body: JSON.stringify({ statusCode, headers, body, latencyMs, enabled }),
    });
  },
  async RemoveMockConfig(requestId) {
    const service = getAppService();
    if (service && typeof service.RemoveMockConfig === "function")
      return service.RemoveMockConfig(requestId);
    return fetchJSON(`/api/mock/config/${encodeURIComponent(requestId)}`, {
      method: "DELETE",
    });
  },
  async LoadMockConfigs(collectionId) {
    const service = getAppService();
    if (service && typeof service.LoadMockConfigs === "function")
      return service.LoadMockConfigs(collectionId);
    return fetchJSON(
      `/api/mock/configs/${encodeURIComponent(collectionId)}/list`,
    );
  },
  async GetMockLog() {
    const service = getAppService();
    if (service && typeof service.GetMockLog === "function")
      return service.GetMockLog();
    return fetchJSON("/api/mock/log");
  },
  async ClearMockLog() {
    const service = getAppService();
    if (service && typeof service.ClearMockLog === "function")
      return service.ClearMockLog();
    return fetchJSON("/api/mock/log", { method: "DELETE" });
  },

  // ==================== Postman Import ====================
  async ImportPostmanCollection(content, collectionId) {
    const service = getAppService();
    if (service && typeof service.ImportPostmanCollection === "function")
      return service.ImportPostmanCollection(content, collectionId);
    return fetchJSON(`/api/collections/${collectionId}/import-postman`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  async ImportPostmanEnvironment(content) {
    const service = getAppService();
    if (service && typeof service.ImportPostmanEnvironment === "function")
      return service.ImportPostmanEnvironment(content);
    return fetchJSON("/api/environments/import-postman", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },

  // ==================== OpenAPI/Swagger Import ====================
  async ImportOpenAPISpec(content, collectionId) {
    const service = getAppService();
    if (service && typeof service.ImportOpenAPISpec === "function")
      return service.ImportOpenAPISpec(content, collectionId);
    return fetchJSON(`/api/collections/${collectionId}/import-openapi`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },

  // ==================== Code Generation ====================
  async GenerateCode(requestId, language) {
    const service = getAppService();
    if (service && typeof service.GenerateCode === "function")
      return service.GenerateCode(requestId, language);
    return fetchJSON(`/api/requests/${requestId}/generate-code`, {
      method: "POST",
      body: JSON.stringify({ language }),
    });
  },
  async GetCodeLanguages() {
    const service = getAppService();
    if (service && typeof service.GetCodeLanguages === "function")
      return service.GetCodeLanguages();
    return fetchJSON("/api/code-languages");
  },
};
