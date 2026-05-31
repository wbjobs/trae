import React, { useState, useEffect, useCallback } from 'react';

interface VersionInfo {
  timestamp: number;
  label: string;
}

interface DiffResult {
  added: Array<{ id: string; color: string; points: Array<{ x: number; y: number }> }>;
  removed: Array<{ id: string; color: string; points: Array<{ x: number; y: number }> }>;
  modified: Array<{ before: any; after: any }>;
}

interface DiffResponse {
  timestamp: number;
  diff: DiffResult;
  stats: {
    currentCount: number;
    snapshotCount: number;
    added: number;
    removed: number;
    modified: number;
  };
}

interface HistoryPanelProps {
  roomId: string;
  apiUrl: string;
  onClose: () => void;
  onRollback: () => void;
}

export default function HistoryPanel({ roomId, apiUrl, onClose, onRollback }: HistoryPanelProps) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/history/${roomId}`);
      if (!res.ok) throw new Error('获取历史失败');
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId, apiUrl]);

  const fetchDiff = useCallback(async (timestamp: number) => {
    setLoadingDiff(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/history/${roomId}/${timestamp}/diff`);
      if (!res.ok) throw new Error('获取差异失败');
      const data = await res.json();
      setDiff(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDiff(false);
    }
  }, [roomId, apiUrl]);

  const handleSelectVersion = (timestamp: number) => {
    setSelectedVersion(timestamp);
    setDiff(null);
    fetchDiff(timestamp);
  };

  const handleRollback = async () => {
    if (!selectedVersion) return;
    if (!confirm(`确定要回滚到 ${new Date(selectedVersion).toLocaleString('zh-CN')} 吗？\n回滚后当前内容将丢失。`)) {
      return;
    }

    setRollingBack(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/history/${roomId}/${selectedVersion}/rollback`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('回滚失败');
      const data = await res.json();
      alert(data.message || '回滚成功');
      onRollback();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRollingBack(false);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h2>📜 历史版本</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="history-content">
          <div className="history-timeline">
            <div className="timeline-header">
              <span>版本列表</span>
              <button className="refresh-btn" onClick={fetchVersions} disabled={loading}>
                {loading ? '加载中...' : '🔄 刷新'}
              </button>
            </div>

            {loading && versions.length === 0 ? (
              <div className="loading-state">正在加载历史版本...</div>
            ) : versions.length === 0 ? (
              <div className="empty-state">
                <p>暂无历史版本</p>
                <p className="hint">每 30 秒自动保存快照，或等待下次保存</p>
              </div>
            ) : (
              <div className="version-list">
                {versions.map((v) => (
                  <div
                    key={v.timestamp}
                    className={`version-item ${selectedVersion === v.timestamp ? 'selected' : ''}`}
                    onClick={() => handleSelectVersion(v.timestamp)}
                  >
                    <div className="version-dot"></div>
                    <div className="version-info">
                      <div className="version-label">{v.label}</div>
                      <div className="version-time">{new Date(v.timestamp).toLocaleTimeString('zh-CN')}</div>
                    </div>
                    {selectedVersion === v.timestamp && (
                      <span className="selected-badge">当前</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="history-diff">
            {selectedVersion === null ? (
              <div className="diff-placeholder">
                <div className="placeholder-icon">👈</div>
                <p>选择左侧的历史版本</p>
                <p className="hint">查看该版本与当前内容的差异</p>
              </div>
            ) : loadingDiff ? (
              <div className="loading-state">正在计算差异...</div>
            ) : diff ? (
              <div className="diff-content">
                <div className="diff-header">
                  <h3>差异对比</h3>
                  <div className="diff-stats">
                    <span className="stat stat-added">+{diff.stats.added}</span>
                    <span className="stat stat-removed">-{diff.stats.removed}</span>
                    {diff.stats.modified > 0 && (
                      <span className="stat stat-modified">~{diff.stats.modified}</span>
                    )}
                  </div>
                </div>

                <div className="diff-summary">
                  <div className="summary-row">
                    <span>当前笔画数:</span>
                    <strong>{diff.stats.currentCount}</strong>
                  </div>
                  <div className="summary-row">
                    <span>快照笔画数:</span>
                    <strong>{diff.stats.snapshotCount}</strong>
                  </div>
                </div>

                <div className="diff-details">
                  {diff.stats.added > 0 && (
                    <div className="diff-section added-section">
                      <h4>🟢 新增笔画 ({diff.stats.added})</h4>
                      <div className="diff-items">
                        {diff.diff.added.slice(0, 10).map((item, i) => (
                          <div key={i} className="diff-item">
                            <span
                              className="color-dot"
                              style={{ backgroundColor: item.color || '#000' }}
                            ></span>
                            <span>{item.points?.length || 0} 个点</span>
                          </div>
                        ))}
                        {diff.stats.added > 10 && (
                          <div className="more-items">...还有 {diff.stats.added - 10} 条</div>
                        )}
                      </div>
                    </div>
                  )}

                  {diff.stats.removed > 0 && (
                    <div className="diff-section removed-section">
                      <h4>🔴 删除笔画 ({diff.stats.removed})</h4>
                      <div className="diff-items">
                        {diff.diff.removed.slice(0, 10).map((item, i) => (
                          <div key={i} className="diff-item">
                            <span
                              className="color-dot"
                              style={{ backgroundColor: item.color || '#000' }}
                            ></span>
                            <span>{item.points?.length || 0} 个点</span>
                          </div>
                        ))}
                        {diff.stats.removed > 10 && (
                          <div className="more-items">...还有 {diff.stats.removed - 10} 条</div>
                        )}
                      </div>
                    </div>
                  )}

                  {diff.stats.modified > 0 && (
                    <div className="diff-section modified-section">
                      <h4>🟡 修改笔画 ({diff.stats.modified})</h4>
                      <div className="diff-items">
                        {diff.diff.modified.slice(0, 5).map((item, i) => (
                          <div key={i} className="diff-item modified-item">
                            <span
                              className="color-dot"
                              style={{ backgroundColor: item.before?.color || '#000' }}
                            ></span>
                            <span>→</span>
                            <span
                              className="color-dot"
                              style={{ backgroundColor: item.after?.color || '#000' }}
                            ></span>
                          </div>
                        ))}
                        {diff.stats.modified > 5 && (
                          <div className="more-items">...还有 {diff.stats.modified - 5} 条</div>
                        )}
                      </div>
                    </div>
                  )}

                  {diff.stats.added === 0 && diff.stats.removed === 0 && diff.stats.modified === 0 && (
                    <div className="no-diff">
                      <p>✨ 与当前版本完全相同</p>
                    </div>
                  )}
                </div>

                <div className="diff-actions">
                  <button
                    className="rollback-btn"
                    onClick={handleRollback}
                    disabled={rollingBack}
                  >
                    {rollingBack ? '回滚中...' : '↩ 回滚到此版本'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {error && (
          <div className="error-banner">{error}</div>
        )}
      </div>

      <style>{`
        .history-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .history-panel {
          width: 900px;
          max-width: 95vw;
          height: 600px;
          max-height: 90vh;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .history-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          font-size: 18px;
          cursor: pointer;
          color: #64748b;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #e2e8f0;
          color: #1e293b;
        }

        .history-content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .history-timeline {
          width: 280px;
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 500;
          color: #475569;
          border-bottom: 1px solid #e2e8f0;
        }

        .refresh-btn {
          padding: 4px 10px;
          font-size: 12px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-btn:hover:not(:disabled) {
          background: #f1f5f9;
        }

        .refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .version-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .version-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
          margin-bottom: 4px;
        }

        .version-item:hover {
          background: #f1f5f9;
        }

        .version-item.selected {
          background: #dbeafe;
          border: 1px solid #bfdbfe;
        }

        .version-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #94a3b8;
          flex-shrink: 0;
        }

        .version-item.selected .version-dot {
          background: #3b82f6;
        }

        .version-info {
          flex: 1;
          min-width: 0;
        }

        .version-label {
          font-size: 13px;
          font-weight: 500;
          color: #1e293b;
        }

        .version-time {
          font-size: 11px;
          color: #64748b;
        }

        .selected-badge {
          font-size: 10px;
          padding: 2px 6px;
          background: #3b82f6;
          color: #fff;
          border-radius: 4px;
        }

        .loading-state {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          font-size: 14px;
        }

        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #64748b;
          padding: 20px;
        }

        .empty-state p {
          margin: 4px 0;
        }

        .empty-state .hint {
          font-size: 12px;
          color: #94a3b8;
        }

        .history-diff {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .diff-placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #64748b;
        }

        .placeholder-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .diff-placeholder .hint {
          font-size: 12px;
          color: #94a3b8;
        }

        .diff-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .diff-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .diff-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
        }

        .diff-stats {
          display: flex;
          gap: 8px;
        }

        .stat {
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 600;
        }

        .stat-added {
          background: #dcfce7;
          color: #16a34a;
        }

        .stat-removed {
          background: #fee2e2;
          color: #dc2626;
        }

        .stat-modified {
          background: #fef3c7;
          color: #d97706;
        }

        .diff-summary {
          padding: 12px 20px;
          background: #f8fafc;
          display: flex;
          gap: 24px;
        }

        .summary-row {
          display: flex;
          gap: 8px;
          font-size: 13px;
          color: #475569;
        }

        .summary-row strong {
          color: #1e293b;
        }

        .diff-details {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }

        .diff-section {
          margin-bottom: 20px;
        }

        .diff-section h4 {
          margin: 0 0 10px 0;
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
        }

        .diff-items {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .diff-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: #f8fafc;
          border-radius: 6px;
          font-size: 12px;
          color: #475569;
        }

        .color-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid rgba(0,0,0,0.1);
        }

        .modified-item {
          gap: 6px;
        }

        .more-items {
          font-size: 11px;
          color: #94a3b8;
          padding: 4px 10px;
        }

        .no-diff {
          text-align: center;
          padding: 40px 20px;
          color: #64748b;
        }

        .diff-actions {
          padding: 16px 20px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .rollback-btn {
          width: 100%;
          padding: 12px;
          background: #ef4444;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .rollback-btn:hover:not(:disabled) {
          background: #dc2626;
        }

        .rollback-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-banner {
          padding: 12px 20px;
          background: #fee2e2;
          color: #dc2626;
          font-size: 14px;
          border-top: 1px solid #fecaca;
        }
      `}</style>
    </div>
  );
}
