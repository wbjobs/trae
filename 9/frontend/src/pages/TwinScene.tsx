import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { deviceApi } from '../services/api'
import { wsService } from '../services/websocket'
import ThreeScene from '../components/ThreeScene'
import DataPanel from '../components/DataPanel'
import DeviceForm from '../components/DeviceForm'
import { alertApi } from '../services/api'

const TwinScene = () => {
  const { devices, currentDevice, setDevices, setCurrentDevice, setActiveAlerts } =
    useStore()
  const [showForm, setShowForm] = useState(false)
  const [simulationRunning, setSimulationRunning] = useState(false)
  const [showFaultPanel, setShowFaultPanel] = useState(false)
  const [faultConfig, setFaultConfig] = useState({
    componentId: 'main_motor',
    parameter: 'temperature',
    targetValue: 90,
    duration: 60,
  })

  useEffect(() => {
    loadDevices()
    loadActiveAlerts()
    wsService.connect()

    return () => {
      wsService.disconnect()
    }
  }, [])

  const loadDevices = async () => {
    try {
      const data = await deviceApi.getAll()
      setDevices(data)
    } catch (error) {
      console.error('Failed to load devices:', error)
    }
  }

  const loadActiveAlerts = async () => {
    try {
      const data = await alertApi.getActive()
      setActiveAlerts(data)
    } catch (error) {
      console.error('Failed to load alerts:', error)
    }
  }

  const handleDeviceSelect = async (deviceId: string) => {
    const device = devices.find((d) => d.device_id === deviceId)
    if (device) {
      setCurrentDevice(device)
      wsService.subscribe(deviceId)
      loadActiveAlerts()
    }
  }

  const handleStartSimulation = async () => {
    if (!currentDevice) return
    try {
      await deviceApi.startSimulation(currentDevice.device_id)
      setSimulationRunning(true)
    } catch (error) {
      console.error('Failed to start simulation:', error)
    }
  }

  const handleStopSimulation = async () => {
    if (!currentDevice) return
    try {
      await deviceApi.stopSimulation(currentDevice.device_id)
      setSimulationRunning(false)
    } catch (error) {
      console.error('Failed to stop simulation:', error)
    }
  }

  const handleSimulateFault = async () => {
    if (!currentDevice) return
    try {
      await deviceApi.simulateFault({
        device_id: currentDevice.device_id,
        component_id: faultConfig.componentId,
        parameter: faultConfig.parameter,
        target_value: faultConfig.targetValue,
        duration: faultConfig.duration,
      })
      setShowFaultPanel(false)
    } catch (error) {
      console.error('Failed to simulate fault:', error)
    }
  }

  if (showForm) {
    return (
      <div className="p-6">
        <button
          className="mb-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          onClick={() => setShowForm(false)}
        >
          ← 返回
        </button>
        <DeviceForm
          onSuccess={() => {
            setShowForm(false)
            loadDevices()
          }}
        />
      </div>
    )
  }

  if (devices.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🏭</div>
        <h2 className="text-2xl font-bold text-white mb-2">暂无设备</h2>
        <p className="text-slate-400 mb-6">请先创建一个设备以开始数字孪生监控</p>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + 创建设备
        </button>
      </div>
    )
  }

  if (!currentDevice) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">📱</div>
        <h2 className="text-2xl font-bold text-white mb-2">请选择设备</h2>
        <p className="text-slate-400 mb-6">从左侧菜单中选择一个设备查看数字孪生场景</p>
        <div className="grid grid-cols-2 gap-4">
          {devices.map((device) => (
            <button
              key={device.id}
              className="card p-6 hover:border-blue-500 transition-colors text-left"
              onClick={() => handleDeviceSelect(device.device_id)}
            >
              <div className="text-lg font-semibold text-white">
                {device.name_cn}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {device.device_id}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                {device.description || '暂无描述'}
              </div>
            </button>
          ))}
        </div>
        <button
          className="mt-6 btn-success"
          onClick={() => setShowForm(true)}
        >
          + 新建设备
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              {currentDevice.name_cn}
            </h1>
            <p className="text-sm text-slate-400">
              {currentDevice.location || '位置未设置'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className={`px-4 py-2 rounded-lg transition-colors ${
                simulationRunning
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
              onClick={simulationRunning ? handleStopSimulation : handleStartSimulation}
            >
              {simulationRunning ? '⏹ 停止模拟' : '▶ 开始数据模拟'}
            </button>
            <button
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
              onClick={() => setShowFaultPanel(!showFaultPanel)}
            >
              🔧 故障模拟
            </button>
            <button
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
              onClick={() => setShowForm(true)}
            >
              + 新建
            </button>
          </div>
        </div>
      </div>

      {showFaultPanel && (
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-white font-medium mb-3">故障模拟配置</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="label">部件</label>
              <select
                className="input-field"
                value={faultConfig.componentId}
                onChange={(e) =>
                  setFaultConfig({ ...faultConfig, componentId: e.target.value })
                }
              >
                <option value="main_motor">主电机</option>
                <option value="gearbox">变速箱</option>
                <option value="bearing">轴承</option>
              </select>
            </div>
            <div>
              <label className="label">参数</label>
              <select
                className="input-field"
                value={faultConfig.parameter}
                onChange={(e) =>
                  setFaultConfig({ ...faultConfig, parameter: e.target.value })
                }
              >
                <option value="temperature">温度</option>
                <option value="pressure">压力</option>
                <option value="rotation_speed">转速</option>
                <option value="vibration">振动</option>
              </select>
            </div>
            <div>
              <label className="label">目标值</label>
              <input
                type="number"
                className="input-field"
                value={faultConfig.targetValue}
                onChange={(e) =>
                  setFaultConfig({ ...faultConfig, targetValue: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label">持续时间（秒）</label>
              <input
                type="number"
                className="input-field"
                value={faultConfig.duration}
                onChange={(e) =>
                  setFaultConfig({ ...faultConfig, duration: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-danger" onClick={handleSimulateFault}>
              触发故障
            </button>
            <button
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
              onClick={() => setShowFaultPanel(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        <div className="flex-1 relative">
          <ThreeScene components={currentDevice.components || []} />
        </div>
        <div className="w-80 border-l border-slate-700 overflow-auto">
          <DataPanel deviceId={currentDevice.device_id} />
        </div>
      </div>
    </div>
  )
}

export default TwinScene
