import { useState, useEffect, useCallback } from 'react'
import FilterChain from './components/FilterChain.jsx'
import FilterManager from './components/FilterManager.jsx'

const API_BASE = '/api'

export default function App() {
  const [filters, setFilters] = useState([])
  const [chain, setChain] = useState([])
  const [activeTab, setActiveTab] = useState('chain')
  const [status, setStatus] = useState('checking')

  const fetchAll = useCallback(async () => {
    try {
      const [filtersRes, chainRes] = await Promise.all([
        fetch(`${API_BASE}/filters`),
        fetch(`${API_BASE}/chain`),
      ])
      const filtersData = await filtersRes.json()
      const chainData = await chainRes.json()
      setFilters(filtersData)
      setChain(chainData)
      setStatus('online')
    } catch {
      setStatus('offline')
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const refresh = () => fetchAll()

  return (
    <div className="app">
      <div className="header">
        <h1>Dapr Wasm Middleware</h1>
        <div className="status">
          <span className={`status-dot ${status}`} />
          <span>{status === 'online' ? 'Connected' : status === 'offline' ? 'Disconnected' : 'Connecting...'}</span>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'chain' ? 'active' : ''}`}
          onClick={() => setActiveTab('chain')}
        >
          Filter Chain
        </button>
        <button
          className={`tab ${activeTab === 'filters' ? 'active' : ''}`}
          onClick={() => setActiveTab('filters')}
        >
          Manage Filters
        </button>
      </div>

      {activeTab === 'chain' && (
        <FilterChain
          filters={filters}
          chain={chain}
          onReorder={refresh}
        />
      )}

      {activeTab === 'filters' && (
        <FilterManager
          filters={filters}
          onChange={refresh}
        />
      )}
    </div>
  )
}
