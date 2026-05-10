import React, { useState } from 'react';
import { t } from '../i18n';

function Collections({ collections, selectedCollection, isLoading, onSelectCollection, onCreateCollection, onDeleteCollection, onUpdateCollection }) {
  const [showModal, setShowModal] = useState(false);
  const [collectionName, setCollectionName] = useState('');

  const handleCreate = () => {
    if (collectionName.trim()) {
      onCreateCollection(collectionName);
      setCollectionName('');
      setShowModal(false);
    }
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">
        {t('collections')}
        <button className="btn-small" onClick={() => setShowModal(true)}>+</button>
      </div>

      {collections.length === 0 ? (
        <div className="empty-section">{isLoading ? t('loading') : t('noCollectionsYet')}</div>
      ) : (
        collections.map(col => (
          <div
            key={col.id}
            className={`collection-item ${selectedCollection?.id === col.id ? 'active' : ''}`}
            onClick={() => onSelectCollection(col)}
          >
            <span>{col.name}</span>
            <div className="inline-actions">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  const nextName = window.prompt(t('requestName'), col.name);
                  if (nextName && nextName.trim() && nextName.trim() !== col.name) {
                    onUpdateCollection(col.id, nextName.trim());
                  }
                }}
              >
                {t('updateRequest')}
              </button>
              <button
                className="btn-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`${t('delete')} "${col.name}"?`)) {
                    onDeleteCollection(col.id);
                  }
                }}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        ))
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('saveRequest')}</h2>
            <input
              type="text"
              placeholder={t('requestName')}
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="modal-buttons">
              <button onClick={() => setShowModal(false)}>{t('dismiss')}</button>
              <button onClick={handleCreate}>{t('saveRequest')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Collections;
