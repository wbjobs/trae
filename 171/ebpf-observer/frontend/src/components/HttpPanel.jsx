export default function HttpPanel({ stats, recent }) {
  return (
    <div className="http-panel">
      <h2>TLS 解密 HTTP 观测</h2>

      <div className="http-stats">
        <h3>各服务 HTTP 统计</h3>
        <div className="stats-grid">
          {stats.map((svc) => (
            <div key={svc.service_name} className="stat-card">
              <div className="stat-header">
                <span className="service-name">{svc.service_name}</span>
                <span className="total-count">{svc.total_requests} req</span>
              </div>
              <div className="stat-section">
                <div className="section-title">方法分布</div>
                <div className="method-bars">
                  {Object.entries(svc.method_counts).map(([method, count]) => (
                    <div key={method} className="method-bar-row">
                      <span className="method-label">{method}</span>
                      <div className="method-bar-bg">
                        <div
                          className="method-bar-fill"
                          style={{
                            width: `${(count / svc.total_requests) * 100}%`,
                            backgroundColor: getMethodColor(method),
                          }}
                        />
                      </div>
                      <span className="method-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="stat-section">
                <div className="section-title">热门路径</div>
                <div className="path-list">
                  {Object.entries(svc.path_counts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([path, count]) => (
                    <div key={path} className="path-row">
                      <span className="path-name">{path}</span>
                      <span className="path-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="http-recent">
        <h3>最近 HTTP 请求</h3>
        <div className="request-list">
          {recent
            .slice(-30)
            .reverse()
            .map((req, idx) => (
              <div key={idx} className="request-item">
                <span
                  className={`method-badge method-${req.method.toLowerCase()}`}
                >
                  {req.method}
                </span>
                <span className="request-path">{req.path}</span>
                <span className="request-host">{req.host}</span>
                <span className={`direction ${req.direction}`}>{req.direction}</span>
                <span className="request-time">
                  {new Date(req.timestamp / 1000000).toLocaleTimeString()}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function getMethodColor(method) {
  const colors = {
    GET: '#10b981',
    POST: '#3b82f6',
    PUT: '#f59e0b',
    DELETE: '#ef4444',
    PATCH: '#8b5cf6',
    HEAD: '#6b7280',
    OPTIONS: '#6b7280',
  }
  return colors[method] || '#6b7280'
}
