import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { alertApi } from '../services/api'
import dayjs from 'dayjs'
import type { Alert, AlertStatus } from '../types'

const Alerts = () => {
  const { alerts, activeAlerts, setAlerts, setActiveAlerts, currentDevice } =
    useStore()
  const [filter, setFilter] = useState<AlertStatus | 'all'>('all')
  const [loading, setLoading] = useState(false)

  const componentNames: Record<string, string> = {
    main_motor: '主电机',
    gearbox: '变速箱',
    bearing: '轴承',
  }

  const paramNames: Record<string, string> = {
    temperature: '温度',
    pressure: '压力',
    rotation_speed: '转速',
    vibration: '振动',
  }

  useEffect(() => {
    loadAlerts()
  }, [currentDevice])

  const loadAlerts = async () => {
    try {
      const allAlerts = await alertApi.getAll(currentDevice?.device_id)
      setAlerts(allAlerts)

      const active = await alertApi.getActive(currentDevice?.device_id)
      setActiveAlerts(active)
    } catch (error) {
      console.error('Failed to load alerts:', error)
    }
  }

  const handleAcknowledge = async (alertId: string) => {
    setLoading(true)
    try {
      await alertApi.acknowledge(alertId)
      loadAlerts()
    } catch (error) {
      console.error('Failed to acknowledge alert:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (alertId: string) => {
    setLoading(true)
    try {
      await alertApi.resolve(alertId)
      loadAlerts()
    } catch (error) {
      console.error('Failed to resolve alert:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAlerts =
    filter === 'all'
      ? alerts
      : alerts.filter((a) => a.status === filter)

  const getLevelBadge = (level: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-red-900 text-red-300 border-red-700',
      warning: 'bg-amber-900 text-amber-300 border-amber-700',
      info: 'bg-blue-900 text-blue-300 border-blue-700',
    }
    const labels: Record<string, string> = {
      critical: '严重',
      warning: '警告',
      info: '信息',
    }
    return (
      <span className={`px-2 py-1 rounded text-xs border ${styles[level] || styles.info}`}>
        {labels[level] || level}
      </span>
    )
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-red-900/50 text-red-300',
      acknowledged: 'bg-amber-900/50 text-amber-300',
      resolved: 'bg-emerald-900/50 text-emerald-300',
    }
    const labels: Record<string, string> = {
      active: '活动',
      acknowledged: '已确认',
      resolved: '已解决',
    }
    return (
      <span className={`px-2 py-1 rounded text-xs ${styles[status] || styles.active}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">告警管理</h1>
          <p className="text-slate-400 mt-1">
            管理设备的告警信息，包括确认、处理和记录
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={loadAlerts}
            disabled={loading}
          >
            🔄 刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-3xl font-bold text-white">{alerts.length}</div>
          <div className="text-sm text-slate-400 mt-1">告警总数</div>
        </div>
        <div className="card p-4 border-red-700">
          <div className="text-3xl font-bold text-red-400">
            {activeAlerts.filter((a) => a.status === 'active').length}
          </div>
          <div className="text-sm text-slate-400 mt-1">活动告警</div>
        </div>
        <div className="card p-4 border-amber-700">
          <div className="text-3xl font-bold text-amber-400">
            {activeAlerts.filter((a) => a.status === 'acknowledged').length}
          </div>
          <div className="text-sm text-slate-400 mt-1">已确认</div>
        </div>
        <div className="card p-4 border-emerald-700">
          <div className="text-3xl font-bold text-emerald-400">
            {alerts.filter((a) => a.status === 'resolved').length}
          </div>
          <div className="text-sm text-slate-400 mt-1">已解决</div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            {(['all', 'active', 'acknowledged', 'resolved'] as const).map((f) => (
              <button
                key={f}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' && '全部'}
                {f === 'active' && '活动'}
                {f === 'acknowledged' && '已确认'}
                {f === 'resolved' && '已解决'}
              </button>
            ))}
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <div className="text-4xl mb-2">✅</div>
            <p>暂无告警信息</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getLevelBadge(alert.level)}
                      {getStatusBadge(alert.status)}
                      <span className="text-white font-medium">
                        {componentNames[alert.component_id || ''] || alert.component_id} - {paramNames[alert.parameter] || alert.parameter}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm mb-2">{alert.message}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>
                        当前值: <span className="text-white">{alert.current_value}</span>
                      </span>
                      <span>
                        阈值: <span className="text-white">{alert.threshold}</span>
                      </span>
                      <span>
                        设备: <span className="text-white">{alert.device_id}</span>
                      </span>
                      <span>
                        时间: {dayjs(alert.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {alert.status === 'active' && (
                      <button
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm"
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={loading}
                      >
                        确认
                      </button>
                    )}
                    {alert.status !== 'resolved' && (
                      <button
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm"
                        onClick={() => handleResolve(alert.id)}
                        disabled={loading}
                      >
                        解决
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Alerts
