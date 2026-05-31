import { useState, useEffect } from 'react'

export default function FilterModal({ filter, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    path: '',
    order: 0,
    enabled: true,
    needBody: 0,
    config: {},
    configStr: '',
  })

  useEffect(() => {
    if (filter) {
      setForm({
        name: filter.name,
        path: filter.path,
        order: filter.order,
        enabled: filter.enabled,
        needBody: filter.needBody,
        config: filter.config || {},
        configStr: filter.config
          ? Object.entries(filter.config).map(([k, v]) => `${k}=${v}`).join('\n')
          : '',
      })
    }
  }, [filter])

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    const configObj = {}
    form.configStr.split('\n').forEach((line) => {
      const idx = line.indexOf('=')
      if (idx > 0) {
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (key) configObj[key] = value
      }
    })

    onSave({
      name: form.name,
      path: form.path,
      order: parseInt(form.order, 10) || 0,
      enabled: form.enabled,
      needBody: parseInt(form.needBody, 10),
      config: configObj,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{filter ? 'Edit Filter' : 'Add Filter'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. jwt-validator"
              disabled={!!filter}
              required
            />
          </div>

          <div className="form-group">
            <label>Wasm File Path</label>
            <input
              type="text"
              value={form.path}
              onChange={(e) => handleChange('path', e.target.value)}
              placeholder="./wasm/jwt.wasm"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Order</label>
              <input
                type="number"
                value={form.order}
                onChange={(e) => handleChange('order', e.target.value)}
                min="0"
              />
            </div>
            <div className="form-group">
              <label>Body Access</label>
              <select
                value={form.needBody}
                onChange={(e) => handleChange('needBody', e.target.value)}
              >
                <option value="0">Header-Only (no body)</option>
                <option value="1">Full Body</option>
                <option value="2">Streaming (large bodies)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>
              Config (key=value, one per line)
            </label>
            <textarea
              rows="4"
              value={form.configStr}
              onChange={(e) => handleChange('configStr', e.target.value)}
              placeholder={'secret_key=my-secret\nlog_level=INFO'}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {filter ? 'Save Changes' : 'Add Filter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
