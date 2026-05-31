import React, { useState, useEffect } from 'react';
import socket from '../services/socket';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const StatsPanel = ({ containerId }) => {
  const [stats, setStats] = useState({
    cpuPercent: 0,
    memoryUsage: 0,
    memoryLimit: 0,
    memoryPercent: 0,
  });

  useEffect(() => {
    if (!containerId) {
      setStats({
        cpuPercent: 0,
        memoryUsage: 0,
        memoryLimit: 0,
        memoryPercent: 0,
      });
      return;
    }

    const handleStats = (message) => {
      if (message.stats) {
        setStats(message.stats);
      }
    };

    socket.on('stats', handleStats);

    return () => {
      socket.off('stats', handleStats);
    };
  }, [containerId]);

  const getProgressColor = (percent) => {
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warning';
    return '';
  };

  return (
    <div className="sidebar-section">
      <h3>资源监控</h3>

      <div className="stats-panel">
        <div className="stats-item">
          <div className="stats-label">
            <span>CPU 使用率</span>
            <span className="stats-value">{stats.cpuPercent.toFixed(1)}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${getProgressColor(stats.cpuPercent)}`}
              style={{ width: `${Math.min(stats.cpuPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="stats-item">
          <div className="stats-label">
            <span>内存使用</span>
            <span className="stats-value">
              {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${getProgressColor(stats.memoryPercent)}`}
              style={{ width: `${Math.min(stats.memoryPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="stats-item">
          <div className="stats-label">
            <span>内存使用率</span>
            <span className="stats-value">{stats.memoryPercent.toFixed(1)}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${getProgressColor(stats.memoryPercent)}`}
              style={{ width: `${Math.min(stats.memoryPercent, 100)}%` }}
            />
          </div>
        </div>

        {!containerId && (
          <div style={{ color: '#888', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
            启动容器以查看资源使用情况
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;
