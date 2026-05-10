import React, { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { api } from '../api';

function RequestEditor({ collection, selectedRequest, selectedEnvironmentVariables, onSelectRequest, onRefreshRequests }) {
  const [method, setMethod] = useState('GET');
  const [name, setName] = useState('');
  const [url, setURL] = useState('');
  const [headers, setHeaders] = useState([{ key: '', value: '' }]);
  const [body, setBody] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('headers');
  const [params, setParams] = useState([{ key: '', value: '', enabled: true }]);
  const [bodyMode, setBodyMode] = useState('raw');
  const [authType, setAuthType] = useState('none');
  const [auth, setAuth] = useState({ token: '', username: '', password: '', apiKey: '', apiKeyValue: '', apiKeyIn: 'header' });

  useEffect(() => {
    if (!selectedRequest) {
      return;
    }
    setName(selectedRequest.name || '');
    setMethod(selectedRequest.method || 'GET');
    setURL(selectedRequest.url || '');
    setBody(selectedRequest.body || '');
    setAuthType(selectedRequest.auth?.type || 'none');
    setAuth({
      token: selectedRequest.auth?.token || '',
      username: selectedRequest.auth?.username || '',
      password: selectedRequest.auth?.password || '',
      apiKey: selectedRequest.auth?.api_key || '',
      apiKeyValue: selectedRequest.auth?.api_key_value || '',
      apiKeyIn: selectedRequest.auth?.api_key_in || 'header',
    });
    const hydratedHeaders = Object.entries(selectedRequest.headers || {}).map(([key, value]) => ({ key, value }));
    setHeaders(hydratedHeaders.length > 0 ? hydratedHeaders : [{ key: '', value: '' }]);
  }, [selectedRequest]);

  const applyEnvironment = (value) => {
    let output = value;
    Object.keys(selectedEnvironmentVariables || {}).forEach((key) => {
      output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(selectedEnvironmentVariables[key]));
    });
    return output;
  };

  const mapHeaders = () => {
    const mapped = {};
    headers.forEach((header) => {
      if (header.key.trim()) {
        mapped[applyEnvironment(header.key.trim())] = applyEnvironment(header.value.trim());
      }
    });
    return mapped;
  };

  const effectiveURL = useMemo(() => {
    const baseURL = applyEnvironment(url);
    const activeParams = params.filter((param) => param.enabled && param.key.trim());
    if (activeParams.length === 0) {
      return baseURL;
    }
    const separator = baseURL.includes('?') ? '&' : '?';
    const query = activeParams
      .map((param) => `${encodeURIComponent(applyEnvironment(param.key.trim()))}=${encodeURIComponent(applyEnvironment(param.value.trim()))}`)
      .join('&');
    return `${baseURL}${separator}${query}`;
  }, [params, url, selectedEnvironmentVariables]);

  const upsertRequest = async () => {
    const mappedHeaders = mapHeaders();
    const mappedURL = effectiveURL;
    const mappedBody = applyEnvironment(body);
    if (selectedRequest?.id) {
      const updated = await api.UpdateRequest(
        selectedRequest.id,
        name || selectedRequest.name || 'Request',
        method,
        mappedURL,
        mappedHeaders,
        mappedBody,
        ''
      );
      await api.SetRequestAuth(updated.id, authType, auth.token, auth.username, auth.password, auth.apiKey, auth.apiKeyValue, auth.apiKeyIn);
      return updated;
    }
    const created = await api.CreateRequest(collection.id, name || 'New Request', method, mappedURL, mappedHeaders, mappedBody, '');
    await api.SetRequestAuth(created.id, authType, auth.token, auth.username, auth.password, auth.apiKey, auth.apiKeyValue, auth.apiKeyIn);
    onSelectRequest(created);
    return created;
  };

  const handleSendRequest = async () => {
    if (!url.trim()) {
      alert(t('requestUrl'));
      return;
    }
    try {
      setLoading(true);
      const request = await upsertRequest();
      const result = await api.ExecuteRequest(request.id);
      setResponse(result);
      setActiveTab('response');
      await onRefreshRequests();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key === 'Enter') {
        event.preventDefault();
        handleSendRequest();
      }
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        upsertRequest().then(() => onRefreshRequests());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [method, url, name, headers, body, authType, auth, selectedRequest, params, selectedEnvironmentVariables]);

  return (
    <div className="request-editor">
      <div className="toolbar">
        <select value={method} onChange={(event) => setMethod(event.target.value)} className="method-select">
          <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option><option>HEAD</option><option>OPTIONS</option>
        </select>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('requestName')} className="url-input" />
        <input type="url" value={url} onChange={(event) => setURL(event.target.value)} placeholder={t('requestUrl')} className="url-input" />
        <button onClick={async () => { await upsertRequest(); await onRefreshRequests(); }} className="btn-send">{selectedRequest?.id ? t('updateRequest') : t('saveRequest')}</button>
        <button onClick={handleSendRequest} disabled={loading} className="btn-send">{loading ? t('sending') : t('send')}</button>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'headers' ? 'active' : ''}`} onClick={() => setActiveTab('headers')}>{t('headers')}</button>
        <button className={`tab ${activeTab === 'auth' ? 'active' : ''}`} onClick={() => setActiveTab('auth')}>{t('auth')}</button>
        <button className={`tab ${activeTab === 'params' ? 'active' : ''}`} onClick={() => setActiveTab('params')}>{t('urlParams')}</button>
        <button className={`tab ${activeTab === 'body' ? 'active' : ''}`} onClick={() => setActiveTab('body')}>{t('body')}</button>
        <button className={`tab ${activeTab === 'response' ? 'active' : ''}`} onClick={() => setActiveTab('response')}>{t('response')}</button>
      </div>

      <div className="tab-content active">
        {activeTab === 'headers' && <div className="headers-panel">{headers.map((header, index) => (
          <div className="pair-row" key={`header-${index}`}>
            <input value={header.key} onChange={(event) => { const updated = [...headers]; updated[index].key = event.target.value; setHeaders(updated); }} placeholder="Header Name" />
            <input value={header.value} onChange={(event) => { const updated = [...headers]; updated[index].value = event.target.value; setHeaders(updated); }} placeholder="Header Value" />
          </div>
        ))}<button className="btn-send" onClick={() => setHeaders([...headers, { key: '', value: '' }])}>{t('addHeader')}</button></div>}
        {activeTab === 'auth' && <div className="headers-panel">
          <select value={authType} onChange={(event) => setAuthType(event.target.value)} className="method-select">
            <option value="none">{t('noAuth')}</option><option value="bearer">{t('bearerToken')}</option><option value="basic">{t('basicAuth')}</option><option value="apikey">{t('apiKey')}</option>
          </select>
          {authType === 'bearer' && <input value={auth.token} onChange={(event) => setAuth({ ...auth, token: event.target.value })} className="url-input" placeholder="Token" />}
          {authType === 'basic' && <><input value={auth.username} onChange={(event) => setAuth({ ...auth, username: event.target.value })} className="url-input" placeholder="Username" /><input value={auth.password} onChange={(event) => setAuth({ ...auth, password: event.target.value })} className="url-input" placeholder="Password" /></>}
          {authType === 'apikey' && <><input value={auth.apiKey} onChange={(event) => setAuth({ ...auth, apiKey: event.target.value })} className="url-input" placeholder="API Key Name" /><input value={auth.apiKeyValue} onChange={(event) => setAuth({ ...auth, apiKeyValue: event.target.value })} className="url-input" placeholder="API Key Value" /><select value={auth.apiKeyIn} onChange={(event) => setAuth({ ...auth, apiKeyIn: event.target.value })} className="method-select"><option value="header">Header</option><option value="query">Query</option></select></>}
        </div>}
        {activeTab === 'params' && (
          <div className="headers-panel">
            {params.map((param, index) => (
              <div className="pair-row" key={`param-${index}`}>
                <input
                  value={param.key}
                  onChange={(event) => {
                    const updated = [...params];
                    updated[index].key = event.target.value;
                    setParams(updated);
                  }}
                  placeholder={t('key')}
                />
                <input
                  value={param.value}
                  onChange={(event) => {
                    const updated = [...params];
                    updated[index].value = event.target.value;
                    setParams(updated);
                  }}
                  placeholder={t('value')}
                />
                <input
                  type="checkbox"
                  checked={param.enabled}
                  onChange={(event) => {
                    const updated = [...params];
                    updated[index].enabled = event.target.checked;
                    setParams(updated);
                  }}
                />
              </div>
            ))}
            <button className="btn-send" onClick={() => setParams([...params, { key: '', value: '', enabled: true }])}>{t('addParam')}</button>
          </div>
        )}
        {activeTab === 'body' && (
          <div className="headers-panel">
            <select className="method-select" value={bodyMode} onChange={(event) => setBodyMode(event.target.value)}>
              <option value="raw">{t('bodyModeRaw')}</option>
              <option value="form">{t('bodyModeForm')}</option>
              <option value="multipart">{t('bodyModeMultipart')}</option>
              <option value="binary">{t('bodyModeBinary')}</option>
            </select>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('requestBody')} className="body-textarea" />
          </div>
        )}
        {activeTab === 'response' && <div className="response-panel">{response ? <><div className="response-header"><span>{t('status')}: {response.status}</span><span>{t('time')}: {response.time}ms</span></div><pre className="response-body">{response.body || ''}</pre></> : <div className="no-response">{t('noResponse')}</div>}</div>}
      </div>
    </div>
  );
}

export default RequestEditor;
