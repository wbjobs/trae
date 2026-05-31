import { useState, useEffect } from 'react'
import HealthDashboard from './components/HealthDashboard.jsx'
import TopologyGraph from './components/TopologyGraph.jsx'
import HttpPanel from './components/HttpPanel.jsx'
import { fetchData, connectWebSocket } from './api/client.js'

export default function App() {
  const [data, setData] = useState({
    health: [],
    topology: { nodes: [], edges: [] },
    http_stats: [],
    http_recent: [],
  })
  const [connected, setConnected] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchData().then(setData).catch(console.error)

    const ws = connectWebSocket(
      (newData) => setData(newData),
      () => setConnected(true),
      () => setConnected(false)
    )

    return () => ws.close()
  }, [])

  return (
    <div className="app">
      <header className="header">
        <h1>eBPF 深度观测平台</h1>
        <div className="status">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          {connected ? '实时连接' : '已断开'}
        </div>
      </header>

      <nav className="tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          服务健康
        </button>
        <button
          className={activeTab === 'topology' ? 'active' : ''}
          onClick={() => setActiveTab('topology')}
        >
          网络拓扑
        </button>
        <button
          className={activeTab === 'http' ? 'active' : ''}
          onClick={() => setActiveTab('http')}
        >
          HTTP 观测
        </button>
      </nav>

      <main className="content">
        {activeTab === 'overview' && <HealthDashboard data={data.health} />}
        {activeTab === 'topology' && <TopologyGraph topology={data.topology} />}
        {activeTab === 'http' && <HttpPanel stats={data.http_stats} recent={data.http_recent} />}
      </main>
    </div>
  )
}
