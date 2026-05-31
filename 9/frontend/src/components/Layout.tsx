import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'

const Layout = () => {
  const navigate = useNavigate()
  const { currentDevice, devices, activeAlerts, wsConnected } = useStore()

  const navItems = [
    { to: '/', label: '数字孪生场景', icon: '🎮' },
    { to: '/monitor', label: '设备监控面板', icon: '📊' },
    { to: '/playback', label: '历史数据回放', icon: '▶️' },
    { to: '/health', label: '健康度评估', icon: '❤️' },
    { to: '/alerts', label: '告警管理', icon: '⚠️' },
    { to: '/work-orders', label: '运维工单', icon: '📋' },
  ]

  return (
    <div className="min-h-screen flex bg-slate-900">
      <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🏭</span>
            数字孪生平台
          </h1>
        </div>

        <div className="p-4 border-b border-slate-700">
          <label className="label">选择设备</label>
          <select
            className="input-field"
            value={currentDevice?.device_id || ''}
            onChange={(e) => {
              const device = devices.find((d) => d.device_id === e.target.value)
              useStore.getState().setCurrentDevice(device || null)
            }}
          >
            <option value="">-- 请选择设备 --</option>
            {devices.map((device) => (
              <option key={device.id} value={device.device_id}>
                {device.name_cn} ({device.device_id})
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">WebSocket</span>
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
          </div>
          {activeAlerts.length > 0 && (
            <div
              className="mt-2 p-2 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-300 cursor-pointer hover:bg-red-900/70"
              onClick={() => navigate('/alerts')}
            >
              ⚠️ {activeAlerts.length} 个活动告警
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
