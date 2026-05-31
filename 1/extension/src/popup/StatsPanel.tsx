import React, { useState, useEffect } from 'react';
import { StatsSummary, ExtensionSettings } from '../types';
import { ApiClient } from '../utils/api';

interface Props {
  settings: ExtensionSettings;
}

const StatsPanel: React.FC<Props> = ({ settings }) => {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const loadStats = async () => {
    setLoading(true);
    try {
      const api = new ApiClient(settings);
      const data = await api.getStats(hours);
      setStats(data);
    } catch (error) {
      console.error('Load stats error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [hours, settings]);

  const getStatusColor = (code: number): string => {
    if (code >= 200 && code < 300) return '#28a745';
    if (code >= 300 && code < 400) return '#17a2b8';
    if (code >= 400 && code < 500) return '#ffc107';
    return '#dc3545';
  };

  const truncateUrl = (url: string, maxLen: number = 50) => {
    if (url.length <= maxLen) return url;
    return url.substring(0, maxLen - 3) + '...';
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <p>Loading stats...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <p>No stats available</p>
      </div>
    );
  }

  const successRatePercent = (stats.successRate * 100).toFixed(1);
  const totalStatusCount = stats.statusCodes.reduce((sum, s) => sum + s.count, 0);
  const maxStatusCount = Math.max(...stats.statusCodes.map(s => s.count), 1);

  return (
    <div>
      <div className="flex justify-between items-center mb-12">
        <select
          className="form-select"
          style={{ width: 'auto', flex: 'none' }}
          value={hours}
          onChange={e => setHours(parseInt(e.target.value))}
        >
          <option value={1}>Last 1 hour</option>
          <option value={6}>Last 6 hours</option>
          <option value={24}>Last 24 hours</option>
          <option value={168}>Last 7 days</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={loadStats}>
          Refresh
        </button>
      </div>

      <div className="rule-card mb-12">
        <div className="settings-title mb-8">Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
              {stats.totalRequests}
            </div>
            <div className="text-xs text-muted">Total Requests</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
              {successRatePercent}%
            </div>
            <div className="text-xs text-muted">Success Rate</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6f42c1' }}>
              {stats.avgResponseTime.toFixed(0)}ms
            </div>
            <div className="text-xs text-muted">Avg Response</div>
          </div>
        </div>
      </div>

      <div className="rule-card mb-12">
        <div className="settings-title mb-8">Status Code Distribution</div>
        {stats.statusCodes.length === 0 ? (
          <div className="text-sm text-muted">No data</div>
        ) : (
          stats.statusCodes.map(sc => {
            const percent = ((sc.count / totalStatusCount) * 100).toFixed(1);
            const barWidth = (sc.count / maxStatusCount) * 100;
            return (
              <div key={sc.statusCode} className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <span
                    className="badge badge-method"
                    style={{ backgroundColor: getStatusColor(sc.statusCode), color: 'white' }}
                  >
                    {sc.statusCode}
                  </span>
                  <span className="text-xs text-muted">
                    {sc.count} ({percent}%)
                  </span>
                </div>
                <div
                  style={{
                    height: '8px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      backgroundColor: getStatusColor(sc.statusCode),
                      width: `${barWidth}%`,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rule-card">
        <div className="settings-title mb-8">Top URLs</div>
        {stats.topUrls.length === 0 ? (
          <div className="text-sm text-muted">No data</div>
        ) : (
          stats.topUrls.map((urlStat, index) => (
            <div
              key={index}
              className="log-entry"
              style={{ marginBottom: '8px' }}
            >
              <div className="flex justify-between items-center mb-4">
                <span className="rule-name">#{index + 1}</span>
                <div className="flex gap-6">
                  <span className="text-xs text-muted">{urlStat.count} requests</span>
                  <span className="text-xs text-muted">
                    avg {urlStat.avgResponseTime.toFixed(0)}ms
                  </span>
                </div>
              </div>
              <div className="log-url" title={urlStat.url}>
                {truncateUrl(urlStat.url)}
              </div>
              <div className="flex gap-8 mt-8">
                <span className="badge badge-status success">
                  {urlStat.successCount} success
                </span>
                <span className="badge badge-status error">
                  {urlStat.errorCount} error
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StatsPanel;
