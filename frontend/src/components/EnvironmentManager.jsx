import React, { useState } from 'react';
import { t } from '../i18n';

function EnvironmentManager({ environments, selectedEnvironment, isLoading, onSelectEnvironment, onCreateEnvironment, onDeleteEnvironment, onUpdateEnvironment }) {
  const [showModal, setShowModal] = useState(false);
  const [envName, setEnvName] = useState('');
  const [editorVariables, setEditorVariables] = useState([]);

  const handleCreate = () => {
    if (envName.trim()) {
      onCreateEnvironment(envName);
      setEnvName('');
      setShowModal(false);
    }
  };

  const handleSelectEnvironment = (environment) => {
    onSelectEnvironment(environment);
    const pairs = Object.entries(environment.variables || {}).map(([key, value]) => ({ key, value: String(value), enabled: true }));
    setEditorVariables(pairs.length > 0 ? pairs : [{ key: '', value: '', enabled: true }]);
  };

  const handleSaveEnvironment = () => {
    if (!selectedEnvironment) {
      return;
    }
    const variables = {};
    editorVariables.forEach((item) => {
      if (item.enabled && item.key.trim()) {
        variables[item.key.trim()] = item.value;
      }
    });
    onUpdateEnvironment(selectedEnvironment.id, selectedEnvironment.name, variables);
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">
        {t('envVariables')}
        <button className="btn-small" onClick={() => setShowModal(true)}>+</button>
      </div>

      {environments.length === 0 ? (
        <div className="empty-section">{isLoading ? t('loading') : t('noEnvironmentsYet')}</div>
      ) : (
        environments.map(env => (
          <div
            key={env.id}
            className={`collection-item ${selectedEnvironment?.id === env.id ? 'active' : ''}`}
            onClick={() => handleSelectEnvironment(env)}
          >
            <span>{env.name}</span>
            <button
              className="btn-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`${t('delete')} "${env.name}"?`)) {
                  onDeleteEnvironment(env.id);
                }
              }}
            >
              ×
            </button>
          </div>
        ))
      )}

      {selectedEnvironment && (
        <div className="env-editor">
          <div className="sidebar-section-title">{t('envName')}: {selectedEnvironment.name}</div>
          {editorVariables.map((item, index) => (
            <div className="pair-row" key={`env-var-${index}`}>
              <input
                value={item.key}
                onChange={(event) => {
                  const updated = [...editorVariables];
                  updated[index].key = event.target.value;
                  setEditorVariables(updated);
                }}
                placeholder={t('key')}
              />
              <input
                value={item.value}
                onChange={(event) => {
                  const updated = [...editorVariables];
                  updated[index].value = event.target.value;
                  setEditorVariables(updated);
                }}
                placeholder={t('value')}
              />
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(event) => {
                  const updated = [...editorVariables];
                  updated[index].enabled = event.target.checked;
                  setEditorVariables(updated);
                }}
              />
            </div>
          ))}
          <div className="inline-actions">
            <button className="btn-send" onClick={() => setEditorVariables([...editorVariables, { key: '', value: '', enabled: true }])}>{t('addVariable')}</button>
            <button className="btn-send" onClick={handleSaveEnvironment}>{t('saveEnvironment')}</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Environment</h2>
            <input
              type="text"
              placeholder={t('envName')}
              value={envName}
              onChange={(e) => setEnvName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="modal-buttons">
              <button onClick={() => setShowModal(false)}>{t('dismiss')}</button>
              <button onClick={handleCreate}>{t('saveEnvironment')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnvironmentManager;
