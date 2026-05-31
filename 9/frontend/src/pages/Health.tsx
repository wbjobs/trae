import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { deviceApi, HealthScore } from '../services/api'
import dayjs from 'dayjs'

const Health = () => {
  const { currentDevice } = useStore()
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeWindow, setTimeWindow] = useState(24)

  const componentNames: Record<string, string> = {
    main_motor: '主电机',
    gearbox: '变速箱',
    bearing: '轴承',
  }

  const loadHealthScore = async () => {
    if (!currentDevice) return

    setLoading(true)
    try {
      const score = await deviceApi.getHealthScore(
        currentDevice.device_id,
        timeWindow
      )
      setHealthScore(score)
    } catch (error) {
      console.error('Failed to load health score:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentDevice) {
      loadHealthScore()
    }
  }, [currentDevice, timeWindow])

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400'
    if (score >= 70) return 'text-blue-400'
    if (score >= 50) return 'text-amber-400'
    return 'text-red-400'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-900/30 border-emerald-700'
    if (score >= 70) return 'bg-blue-900/30 border-blue-700'
    if (score >= 50) return 'bg-amber-900/30 border-amber-700'
    return 'bg-red-900/30 border-red-700'
  }

  const getLevelLabel = (level: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      excellent: { label: '优秀', color: 'text-emerald-400' },
      good: { label: '良好', color: 'text-blue-400' },
      fair: { label: '一般', color: 'text-amber-400' },
      poor: { label: '较差', color: 'text-red-400' },
    }
    return labels[level] || { label: level, color: 'text-white' }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { label: string; color: string; bg: string }> = {
      normal: { label: '正常', color: 'text-emerald-300', bg: 'bg-emerald-900/50' },
      warning: { label: '警告', color: 'text-amber-300', bg: 'bg-amber-900/50' },
      critical: { label: '严重', color: 'text-red-300', bg: 'bg-red-900/50' },
    }
    return labels[status] || { label: status, color: 'text-white', bg: 'bg-slate-700' }
  }

  if (!currentDevice) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">❤️</div>
        <h2 className="text-2xl font-bold text-white mb-2">请选择设备</h2>
        <p className="text-slate-400">从左侧菜单中选择一个设备查看健康度评估</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">设备健康度评估</h1>
          <p className="text-slate-400 mt-1">
            {currentDevice.name_cn} - 基于运行数据和告警记录的健康度评分
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label className="label">时间窗口</label>
            <select
              className="input-field"
              value={timeWindow}
              onChange={(e) => setTimeWindow(Number(e.target.value))}
            >
              <option value={1}>最近1小时</option>
              <option value={6}>最近6小时</option>
              <option value={12}>最近12小时</option>
              <option value={24}>最近24小时</option>
              <option value={72}>最近3天</option>
              <option value={168}>最近7天</option>
            </select>
          </div>
          <div className="self-end">
            <button className="btn-primary" onClick={loadHealthScore} disabled={loading}>
              {loading ? '计算中...' : '🔄 刷新'}
            </button>
          </div>
        </div>
      </div>

      {healthScore && (
        <>
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div
              className={`card p-6 text-center border-2 ${getScoreBgColor(healthScore.score)}`}
            >
              <div className="text-sm text-slate-400 mb-2">健康度评分</div>
              <div className={`text-6xl font-bold ${getScoreColor(healthScore.score)}`}>
                {healthScore.score}
              </div>
              <div className="text-sm text-slate-500 mt-1">/ 100</div>
              <div className={`text-lg font-medium mt-3 ${getLevelLabel(healthScore.level).color}`}>
                {getLevelLabel(healthScore.level).label}
              </div>
            </div>

            <div className="card p-6 text-center">
              <div className="text-sm text-slate-400 mb-2">设备状态</div>
              <div
                className={`inline-block px-4 py-2 rounded-lg ${getStatusLabel(healthScore.status).bg}`}
              >
                <span className={`text-2xl font-bold ${getStatusLabel(healthScore.status).color}`}>
                  {getStatusLabel(healthScore.status).label}
                </span>
              </div>
              <div className="text-sm text-slate-500 mt-4">
                评估时间: {dayjs(healthScore.calculated_at).format('YYYY-MM-DD HH:mm:ss')}
              </div>
            </div>

            <div className="card p-6">
              <div className="text-sm text-slate-400 mb-3 text-center">告警统计</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-red-400">
                    {healthScore.alert_summary.critical}
                  </div>
                  <div className="text-xs text-slate-500">严重</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-400">
                    {healthScore.alert_summary.warning}
                  </div>
                  <div className="text-xs text-slate-500">警告</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">
                    {healthScore.alert_summary.info}
                  </div>
                  <div className="text-xs text-slate-500">信息</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">部件健康度</h3>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(healthScore.component_health).map(([compId, health]) => {
                const statusInfo = getStatusLabel(health.status)
                return (
                  <div
                    key={compId}
                    className={`p-4 rounded-lg border ${
                      health.status === 'critical'
                        ? 'bg-red-900/20 border-red-700'
                        : health.status === 'warning'
                        ? 'bg-amber-900/20 border-amber-700'
                        : 'bg-emerald-900/20 border-emerald-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-white font-medium">
                        {componentNames[compId] || compId}
                      </div>
                      <span className={`text-3xl font-bold ${getScoreColor(health.score)}`}>
                        {health.score}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          health.score >= 70
                            ? 'bg-emerald-500'
                            : health.score >= 50
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${health.score}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span
                        className={`px-2 py-0.5 rounded ${statusInfo.bg}`}
                      >
                        {statusInfo.label}
                      </span>
                      <span>
                        {health.latest_data
                          ? dayjs(health.latest_data.timestamp).format('HH:mm:ss')
                          : '暂无数据'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">运维建议</h3>
            <div className="space-y-2">
              {healthScore.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                >
                  <span className="text-slate-300">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!healthScore && loading && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-2">⏳</div>
          <p className="text-slate-400">正在计算健康度...</p>
        </div>
      )}
    </div>
  )
}

export default Health
