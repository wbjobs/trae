import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { deviceApi, PlaybackData } from '../services/api'
import dayjs from 'dayjs'
import type { DeviceData, Alert } from '../types'

const Playback = () => {
  const { currentDevice } = useStore()
  const [playbackData, setPlaybackData] = useState<PlaybackData | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [timeRange, setTimeRange] = useState({
    start: dayjs().subtract(1, 'hour').toISOString(),
    end: dayjs().toISOString(),
  })
  const [selectedComponent, setSelectedComponent] = useState<string>('main_motor')
  const [currentData, setCurrentData] = useState<Record<string, DeviceData>>({})
  const [currentAlerts, setCurrentAlerts] = useState<Alert[]>([])

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const componentNames: Record<string, string> = {
    main_motor: '主电机',
    gearbox: '变速箱',
    bearing: '轴承',
  }

  const paramNames: Record<string, { label: string; unit: string }> = {
    temperature: { label: '温度', unit: '°C' },
    pressure: { label: '压力', unit: 'hPa' },
    rotation_speed: { label: '转速', unit: 'RPM' },
    vibration: { label: '振动', unit: 'mm/s' },
  }

  const allDataPoints: DeviceData[] = []
  if (playbackData) {
    for (const comp of Object.keys(playbackData.data_points)) {
      for (const dp of playbackData.data_points[comp]) {
        allDataPoints.push(dp)
      }
    }
  }
  allDataPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const loadPlaybackData = async () => {
    if (!currentDevice) return

    setLoading(true)
    try {
      const data = await deviceApi.getPlaybackData(
        currentDevice.device_id,
        timeRange.start,
        timeRange.end
      )
      setPlaybackData(data)
      setCurrentIndex(0)
      setCurrentData({})
      setCurrentAlerts([])
    } catch (error) {
      console.error('Failed to load playback data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isPlaying || !playbackData || allDataPoints.length === 0) {
      return
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= allDataPoints.length - 1) {
          setIsPlaying(false)
          return prev
        }

        const newDataPoint = allDataPoints[prev]
        setCurrentData((cd) => ({
          ...cd,
          [newDataPoint.component_id || 'device']: newDataPoint,
        }))

        const currentTime = new Date(newDataPoint.timestamp).getTime()
        const alertsInRange = playbackData.alerts.filter(
          (a) => new Date(a.timestamp).getTime() <= currentTime
        )
        setCurrentAlerts(alertsInRange)

        return prev + 1
      })
    }, 500 / playbackSpeed)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, playbackSpeed, playbackData])

  const handlePlayPause = () => {
    if (currentIndex >= allDataPoints.length - 1) {
      setCurrentIndex(0)
      setCurrentData({})
      setCurrentAlerts([])
    }
    setIsPlaying(!isPlaying)
  }

  const handleStop = () => {
    setIsPlaying(false)
    setCurrentIndex(0)
    setCurrentData({})
    setCurrentAlerts([])
  }

  const handleStep = (direction: 'forward' | 'backward') => {
    setIsPlaying(false)
    setCurrentIndex((prev) => {
      const newIndex = direction === 'forward'
        ? Math.min(prev + 1, allDataPoints.length - 1)
        : Math.max(prev - 1, 0)

      if (newIndex >= 0 && newIndex < allDataPoints.length) {
        const newDataPoint = allDataPoints[newIndex]
        setCurrentData((cd) => ({
          ...cd,
          [newDataPoint.component_id || 'device']: newDataPoint,
        }))

        const currentTime = new Date(newDataPoint.timestamp).getTime()
        const alertsInRange = playbackData?.alerts.filter(
          (a) => new Date(a.timestamp).getTime() <= currentTime
        ) || []
        setCurrentAlerts(alertsInRange)
      }

      return newIndex
    })
  }

  if (!currentDevice) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">⏪</div>
        <h2 className="text-2xl font-bold text-white mb-2">请选择设备</h2>
        <p className="text-slate-400">从左侧菜单中选择一个设备查看历史数据回放</p>
      </div>
    )
  }

  const progress = allDataPoints.length > 0 ? (currentIndex / (allDataPoints.length - 1)) * 100 : 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">历史数据回放</h1>
        <p className="text-slate-400 mt-1">
          {currentDevice.name_cn} - 选择时间范围回放设备运行状态
        </p>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="label">开始时间</label>
            <input
              type="datetime-local"
              className="input-field"
              value={dayjs(timeRange.start).format('YYYY-MM-DDTHH:mm')}
              onChange={(e) =>
                setTimeRange({
                  ...timeRange,
                  start: dayjs(e.target.value).toISOString(),
                })
              }
            />
          </div>
          <div>
            <label className="label">结束时间</label>
            <input
              type="datetime-local"
              className="input-field"
              value={dayjs(timeRange.end).format('YYYY-MM-DDTHH:mm')}
              onChange={(e) =>
                setTimeRange({
                  ...timeRange,
                  end: dayjs(e.target.value).toISOString(),
                })
              }
            />
          </div>
          <div>
            <label className="label">回放速度</label>
            <select
              className="input-field"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={5}>5x</option>
              <option value={10}>10x</option>
            </select>
          </div>
          <div className="self-end">
            <button className="btn-primary" onClick={loadPlaybackData} disabled={loading}>
              {loading ? '加载中...' : '加载数据'}
            </button>
          </div>
        </div>
      </div>

      {playbackData && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card p-4">
              <div className="text-3xl font-bold text-blue-400">
                {playbackData.total_data_points}
              </div>
              <div className="text-sm text-slate-400 mt-1">数据点总数</div>
            </div>
            <div className="card p-4">
              <div className="text-3xl font-bold text-amber-400">
                {playbackData.total_alerts}
              </div>
              <div className="text-sm text-slate-400 mt-1">告警数量</div>
            </div>
            <div className="card p-4">
              <div className="text-3xl font-bold text-emerald-400">
                {Object.keys(playbackData.data_points).length}
              </div>
              <div className="text-sm text-slate-400 mt-1">部件数量</div>
            </div>
            <div className="card p-4">
              <div className="text-3xl font-bold text-purple-400">
                {dayjs(playbackData.end_time).diff(playbackData.start_time, 'hour', true).toFixed(1)}h
              </div>
              <div className="text-sm text-slate-400 mt-1">时间范围</div>
            </div>
          </div>

          <div className="card p-4 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <button
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                onClick={() => handleStep('backward')}
                disabled={currentIndex === 0}
              >
                ⏮
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-white ${
                  isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                onClick={handlePlayPause}
              >
                {isPlaying ? '⏸ 暂停' : '▶ 播放'}
              </button>
              <button
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                onClick={() => handleStep('forward')}
                disabled={currentIndex >= allDataPoints.length - 1}
              >
                ⏭
              </button>
              <button
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                onClick={handleStop}
              >
                ⏹ 停止
              </button>
              <div className="flex-1 text-center text-slate-400">
                {currentIndex + 1} / {allDataPoints.length}
              </div>
            </div>
            <div className="relative h-2 bg-slate-700 rounded-full">
              <div
                className="absolute h-full bg-blue-600 rounded-full transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-slate-500">
              <span>{dayjs(playbackData.start_time).format('HH:mm:ss')}</span>
              <span>
                {allDataPoints[currentIndex]?.timestamp
                  ? dayjs(allDataPoints[currentIndex].timestamp).format('HH:mm:ss')
                  : '--'}
              </span>
              <span>{dayjs(playbackData.end_time).format('HH:mm:ss')}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {Object.keys(componentNames).map((compId) => {
              const data = currentData[compId]
              const isSelected = selectedComponent === compId

              return (
                <div
                  key={compId}
                  className={`card p-4 cursor-pointer transition-colors ${
                    isSelected ? 'border-blue-500' : ''
                  }`}
                  onClick={() => setSelectedComponent(compId)}
                >
                  <h3 className="text-lg font-semibold text-white mb-3">
                    {componentNames[compId]}
                  </h3>
                  {data ? (
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(paramNames).map(([param, info]) => {
                        const value = data[param as keyof DeviceData] as number | undefined
                        return (
                          <div key={param} className="text-xs">
                            <div className="text-slate-500">{info.label}</div>
                            <div className="text-emerald-400 font-mono">
                              {value !== undefined
                                ? `${typeof value === 'number' ? value.toFixed(1) : value} ${info.unit}`
                                : '--'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm">等待数据...</div>
                  )}
                </div>
              )
            })}
          </div>

          {currentAlerts.length > 0 && (
            <div className="card p-4">
              <h3 className="text-lg font-semibold text-white mb-3">
                告警记录 ({currentAlerts.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-auto">
                {currentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg ${
                      alert.level === 'critical'
                        ? 'bg-red-900/30 border border-red-700'
                        : 'bg-amber-900/30 border border-amber-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs mr-2 ${
                            alert.level === 'critical'
                              ? 'bg-red-900 text-red-300'
                              : 'bg-amber-900 text-amber-300'
                          }`}
                        >
                          {alert.level === 'critical' ? '严重' : '警告'}
                        </span>
                        <span className="text-white">{alert.message}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {dayjs(alert.timestamp).format('HH:mm:ss')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!playbackData && !loading && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-slate-400">选择时间范围后点击"加载数据"开始回放</p>
        </div>
      )}
    </div>
  )
}

export default Playback
