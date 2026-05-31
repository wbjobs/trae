export default function AnomalyList({ anomalies }) {
  if (anomalies.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">✨</div>
        <div>暂无异常事件</div>
        <div style={{ fontSize: '12px', marginTop: '8px' }}>系统正在监控中...</div>
      </div>
    )
  }

  return (
    <div className="anomaly-list">
      {anomalies.map((anomaly) => (
        <div key={anomaly.id} className={`anomaly-card ${anomaly.isNew ? 'new' : ''}`}>
          <div className="anomaly-time">
            {formatDateTime(anomaly.timestamp)}
          </div>
          <div className="anomaly-price-row">
            <span className="anomaly-price">${anomaly.price.toFixed(2)}</span>
            <span className="anomaly-zscore">Z: {anomaly.z_score.toFixed(2)}σ</span>
          </div>
          <div className="anomaly-details">
            <div className="anomaly-detail-item">
              <span className="anomaly-detail-label">均值</span>
              <span className="anomaly-detail-value">${anomaly.mean.toFixed(2)}</span>
            </div>
            <div className="anomaly-detail-item">
              <span className="anomaly-detail-label">标准差</span>
              <span className="anomaly-detail-value">${anomaly.std.toFixed(2)}</span>
            </div>
            <div className="anomaly-detail-item">
              <span className="anomaly-detail-label">成交量</span>
              <span className="anomaly-detail-value">{anomaly.volume.toLocaleString()}</span>
            </div>
            <div className="anomaly-detail-item">
              <span className="anomaly-detail-label">偏离</span>
              <span className="anomaly-detail-value" style={{ color: '#ef4444' }}>
                {anomaly.price > anomaly.mean ? '↑' : '↓'}
                {Math.abs(((anomaly.price - anomaly.mean) / anomaly.mean) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatDateTime(isoString) {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}
