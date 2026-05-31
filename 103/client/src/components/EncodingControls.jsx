import React from 'react'

const CODEC_OPTIONS = [
  { value: 'avc1.42E01E', label: 'H.264 Baseline L3.0' },
  { value: 'avc1.4D401E', label: 'H.264 Main L3.0' },
  { value: 'avc1.4D401F', label: 'H.264 Main L3.1' },
  { value: 'avc1.64001F', label: 'H.264 High L3.1' },
  { value: 'avc1.640028', label: 'H.264 High L4.0' }
]

const RESOLUTION_OPTIONS = [
  { value: '640x360', label: '360p (640×360)', width: 640, height: 360 },
  { value: '854x480', label: '480p (854×480)', width: 854, height: 480 },
  { value: '1280x720', label: '720p (1280×720)', width: 1280, height: 720 },
  { value: '1920x1080', label: '1080p (1920×1080)', width: 1920, height: 1080 }
]

const FRAMERATE_OPTIONS = [
  { value: 15, label: '15 fps' },
  { value: 24, label: '24 fps' },
  { value: 30, label: '30 fps' },
  { value: 60, label: '60 fps' }
]

const LATENCY_OPTIONS = [
  { value: 'quality', label: 'Quality' },
  { value: 'realtime', label: 'Realtime' }
]

export default function EncodingControls({
  config,
  onConfigChange,
  serverUrl,
  onServerUrlChange,
  connected,
  connecting,
  onConnect,
  onDisconnect,
  error
}) {
  const formatBitrate = (bps) => {
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`
    return `${bps} bps`
  }

  const handleCodecChange = (e) => {
    onConfigChange({ codec: e.target.value })
  }

  const handleResolutionChange = (e) => {
    const opt = RESOLUTION_OPTIONS.find((r) => r.value === e.target.value)
    if (opt) {
      onConfigChange({ width: opt.width, height: opt.height })
    }
  }

  const handleFramerateChange = (e) => {
    onConfigChange({ framerate: parseInt(e.target.value, 10) })
  }

  const handleLatencyChange = (e) => {
    onConfigChange({ latencyMode: e.target.value })
  }

  const handleBitrateSlider = (e) => {
    onConfigChange({ bitrate: parseInt(e.target.value, 10) })
  }

  return (
    <div className="panel-card">
      <h3>Connection & Encoding</h3>

      <div className="control-group">
        <label className="control-label">Server URL</label>
        <div className="server-input">
          <input
            type="text"
            className="control-input"
            value={serverUrl}
            onChange={(e) => onServerUrlChange(e.target.value)}
            disabled={connected || connecting}
            placeholder="https://host:port"
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          {!connected ? (
            <button
              className="connect-btn"
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button
              className="connect-btn connected"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          )}
        </div>
        {error && (
          <div style={{ color: '#f44336', fontSize: '12px', marginTop: '6px' }}>{error}</div>
        )}
      </div>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '16px 0' }} />

      <div className="encoding-controls">
        <div className="control-group">
          <label className="control-label">H.264 Profile</label>
          <select
            className="control-select"
            value={config.codec}
            onChange={handleCodecChange}
          >
            {CODEC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label className="control-label">Resolution</label>
          <select
            className="control-select"
            value={`${config.width}x${config.height}`}
            onChange={handleResolutionChange}
          >
            {RESOLUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label className="control-label">Frame Rate</label>
          <select
            className="control-select"
            value={config.framerate}
            onChange={handleFramerateChange}
          >
            {FRAMERATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label className="control-label">Latency Mode</label>
          <select
            className="control-select"
            value={config.latencyMode}
            onChange={handleLatencyChange}
          >
            {LATENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label className="control-label">Bitrate</label>
          <div className="control-row">
            <input
              type="range"
              className="control-slider"
              min="128000"
              max="8000000"
              step="128000"
              value={config.bitrate}
              onChange={handleBitrateSlider}
            />
            <span className="control-value-display">{formatBitrate(config.bitrate)}</span>
          </div>
        </div>

        <div className="codec-info">
          <div>Codec: {config.codec}</div>
          <div style={{ marginTop: '4px', color: '#888' }}>
            {config.width}×{config.height} @ {config.framerate}fps
          </div>
        </div>
      </div>
    </div>
  )
}
