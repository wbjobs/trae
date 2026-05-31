import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { deviceApi } from '../services/api'
import dayjs from 'dayjs'

const Monitor = () => {
  const { devices, currentDevice, deviceData, activeAlerts } = useStore()
  const [historicalData, setHistoricalData] = useState<Record<string, any[]>>({})
  const [selectedComponent, setSelectedComponent] = useState<string>('main_motor')

  const componentNames: Record<string, string> = {
    main_motor: '主电机',
    gearbox: '变速箱',
    bearing: '轴承',
  }

  const params = [
    { key: 'temperature', label: '温度', unit: '°C', color: '#ef4444' },
    { key: 'pressure', label: '压力', unit: 'hPa', color: '#3b82f6' },
    { key: 'rotation_speed', label: '转速', unit: 'RPM', color: '#10b981' },
    { key: 'vibration', label: '振动', unit: 'mm/s', color: '#f59e0b' },
  ]

  useEffect(() => {
    if (currentDevice) {
      loadHistoricalData()
    }
  }, [currentDevice, selectedComponent])

  const loadHistoricalData = async () => {
    if (!currentDevice) return
    try {
      const data = await deviceApi.getAll()
      const allData: Record<string, any[]> = {}
      
      for (const comp of Object.keys(componentNames)) {
        const hist = await deviceApi.getLatestData(currentDevice.device_id, comp)
        allData[comp] = hist ? [hist] : []
      }
      
      setHistoricalData(allData)
    } catch (error) {
      console.error('Failed to load historical data:', error)
    }
  }

  const getStatusColor = (param: string, value: number) => {
    const thresholds: Record<string, { warning: number; critical: number }> = {
      temperature: { warning: 80, critical: 100 },
      pressure: { warning: 1200, critical: 1400 },
      rotation_speed: { warning: 3500, critical: 4000 },
      vibration: { warning: 1, critical: 2 },
    }
    const t = thresholds[param]
    if (!t) return 'bg-emerald-900/30 text-emerald-400'
    if (value >= t.critical) return 'bg-red-900/30 text-red-400'
    if (value >= t.warning) return 'bg-amber-900/30 text-amber-400'
    return 'bg-emerald-900/30 text-emerald-400'
  }

  if (!currentDevice) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">📊</div>
        <h2 className="text-2xl font-bold text-white mb-2">请选择设备</h2>
        <p className="text-slate-400">从左侧菜单中选择一个设备查看监控数据</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">设备监控面板</h1>
        <p className="text-slate-400 mt-1">
          {currentDevice.name_cn} - {currentDevice.device_id}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {params.map((param) => {
          const data = deviceData[selectedComponent]
          const value = data?.[param.key as keyof typeof data] as number | undefined

          return (
            <div key={param.key} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">{param.label}</span>
                <span className="text-xs text-slate-500">{param.unit}</span>
              </div>
              <div
                className={`text-3xl font-mono font-bold ${
                  value !== undefined
                    ? getStatusColor(param.key, value).split(' ')[1]
                    : 'text-slate-500'
                }`}
              >
                {value !== undefined ? value.toFixed(1) : '--'}
              </div>
              <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                {value !== undefined && (
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: param.color,
                      width: `${Math.min((value / 100) * 100, 100)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {Object.entries(componentNames).map(([compId, compName]) => {
          const data = deviceData[compId]
          const alerts = activeAlerts.filter((a) => a.component_id === compId)

          return (
            <div
              key={compId}
              className={`card p-4 cursor-pointer transition-colors ${
                selectedComponent === compId ? 'border-blue-500' : ''
              }`}
              onClick={() => setSelectedComponent(compId)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">{compName}</h3>
                {alerts.length > 0 && (
                  <span
                    className={`px-2 py-1 rounded text-xs alert-pulse ${
                      alerts.some((a) => a.level === 'critical')
                        ? 'bg-red-900 text-red-300'
                        : 'bg-amber-900 text-amber-300'
                    }`}
                  >
                    ⚠️ {alerts.length}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {params.slice(0, 4).map((param) => {
                  const value = data?.[param.key as keyof typeof data] as number | undefined
                  return (
                    <div key={param.key} className="text-xs">
                      <div className="text-slate-500">{param.label}</div>
                      <div
                        className={
                          value !== undefined
                            ? getStatusColor(param.key, value)
                            : 'text-slate-500'
                        }
                      >
                        {value !== undefined
                          ? `${value.toFixed(1)} ${param.unit}`
                          : '--'}
                      </div>
                    </div>
                  )
                })}
              </div>

              {data?.timestamp && (
                <div className="mt-3 text-xs text-slate-500">
                  更新时间: {dayjs(data.timestamp).format('HH:mm:ss')}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-lg font-semibold text-white mb-4">设备统计</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-emerald-400">
                {devices.length}
              </div>
              <div className="text-sm text-slate-400 mt-1">设备总数</div>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-amber-400">
                {activeAlerts.length}
              </div>
              <div className="text-sm text-slate-400 mt-1">活动告警</div>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-red-400">
                {activeAlerts.filter((a) => a.level === 'critical').length}
              </div>
              <div className="text-sm text-slate-400 mt-1">严重告警</div>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-400">
                {Object.keys(deviceData).length}
              </div>
              <div className="text-sm text-slate-400 mt-1">数据接收中</div>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-lg font-semibold text-white mb-4">告警参数阈值</h3>
          <div className="space-y-3">
            {[
              { param: '温度', warning: '> 80°C', critical: '> 100°C' },
              { param: '压力', warning: '> 1200 hPa', critical: '> 1400 hPa' },
              { param: '转速', warning: '< 2500 RPM', critical: '< 2000 RPM' },
              { param: '振动', warning: '> 1 mm/s', critical: '> 2 mm/s' },
            ].map((item) => (
              <div
                key={item.param}
                className="flex items-center justify-between p-2 bg-slate-900 rounded-lg"
              >
                <span className="text-slate-300">{item.param}</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-amber-900/50 text-amber-300 rounded text-xs">
                    警告: {item.warning}
                  </span>
                  <span className="px-2 py-1 bg-red-900/50 text-red-300 rounded text-xs">
                    严重: {item.critical}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Monitor
