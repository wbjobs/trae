import { useState } from 'react'

const API_BASE = '/api'

export default function FilterChain({ filters, chain, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null)

  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      return
    }

    const newChain = [...chain]
    const [dragged] = newChain.splice(dragIndex, 1)
    newChain.splice(dropIndex, 0, dragged)

    const names = newChain.map((f) => f.name)
    try {
      await fetch(`${API_BASE}/chain/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      })
      onReorder()
    } catch (err) {
      console.error('Reorder failed:', err)
    }
    setDragIndex(null)
  }

  const handleReload = async (name) => {
    try {
      await fetch(`${API_BASE}/chain/reload/${name}`, { method: 'POST' })
      onReorder()
    } catch (err) {
      console.error('Reload failed:', err)
    }
  }

  const handleToggle = async (name, enabled) => {
    try {
      const action = enabled ? 'disable' : 'enable'
      await fetch(`${API_BASE}/filters/${name}/${action}`, { method: 'POST' })
      onReorder()
    } catch (err) {
      console.error('Toggle failed:', err)
    }
  }

  if (chain.length === 0) {
    return (
      <div className="panel">
        <h2>Filter Chain</h2>
        <div className="empty-state">
          <p>No filters in the chain. Add filters in the Manage Filters tab.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Filter Chain ({chain.length} active)</h2>
      <div className="filter-list">
        {chain.map((filter, index) => (
          <div
            key={filter.name}
            className={`filter-card ${dragIndex === index ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="filter-order" title="Drag to reorder">
              {index + 1}
            </div>
            <div className="filter-info">
              <div className="filter-name">{filter.name}</div>
              <div className="filter-path">{filter.path}</div>
              <div className="filter-config">
                <span className={`badge ${
                  filter.needBody === 0 ? 'badge-header-only' :
                  filter.needBody === 2 ? 'badge-stream' : 'badge-body'
                }`}>
                  {filter.needBody === 0 ? 'Header-Only' :
                   filter.needBody === 2 ? 'Streaming' : 'Full Body'}
                </span>
                {filter.config && Object.keys(filter.config).length > 0 && (
                  <span style={{ marginLeft: 8 }}>
                    {Object.entries(filter.config).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </span>
                )}
              </div>
            </div>
            <div
              className={`toggle ${filter.enabled ? 'on' : ''}`}
              onClick={() => handleToggle(filter.name, filter.enabled)}
            >
              <div className="toggle-thumb" />
            </div>
            <div className="filter-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleReload(filter.name)}
              >
                Reload
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
