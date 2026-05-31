import React, { useState, useCallback, useRef, useEffect } from 'react'
import VideoCall from './components/VideoCall.jsx'
import NetworkStats from './components/NetworkStats.jsx'
import EncodingControls from './components/EncodingControls.jsx'

const DEFAULT_SERVER_URL = 'https://127.0.0.1:4433/video'

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  const [networkStats, setNetworkStats] = useState({
    rtt: 0,
    packetLoss: 0,
    qualityScore: 0,
    currentBitrate: 2_000_000,
    suggestedBitrate: 2_000_000,
    bitrateTrend: 'stable',
    fecEnabled: false,
    fecGroupSize: 1,
    fecRedundancy: 0,
    fecRecoveryRate: 0,
    fecEffectiveThroughput: 1
  })

  const [encodingConfig, setEncodingConfig] = useState({
    codec: 'avc1.42E01E',
    width: 1280,
    height: 720,
    bitrate: 2_000_000,
    framerate: 30,
    latencyMode: 'quality'
  })

  const connectionRef = useRef(null)

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setError(null)

    try {
      const transport = new WebTransport(serverUrl)
      connectionRef.current = transport

      transport.closed.then(() => {
        setConnected(false)
        setConnecting(false)
        connectionRef.current = null
      }).catch((err) => {
        console.error('[App] WebTransport error:', err)
        setError(err.message)
      })

      await transport.ready
      setConnected(true)
      setConnecting(false)
    } catch (err) {
      console.error('[App] Failed to connect:', err)
      setError(err.message)
      setConnecting(false)
      setConnected(false)
    }
  }, [serverUrl])

  const handleDisconnect = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.close()
      connectionRef.current = null
    }
    setConnected(false)
    setConnecting(false)
  }, [])

  const handleNetworkStatsUpdate = useCallback((stats) => {
    setNetworkStats(stats)
  }, [])

  const handleBitrateChange = useCallback((bitrate) => {
    setEncodingConfig((prev) => ({ ...prev, bitrate }))
  }, [])

  const handleEncodingConfigChange = useCallback((config) => {
    setEncodingConfig((prev) => ({ ...prev, ...config }))
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>WebTransport Video Call</h1>
        <div className="connection-status">
          <span className={`status-dot ${connected ? 'connected' : connecting ? 'connecting' : ''}`} />
          <span>{connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="app-body">
        <div className="video-area">
          <VideoCall
            transport={connectionRef.current}
            connected={connected}
            encodingConfig={encodingConfig}
            onNetworkStatsUpdate={handleNetworkStatsUpdate}
            onBitrateChange={handleBitrateChange}
            serverUrl={serverUrl}
          />
        </div>

        <div className="side-panel">
          <NetworkStats stats={networkStats} />

          <EncodingControls
            config={encodingConfig}
            onConfigChange={handleEncodingConfigChange}
            serverUrl={serverUrl}
            onServerUrlChange={setServerUrl}
            connected={connected}
            connecting={connecting}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            error={error}
          />
        </div>
      </div>
    </div>
  )
}
