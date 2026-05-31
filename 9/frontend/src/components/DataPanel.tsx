import { useStore } from '../store/useStore'
import dayjs from 'dayjs'

interface DataPanelProps {
  deviceId: string
}

const DataPanel = ({ deviceId }: DataPanelProps) => {
  const { deviceData, selectedComponent } = useStore()

  const componentNames: Record<string, string> = {
    main_motor: '主电机',
    gearbox: '变速箱',
    bearing: '轴承',
  }

  const paramInfo = {
    temperature: { label: '温度', unit: '°C', normal: [20, 80], critical: 100 },
    pressure: { label: '压力', unit: 'hPa', normal: [900, 1200], critical: 1400 },
    rotation_speed: { label: '转速', unit: 'RPM', normal: [2500, 3500], critical: 4000 },
    vibration: { label: '振动', unit: 'mm/s', normal: [0, 1], critical: 2 },
  }

  const getStatus = (param: string, value: number) => {
    const info = paramInfo[param as keyof typeof paramInfo]
    if (!info) return 'normal'
    if (value >= info.critical) return 'critical'
    if (value < info.normal[0] || value > info.normal[1]) return 'warning'
    return 'normal'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'text-red-400 bg-red-900/30'
      case 'warning':
        return 'text-amber-400 bg-amber-900/30'
      default:
        return 'text-emerald-400 bg-emerald-900/30'
    }
  }

  return (
    <div className="card p-4">
      <h3 className="text-lg font-semibold text-white mb-4">实时数据监控</h3>

      <div className="space-y-4">
        {Object.entries(componentNames).map(([componentId, componentName]) => {
          const data = deviceData[componentId]
          const isSelected = selectedComponent === componentId

          if (!data) {
            return (
              <div
                key={componentId}
                className={`p-3 rounded-lg border ${
                  isSelected
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-slate-600 bg-slate-900/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{componentName}</span>
                  <span className="text-xs text-slate-500">等待数据...</span>
                </div>
              </div>
            )
          }

          return (
            <div
              key={componentId}
              className={`p-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-slate-600 bg-slate-900/50 hover:border-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-medium">{componentName}</span>
                <span className="text-xs text-slate-400">
                  {dayjs(data.timestamp).format('HH:mm:ss')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {Object.entries(paramInfo).map(([param, info]) => {
                  const value = data[param as keyof typeof data]
                  if (value === undefined || value === null) return null

                  const status = getStatus(param, value)

                  return (
                    <div
                      key={param}
                      className={`p-2 rounded text-xs ${getStatusColor(status)}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">{info.label}</span>
                        <span className={`font-mono font-bold ${
                          status === 'critical' ? 'text-red-300' :
                          status === 'warning' ? 'text-amber-300' : 'text-emerald-300'
                        }`}>
                          {typeof value === 'number' ? value.toFixed(1) : value}
                          <span className="ml-1 text-xs text-slate-500">
                            {info.unit}
                          </span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DataPanel
