import React from 'react';
import { t } from '../i18n';

function RequestList({
  requests,
  selectedRequestId,
  onSelectRequest,
  onDuplicateRequest,
  onDeleteRequest,
  onMoveRequest,
  collections,
}) {
  return (
    <div className="request-list-panel">
      <div className="sidebar-section-title">{t('requests')}</div>
      {requests.map((request) => (
        <div
          key={request.id}
          className={`collection-item ${selectedRequestId === request.id ? 'active' : ''}`}
          onClick={() => onSelectRequest(request)}
        >
          <span>{request.name}</span>
          <div className="inline-actions">
            <button title={t('duplicate')} onClick={(event) => { event.stopPropagation(); onDuplicateRequest(request.id); }}>{t('duplicate')}</button>
            <button
              title={t('delete')}
              onClick={(event) => {
                event.stopPropagation();
                if (window.confirm(`${t('delete')} "${request.name}"?`)) {
                  onDeleteRequest(request.id);
                }
              }}
            >
              {t('delete')}
            </button>
            <select
              value={request.collection_id}
              onChange={(event) => {
                event.stopPropagation();
                onMoveRequest(request.id, event.target.value);
              }}
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

export default RequestList;
