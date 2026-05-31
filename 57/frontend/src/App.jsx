import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import StockChart from './components/StockChart'
import AnomalyList from './components/AnomalyList'
import SigmaSlider from './components/SigmaSlider'
import { recalculateDataPoints } from './utils/anomalyUtils'

const MAX_DATA_POINTS = 300
const MAX_ANOMALIES = 100
const WS_URL = 'ws://localhost:8000/ws/stock'
const API_BASE = 'http://localhost:8000/api'

function App() {
  const { isConnected, lastMessage } = useWebSocket(WS_URL)
  const [priceData, setPriceData] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [stats, setStats] = useState({ total: 0, anomalies: 0 })
  const [currentSigma, setCurrentSigma] = useState(3)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const newAnomalyIdRef = useRef(0)
  const rawDataRef = useRef([])

  useEffect(() => {
    fetch(`${API_BASE}/sigma`)
      .then(res => res.json())
      .then(data => {
        setCurrentSigma(data.sigma)
      })
      .catch(err => {
        console.error('获取Sigma失败:', err)
      })
  }, [])

  const handleSigmaChange = useCallback((newSigma, fromServer = false) => {
    if (newSigma === currentSigma && fromServer) return
    
    setCurrentSigma(newSigma)

    if (rawDataRef.current.length > 0) {
      setIsRecalculating(true)
      try {
        const recalculated = recalculateDataPoints(rawDataRef.current, newSigma)
        setPriceData(recalculated)

        const newAnomalies = recalculated
          .filter(p => p.isAnomaly && p.anomaly_info)
          .map(p => ({
            id: newAnomalyIdRef.current++,
            timestamp: p.timestamp,
            price: p.price,
            volume: p.volume,
            mean: p.anomaly_info.mean,
            std: p.anomaly_info.std,
            z_score: p.anomaly_info.z_score,
            isNew: false
          }))
          .reverse()
          .slice(0, MAX_ANOMALIES)

        setAnomalies(newAnomalies)
        setStats(prev => ({
          ...prev,
          anomalies: newAnomalies.length
        }))
      } catch (err) {
        console.error('重算失败:', err)
      } finally {
        setIsRecalculating(false)
      }
    }
  }, [currentSigma])

  useEffect(() => {
    if (!lastMessage) return

    if (lastMessage.type === 'sigma_updated') {
      handleSigmaChange(lastMessage.sigma, true)
      return
    }

    if (lastMessage.type === 'init') {
      if (lastMessage.sigma) {
        setCurrentSigma(lastMessage.sigma)
      }
      return
    }

    if (lastMessage.type !== 'tick') return

    const { data, anomaly, anomaly_info } = lastMessage

    const rawPoint = {
      time: formatTime(data.timestamp),
      timestamp: data.timestamp,
      price: data.price,
      volume: data.volume,
      isAnomaly: anomaly,
      anomaly_info: anomaly_info || null
    }

    rawDataRef.current = [...rawDataRef.current, rawPoint]
    if (rawDataRef.current.length > MAX_DATA_POINTS) {
      rawDataRef.current = rawDataRef.current.slice(-MAX_DATA_POINTS)
    }

    setPriceData(prev => {
      const newData = [...prev, rawPoint]
      if (newData.length > MAX_DATA_POINTS) {
        return newData.slice(-MAX_DATA_POINTS)
      }
      return newData
    })

    setStats(prev => ({
      total: prev.total + 1,
      anomalies: prev.anomalies + (anomaly ? 1 : 0)
    }))

    if (anomaly && anomaly_info) {
      const anomalyEvent = {
        id: newAnomalyIdRef.current++,
        timestamp: data.timestamp,
        price: data.price,
        volume: data.volume,
        mean: anomaly_info.mean,
        std: anomaly_info.std,
        z_score: anomaly_info.z_score,
        isNew: true
      }

      setAnomalies(prev => {
        const newAnomalies = [anomalyEvent, ...prev]
        if (newAnomalies.length > MAX_ANOMALIES) {
          return newAnomalies.slice(0, MAX_ANOMALIES)
        }
        return newAnomalies.map((a, idx) => ({
          ...a,
          isNew: idx === 0
        }))
      })
    }
  }, [lastMessage, handleSigmaChange])

  return (
    <div className="app">
      <header className="header">
        <h1>📈 股票实时异常检测系统</h1>
        <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`}>
          <span className="status-dot"></span>
          <span>{isConnected ? '实时连接中' : '连接断开'}</span>
        </div>
      </header>

      <SigmaSlider
        currentSigma={currentSigma}
        onSigmaChange={handleSigmaChange}
        disabled={!isConnected}
      />

      <div className="main-content">
        <div className="chart-container">
          <div className="chart-header">
            <h2 className="chart-title">
              实时价格走势
              {isRecalculating && (
                <span style={{
                  marginLeft: '12px',
                  fontSize: '12px',
                  color: '#f59e0b'
                }}>
                  ⚙️ 重算中...
                </span>
              )}
            </h2>
            <div className="stats">
              <div className="stat-item">
                <div className="stat-label">当前Sigma</div>
                <div className="stat-value" style={{ color: getSigmaColor(currentSigma) }}>
                  {currentSigma.toFixed(1)}σ
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-label">总数据点</div>
                <div className="stat-value">{stats.total.toLocaleString()}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">异常次数</div>
                <div className="stat-value" style={{ color: '#ef4444' }}>{stats.anomalies}</div>
              </div>
            </div>
          </div>
          <StockChart data={priceData} />
        </div>

        <div className="anomaly-panel">
          <div className="anomaly-header">
            <h2 className="anomaly-title">⚠️ 异常事件</h2>
            <span className="anomaly-count">{anomalies.length} / {MAX_ANOMALIES}</span>
          </div>
          <AnomalyList anomalies={anomalies} />
        </div>
      </div>
    </div>
  )
}

function getSigmaColor(sigma) {
  if (sigma <= 2) return '#ef4444'
  if (sigma <= 3) return '#f59e0b'
  if (sigma <= 4) return '#10b981'
  return '#3b82f6'
}

function formatTime(isoString) {
  const date = new Date(isoString)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export default App
