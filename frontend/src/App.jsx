import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Collections from './components/Collections';
import RequestEditor from './components/RequestEditor';
import EnvironmentManager from './components/EnvironmentManager';
import RequestList from './components/RequestList';
import HistoryPanel from './components/HistoryPanel';
import { t } from './i18n';
import { api } from './api';
import { getAppService } from './bridge';

function App() {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [environments, setEnvironments] = useState([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);
  const [history, setHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCollectionsLoading, setIsCollectionsLoading] = useState(true);
  const [isEnvironmentsLoading, setIsEnvironmentsLoading] = useState(true);
  const [importMode, setImportMode] = useState('replace');
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingState, setLoadingState] = useState('');
  const [lastRunReport, setLastRunReport] = useState(null);
  const importInputRef = useRef(null);
  const searchInputRef = useRef(null);

  // Load collections on mount
  useEffect(() => {
    loadCollections();
    loadEnvironments();
    loadHistory();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (modifier && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        importInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const runWithStatus = async (label, handler, shouldSetLoading = true) => {
    if (shouldSetLoading) {
      setLoadingState(label);
    }
    setErrorMessage('');
    try {
      return await handler();
    } catch (error) {
      setErrorMessage(error.message || String(error));
      throw error;
    } finally {
      if (shouldSetLoading) {
        setLoadingState('');
      }
    }
  };

  const loadCollections = async () => {
    setIsCollectionsLoading(true);
    try {
      const result = await runWithStatus('collections', () => api.GetCollections(), false);
      setCollections(result || []);
    } catch (error) {
      console.error('Error loading collections:', error);
    } finally {
      setIsCollectionsLoading(false);
    }
  };

  const loadEnvironments = async () => {
    setIsEnvironmentsLoading(true);
    try {
      const result = await runWithStatus('environments', () => api.GetEnvironments(), false);
      setEnvironments(result || []);
    } catch (error) {
      console.error('Error loading environments:', error);
    } finally {
      setIsEnvironmentsLoading(false);
    }
  };

  const loadRequests = async (collectionId) => {
    try {
      const result = await runWithStatus('requests', () => api.GetRequestsForCollection(collectionId), false);
      setRequests(result || []);
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const result = await runWithStatus('history', () => api.GetHistory(), false);
      setHistory(result || []);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const handleSelectCollection = (collection) => {
    setSelectedCollection(collection);
    loadRequests(collection.id);
  };

  const handleCreateCollection = async (name) => {
    try {
      await runWithStatus('createCollection', () => api.CreateCollection(name));
      loadCollections();
    } catch (error) {
      console.error('Error creating collection:', error);
    }
  };

  const handleDeleteCollection = async (id) => {
    try {
      await runWithStatus('deleteCollection', () => api.DeleteCollection(id));
      loadCollections();
      if (selectedCollection?.id === id) {
        setSelectedCollection(null);
        setRequests([]);
      }
      if (selectedRequest?.collection_id === id) {
        setSelectedRequest(null);
      }
    } catch (error) {
      console.error('Error deleting collection:', error);
    }
  };

  const handleUpdateCollection = async (id, name) => {
    try {
      await runWithStatus('updateCollection', () => api.UpdateCollection(id, name));
      await loadCollections();
    } catch (error) {
      console.error('Error updating collection:', error);
    }
  };

  const handleCreateEnvironment = async (name) => {
    try {
      await runWithStatus('createEnvironment', () => api.CreateEnvironment(name, {}));
      loadEnvironments();
    } catch (error) {
      console.error('Error creating environment:', error);
    }
  };

  const handleDeleteEnvironment = async (id) => {
    try {
      await runWithStatus('deleteEnvironment', () => api.DeleteEnvironment(id));
      loadEnvironments();
    } catch (error) {
      console.error('Error deleting environment:', error);
    }
  };

  const handleUpdateEnvironment = async (id, name, variables) => {
    try {
      await runWithStatus('updateEnvironment', () => api.UpdateEnvironment(id, name, variables));
      await loadEnvironments();
    } catch (error) {
      console.error('Error updating environment:', error);
    }
  };

  const handleSearchRequests = async () => {
    try {
      const result = await runWithStatus('search', () => api.SearchRequests(searchQuery), false);
      setRequests(result || []);
    } catch (error) {
      console.error('Error searching requests:', error);
    }
  };

  const handleImportData = async (event) => {
    try {
      const file = event?.target?.files?.[0];
      if (!file) {
        return;
      }
      const raw = await file.text();
      const data = JSON.parse(raw);
      const result = await runWithStatus('import', () => api.ImportDataContent(data, importMode));
      if (importMode === 'preview') {
        alert(`${t('runSummary')}: collections ${result.collections}, requests ${result.requests}, environments ${result.environments}, history ${result.history}`);
      } else {
        await loadCollections();
        await loadEnvironments();
        await loadHistory();
        if (selectedCollection?.id) {
          await loadRequests(selectedCollection.id);
        }
        alert(t('importSuccess'));
      }
    } catch (error) {
      alert(`${t('importFailed')}: ${error.message}`);
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
    }
  };

  const handleExportData = async () => {
    try {
      const data = await runWithStatus('export', () => api.ExportDataContent());
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `gopost-export-${timestamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      anchor.remove();
      alert(t('exportSuccess'));
    } catch (error) {
      alert(`${t('exportFailed')}: ${error.message}`);
    }
  };

  const handleRunCollection = async () => {
    if (!selectedCollection?.id) {
      return;
    }
    try {
      const report = await runWithStatus('runCollection', () => api.RunCollection(selectedCollection.id, false));
      setLastRunReport(report);
      await loadHistory();
      await loadRequests(selectedCollection.id);
    } catch (error) {
      console.error('Error running collection:', error);
    }
  };

  const selectedRequestId = selectedRequest?.id;
  const selectedEnvironmentId = selectedEnvironment?.id;
  const selectedEnvironmentVariables = useMemo(() => {
    if (!selectedEnvironment) {
      return {};
    }
    return selectedEnvironment.variables || {};
  }, [selectedEnvironment]);

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>{t('appTitle')}</h1>
        </div>

        <Collections
          collections={collections}
          selectedCollection={selectedCollection}
          isLoading={isCollectionsLoading}
          onSelectCollection={handleSelectCollection}
          onCreateCollection={handleCreateCollection}
          onDeleteCollection={handleDeleteCollection}
          onUpdateCollection={handleUpdateCollection}
        />

        <EnvironmentManager
          environments={environments}
          selectedEnvironment={selectedEnvironment}
          isLoading={isEnvironmentsLoading}
          onSelectEnvironment={setSelectedEnvironment}
          onCreateEnvironment={handleCreateEnvironment}
          onDeleteEnvironment={handleDeleteEnvironment}
          onUpdateEnvironment={handleUpdateEnvironment}
        />
      </div>

      <div className="main-content">
        {errorMessage && (
          <div className="error-banner">
            <span>{errorMessage}</span>
            <div className="inline-actions">
              <button className="btn-send" onClick={() => setErrorMessage('')}>{t('dismiss')}</button>
              <button className="btn-send" onClick={() => { loadCollections(); loadEnvironments(); loadHistory(); }}>{t('retry')}</button>
            </div>
          </div>
        )}
        <div className="top-actions">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleSearchRequests();
              }
            }}
            placeholder={t('searchPlaceholder')}
            className="url-input"
          />
          <button className="btn-send" onClick={handleSearchRequests}>
            {t('search')}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden-file-input"
            onChange={handleImportData}
          />
          <button className="btn-send" onClick={() => importInputRef.current?.click()}>
            {t('import')}
          </button>
          <select value={importMode} className="method-select" onChange={(event) => setImportMode(event.target.value)}>
            <option value="replace">{t('importReplace')}</option>
            <option value="merge">{t('importMerge')}</option>
            <option value="preview">{t('importPreview')}</option>
          </select>
          <button className="btn-send" onClick={handleExportData}>
            {t('export')}
          </button>
          <button className="btn-send" onClick={handleRunCollection} disabled={!selectedCollection}>
            {t('runCollection')}
          </button>
          <span className="bridge-state">
            {t('bridgeMode')}: {getAppService() ? t('bridgeNative') : t('bridgeFallback')}
          </span>
          {loadingState && <span className="bridge-state">{t('loading')}</span>}
        </div>
        {lastRunReport && (
          <div className="run-report">
            <span>{t('runSummary')}: total {lastRunReport.total}, passed {lastRunReport.passed}, failed {lastRunReport.failed}</span>
          </div>
        )}
        {selectedCollection ? (
          <div className="workspace-grid">
            <RequestList
              collection={selectedCollection}
              requests={requests}
              selectedRequestId={selectedRequestId}
              onSelectRequest={setSelectedRequest}
              onRefreshRequests={() => loadRequests(selectedCollection.id)}
              onDuplicateRequest={async (requestID) => {
                await api.DuplicateRequest(requestID);
                await loadRequests(selectedCollection.id);
              }}
              onDeleteRequest={async (requestID) => {
                await api.DeleteRequest(requestID);
                await loadRequests(selectedCollection.id);
                if (selectedRequest?.id === requestID) {
                  setSelectedRequest(null);
                }
              }}
              onMoveRequest={async (requestID, targetCollectionID) => {
                await api.MoveRequest(requestID, targetCollectionID);
                await loadRequests(selectedCollection.id);
              }}
              collections={collections}
            />
            <RequestEditor
              collection={selectedCollection}
              selectedRequest={selectedRequest}
              selectedEnvironmentId={selectedEnvironmentId}
              selectedEnvironmentVariables={selectedEnvironmentVariables}
              onSelectRequest={setSelectedRequest}
              onRefreshRequests={async () => {
                await loadRequests(selectedCollection.id);
                await loadHistory();
              }}
            />
            <HistoryPanel
              history={history}
              onReplay={async (entryID) => {
                await api.ReplayHistoryEntry(entryID);
                await loadHistory();
              }}
              onOpenInEditor={(entry) => {
                const request = {
                  id: entry.request_id || `history-${entry.id}`,
                  name: entry.request_name || entry.url,
                  method: entry.method,
                  url: entry.url,
                  headers: entry.request_headers || {},
                  body: entry.request_body || '',
                  auth: entry.request_auth || { type: 'none' },
                  collection_id: entry.collection_id,
                };
                if (!selectedCollection || selectedCollection.id !== entry.collection_id) {
                  const match = collections.find((collection) => collection.id === entry.collection_id);
                  if (match) {
                    setSelectedCollection(match);
                  }
                }
                setSelectedRequest(request);
              }}
            />
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('selectCollection')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
