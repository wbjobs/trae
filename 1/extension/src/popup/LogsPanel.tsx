import React from 'react';
import { LogEntry } from '../types';

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

const LogsPanel: React.FC<Props> = ({ logs, onClear }) => {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const truncateUrl = (url: string, maxLen: number = 80) => {
    if (url.length <= maxLen) return url;
    return url.substring(0, maxLen - 3) + '...';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-12">
        <span className="text-sm text-muted">Showing last {logs.length} requests</span>
        <button className="btn btn-secondary btn-sm" onClick={onClear}>
          Clear Logs
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <p>No logs yet</p>
          <p className="text-xs text-muted mt-8">Requests will appear here as they are intercepted</p>
        </div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="log-entry">
            <div className="log-header">
              <div className="flex gap-6 items-center">
                <span className={`badge badge-method`}>{log.requestMethod}</span>
                {log.ruleName && (
                  <span className="text-xs text-muted">Rule: {log.ruleName}</span>
                )}
              </div>
              <span className="log-time">{formatTime(log.timestamp)}</span>
            </div>
            <div className="log-url" title={log.requestUrl}>
              {truncateUrl(log.requestUrl)}
            </div>
            <div className="log-meta">
              <span className={`badge badge-action ${log.actionType}`}>
                {log.actionType === 'forward' ? 'Forward' : log.actionType === 'mock' ? 'Mock' : 'No Match'}
              </span>
              <span className={`badge badge-status ${log.status}`}>
                {log.status === 'success' ? 'Success' : 'Error'}
              </span>
              {log.responseStatusCode && (
                <span className="badge badge-method">{log.responseStatusCode}</span>
              )}
              {log.responseTime !== undefined && (
                <span className="text-xs text-muted">{log.responseTime}ms</span>
              )}
            </div>
            {log.errorMessage && (
              <div className="text-xs mt-8" style={{ color: '#d32f2f' }}>
                {log.errorMessage}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default LogsPanel;
