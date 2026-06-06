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
  async MoveRequest(requestId, collectionId) {
    const service = getAppService();
    if (service) return service.MoveRequest(requestId, collectionId);
    return fetchJSON(`/api/requests/${requestId}/move`, {
      method: "POST",
      body: JSON.stringify({ collectionId }),
    });
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
  async ExecuteRequest(id) {
    const service = getAppService();
    if (service) return service.ExecuteRequest(id);
    return fetchJSON(`/api/requests/${id}/execute`, { method: "POST" });
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
};
