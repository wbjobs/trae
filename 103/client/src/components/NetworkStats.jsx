import React from 'react'

export default function NetworkStats({ stats }) {
  const {
    rtt,
    packetLoss,
    qualityScore,
    currentBitrate,
    suggestedBitrate,
    bitrateTrend,
    fecEnabled,
    fecGroupSize,
    fecRedundancy,
    fecRecoveryRate,
    fecEffectiveThroughput
  } = stats

  const formatBitrate = (bps) => {
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`
    return `${bps} bps`
  }

  const getTier = (score) => {
    if (score >= 85) return { label: 'Excellent', className: 'excellent' }
    if (score >= 65) return { label: 'Good', className: 'good' }
    if (score >= 40) return { label: 'Fair', className: 'fair' }
    return { label: 'Poor', className: 'poor' }
  }

  const tier = getTier(qualityScore)
  const bitratePercent = Math.min(100, (currentBitrate / 8_000_000) * 100)

  const effectiveThroughputPercent = ((fecEffectiveThroughput || 1) * 100)
  const throughputBarColor = fecEnabled && (1 - (fecEffectiveThroughput || 0) > 0.15)
    ? 'linear-gradient(90deg, #ff9800, #f44336)'
    : 'linear-gradient(90deg, #4caf50, #8bc34a)'

  return (
    <div className="panel-card">
      <h3>Network Quality</h3>
      <div className="quality-score">
        <div className="quality-ring" style={{ ['--score']: qualityScore }}>
          <div className="quality-ring-inner">
            <span className="quality-value">{qualityScore}</span>
            <span className="quality-label">SCORE</span>
          </div>
        </div>
        <div className={`quality-tier ${tier.className}`}>{tier.label}</div>
      </div>

      <div className="stats-grid" style={{ marginTop: '16px' }}>
        <div className="stat-item">
          <div className="stat-label">RTT</div>
          <div className="stat-value">
            {rtt > 0 ? rtt.toFixed(0) : '—'} <span className="stat-unit">ms</span>
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Packet Loss</div>
          <div className="stat-value">
            {(packetLoss * 100).toFixed(1)} <span className="stat-unit">%</span>
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Bitrate</div>
          <div className="stat-value">
            {formatBitrate(currentBitrate)}
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Suggested</div>
          <div className="stat-value">
            {formatBitrate(suggestedBitrate)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="stat-label" style={{ marginRight: 'auto' }}>Bitrate Trend</div>
        <span className={`trend-indicator ${bitrateTrend}`}>
          {bitrateTrend === 'increasing' && '▲ Increasing'}
          {bitrateTrend === 'decreasing' && '▼ Decreasing'}
          {bitrateTrend === 'stable' && '● Stable'}
        </span>
      </div>

      <div className="bitrate-bar">
        <div className="bitrate-bar-fill" style={{ width: `${bitratePercent}%` }} />
      </div>

      {(fecEnabled !== undefined) && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="stat-label" style={{ marginBottom: '10px' }}>FEC (Forward Error Correction)</div>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Redundancy</div>
              <div className="stat-value">
                {fecEnabled ? `${fecRedundancy}%` : 'Off'}
                {fecEnabled && <span className="stat-unit"> ({fecGroupSize}:1)</span>}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Recovery</div>
              <div className="stat-value">
                {fecEnabled ? `${(fecRecoveryRate * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <div className="stat-label" style={{ marginBottom: '4px' }}>Effective Throughput</div>
            <div className="bitrate-bar" style={{ marginTop: 0 }}>
              <div
                className="bitrate-bar-fill"
                style={{
                  width: `${effectiveThroughputPercent}%`,
                  background: throughputBarColor
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
              {effectiveThroughputPercent.toFixed(1)}% of raw bandwidth used for payload
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
