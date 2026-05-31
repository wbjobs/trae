import { useState } from 'react'
import { deviceApi, alertApi } from '../services/api'
import type { ComponentInfo } from '../types'

interface DeviceFormProps {
  onSuccess: () => void
}

const DeviceForm = ({ onSuccess }: DeviceFormProps) => {
  const [formData, setFormData] = useState({
    device_id: '',
    name: '',
    name_cn: '',
    description: '',
    location: '',
  })
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [alertRules, setAlertRules] = useState([
    { parameter: 'temperature', max_value: 80, level: 'warning' as const },
    { parameter: 'temperature', max_value: 100, level: 'critical' as const },
    { parameter: 'pressure', max_value: 1200, level: 'warning' as const },
    { parameter: 'rotation_speed', min_value: 2000, level: 'warning' as const },
    { parameter: 'vibration', max_value: 1.0, level: 'warning' as const },
  ])
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const components: ComponentInfo[] = [
        { component_id: 'main_motor', name: 'Main Motor', name_cn: '主电机' },
        { component_id: 'gearbox', name: 'Gearbox', name_cn: '变速箱' },
        { component_id: 'bearing', name: 'Bearing', name_cn: '轴承' },
      ]

      const device = await deviceApi.create({
        ...formData,
        status: 'normal',
        components,
      })

      for (const rule of alertRules) {
        await alertApi.addRule({
          device_id: formData.device_id,
          parameter: rule.parameter,
          max_value: rule.max_value,
          min_value: rule.min_value,
          level: rule.level,
        })
      }

      if (modelFile) {
        await deviceApi.uploadModel(formData.device_id, modelFile)
      }

      onSuccess()
    } catch (error) {
      console.error('Failed to create device:', error)
      alert('创建设备失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-white mb-6">创建设备</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">设备ID</label>
            <input
              type="text"
              className="input-field"
              value={formData.device_id}
              onChange={(e) =>
                setFormData({ ...formData, device_id: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="label">设备名称（英文）</label>
            <input
              type="text"
              className="input-field"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">设备名称（中文）</label>
            <input
              type="text"
              className="input-field"
              value={formData.name_cn}
              onChange={(e) =>
                setFormData({ ...formData, name_cn: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="label">位置</label>
            <input
              type="text"
              className="input-field"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
            />
          </div>
        </div>

        <div>
          <label className="label">描述</label>
          <textarea
            className="input-field"
            rows={3}
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
          />
        </div>

        <div>
          <label className="label">3D模型（GLB/GLTF）</label>
          <input
            type="file"
            accept=".glb,.gltf"
            className="input-field"
            onChange={(e) => setModelFile(e.target.files?.[0] || null)}
          />
        </div>

        <div>
          <label className="label mb-2">告警规则（默认已配置）</label>
          <div className="bg-slate-900 rounded-lg p-4 space-y-2">
            {alertRules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="w-24 text-slate-400">{rule.parameter}</span>
                <span className="text-slate-500">
                  {rule.max_value ? `< ${rule.max_value}` : ''}
                  {rule.min_value ? `> ${rule.min_value}` : ''}
                </span>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    rule.level === 'critical'
                      ? 'bg-red-900 text-red-300'
                      : 'bg-amber-900 text-amber-300'
                  }`}
                >
                  {rule.level}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={loading}
          >
            {loading ? '创建中...' : '创建设备'}
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
            onClick={onSuccess}
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

export default DeviceForm
