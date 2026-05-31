import { useState } from 'react'
import FilterModal from './FilterModal.jsx'

const API_BASE = '/api'

export default function FilterManager({ filters, onChange }) {
  const [showModal, setShowModal] = useState(false)
  const [editingFilter, setEditingFilter] = useState(null)

  const handleAdd = () => {
    setEditingFilter(null)
    setShowModal(true)
  }

  const handleEdit = (filter) => {
    setEditingFilter(filter)
    setShowModal(true)
  }

  const handleDelete = async (name) => {
    if (!confirm(`Delete filter "${name}"?`)) return
    try {
      await fetch(`${API_BASE}/filters/${name}`, { method: 'DELETE' })
      onChange()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handleSave = async (filter) => {
    try {
      if (editingFilter) {
        await fetch(`${API_BASE}/filters/${filter.name}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        })
      } else {
        await fetch(`${API_BASE}/filters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        })
      }
      setShowModal(false)
      onChange()
    } catch (err) {
      console.error('Save failed:', err)
    }
  }

  const handleToggle = async (name, enabled) => {
    try {
      const action = enabled ? 'disable' : 'enable'
      await fetch(`${API_BASE}/filters/${name}/${action}`, { method: 'POST' })
      onChange()
    } catch (err) {
      console.error('Toggle failed:', err)
    }
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>All Filters ({filters.length})</h2>
        <button className="btn btn-primary" onClick={handleAdd}>
          + Add Filter
        </button>
      </div>

      {filters.length === 0 ? (
        <div className="empty-state">
          <p>No filters configured yet.</p>
          <button className="btn btn-primary" onClick={handleAdd}>
            Create Your First Filter
          </button>
        </div>
      ) : (
        <div className="filter-list">
          {filters.map((filter) => (
            <div key={filter.name} className="filter-card">
              <div className="filter-order" style={{ cursor: 'default' }}>
                {filter.order + 1}
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
                <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(filter)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(filter.name)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <FilterModal
          filter={editingFilter}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
