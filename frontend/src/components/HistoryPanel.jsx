import React from 'react';
import { t } from '../i18n';

function HistoryPanel({ history, onReplay, onOpenInEditor }) {
  return (
    <div className="history-panel">
      <div className="sidebar-section-title">{t('history')}</div>
      {history.map((entry) => (
        <div key={entry.id} className="collection-item">
          <div className="history-content">
            <div>{entry.method} {entry.url}</div>
            <div>{entry.status} ({entry.time_ms}ms)</div>
          </div>
          <div className="inline-actions">
            <button className="btn-send" onClick={() => onReplay(entry.id)}>{t('replay')}</button>
            <button className="btn-send" onClick={() => onOpenInEditor(entry)}>{t('openInEditor')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default HistoryPanel;
