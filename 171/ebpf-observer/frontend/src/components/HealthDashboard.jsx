export default function HealthDashboard({ data }) {
  return (
    <div className="dashboard">
      <h2>服务网络健康分</h2>
      <div className="health-grid">
        {data.map((svc) => (
          <div key={svc.service_name} className="health-card">
            <div className="health-header">
              <span className="service-name">{svc.service_name}</span>
              <span
                className="health-score"
                style={{ color: getScoreColor(svc.health_score) }}
              >
                {svc.health_score.toFixed(1)}
              </span>
            </div>
            <div className="health-bar">
              <div
                className="health-bar-fill"
                style={{
                  width: `${svc.health_score}%`,
                  backgroundColor: getScoreColor(svc.health_score),
                }}
              />
            </div>
            <div className="health-details">
              <div className="detail">
                <span className="label">重传率</span>
                <span>{(svc.retransmit_rate * 100).toFixed(2)}%</span>
              </div>
              <div className="detail">
                <span className="label">丢包率</span>
                <span>{(svc.loss_rate * 100).toFixed(2)}%</span>
              </div>
              <div className="detail">
                <span className="label">平均 RTT</span>
                <span>{svc.avg_rtt_ms.toFixed(1)} ms</span>
              </div>
              <div className="detail">
                <span className="label">连接数</span>
                <span>{svc.total_conns}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getScoreColor(score) {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}
