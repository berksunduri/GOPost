import { getAppService } from './bridge';

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }
  return data;
}

export const api = {
  async GetCollections() {
    const service = getAppService();
    if (service) return service.GetCollections();
    return fetchJSON('/api/collections');
  },
  async CreateCollection(name) {
    const service = getAppService();
    if (service) return service.CreateCollection(name);
    return fetchJSON('/api/collections', { method: 'POST', body: JSON.stringify({ name }) });
  },
  async DeleteCollection(id) {
    const service = getAppService();
    if (service) return service.DeleteCollection(id);
    return fetchJSON(`/api/collections/${id}`, { method: 'DELETE' });
  },
  async UpdateCollection(id, name) {
    const service = getAppService();
    if (service && typeof service.UpdateCollection === 'function') return service.UpdateCollection(id, name);
    return fetchJSON(`/api/collections/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
  },
  async GetEnvironments() {
    const service = getAppService();
    if (service) return service.GetEnvironments();
    return fetchJSON('/api/environments');
  },
  async CreateEnvironment(name, variables = {}) {
    const service = getAppService();
    if (service) return service.CreateEnvironment(name, variables);
    return fetchJSON('/api/environments', { method: 'POST', body: JSON.stringify({ name, variables }) });
  },
  async DeleteEnvironment(id) {
    const service = getAppService();
    if (service) return service.DeleteEnvironment(id);
    return fetchJSON(`/api/environments/${id}`, { method: 'DELETE' });
  },
  async UpdateEnvironment(id, name, variables = {}) {
    const service = getAppService();
    if (service && typeof service.UpdateEnvironment === 'function') return service.UpdateEnvironment(id, name, variables);
    return fetchJSON(`/api/environments/${id}`, {
      method: 'PUT',
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
    return fetchJSON(`/api/requests/search?q=${encodeURIComponent(query || '')}`);
  },
  async DuplicateRequest(requestId) {
    const service = getAppService();
    if (service) return service.DuplicateRequest(requestId);
    return fetchJSON(`/api/requests/${requestId}/duplicate`, { method: 'POST' });
  },
  async DeleteRequest(requestId) {
    const service = getAppService();
    if (service) return service.DeleteRequest(requestId);
    return fetchJSON(`/api/requests/${requestId}`, { method: 'DELETE' });
  },
  async MoveRequest(requestId, collectionId) {
    const service = getAppService();
    if (service) return service.MoveRequest(requestId, collectionId);
    return fetchJSON(`/api/requests/${requestId}/move`, {
      method: 'POST',
      body: JSON.stringify({ collectionId }),
    });
  },
  async GetHistory() {
    const service = getAppService();
    if (service) return service.GetHistory();
    return fetchJSON('/api/history');
  },
  async ReplayHistoryEntry(entryId) {
    const service = getAppService();
    if (service) return service.ReplayHistoryEntry(entryId);
    return fetchJSON(`/api/history/${entryId}/replay`, { method: 'POST' });
  },
  async ImportData(path) {
    const service = getAppService();
    if (service) return service.ImportData(path);
    return fetchJSON('/api/import', { method: 'POST', body: JSON.stringify({ path }) });
  },
  async ExportData(path) {
    const service = getAppService();
    if (service) return service.ExportData(path);
    return fetchJSON('/api/export', { method: 'POST', body: JSON.stringify({ path }) });
  },
  async ExportDataContent() {
    return fetchJSON('/api/export-content');
  },
  async ImportDataContent(data, mode = 'replace') {
    return fetchJSON('/api/import-content', {
      method: 'POST',
      body: JSON.stringify({ data, mode }),
    });
  },
  async CreateRequest(collectionId, name, method, url, headers, body, description) {
    const service = getAppService();
    if (service) return service.CreateRequest(collectionId, name, method, url, headers, body, description);
    return fetchJSON(`/api/collections/${collectionId}/requests`, {
      method: 'POST',
      body: JSON.stringify({ name, method, url, headers, body, description }),
    });
  },
  async RunCollection(collectionId, stopOnFail = false) {
    const service = getAppService();
    if (service && typeof service.RunCollection === 'function') return service.RunCollection(collectionId, stopOnFail);
    return fetchJSON(`/api/collections/${collectionId}/run`, {
      method: 'POST',
      body: JSON.stringify({ stopOnFail }),
    });
  },
  async UpdateRequest(id, name, method, url, headers, body, description) {
    const service = getAppService();
    if (service) return service.UpdateRequest(id, name, method, url, headers, body, description);
    return fetchJSON(`/api/requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, method, url, headers, body, description }),
    });
  },
  async SetRequestAuth(id, authType, token, username, password, apiKey, apiKeyValue, apiKeyIn) {
    const service = getAppService();
    if (service) return service.SetRequestAuth(id, authType, token, username, password, apiKey, apiKeyValue, apiKeyIn);
    return fetchJSON(`/api/requests/${id}/auth`, {
      method: 'POST',
      body: JSON.stringify({ authType, token, username, password, apiKey, apiKeyValue, apiKeyIn }),
    });
  },
  async ExecuteRequest(id) {
    const service = getAppService();
    if (service) return service.ExecuteRequest(id);
    return fetchJSON(`/api/requests/${id}/execute`, { method: 'POST' });
  },
};
