import logger from '../utils/logger.js'
import redis from '../utils/redis.js'
import influxdb from '../utils/influxdb.js'
import { Device } from '../models/Device.js'

const DEVICE_CACHE_KEY = 'devices:cache'
const DEVICE_STATUS_KEY = 'devices:status'

let devices = new Map()

const init = async () => {
  try {
    const dbDevices = await Device.findAll()
    for (const device of dbDevices) {
      devices.set(device.deviceId, device.toJSON())
    }
    logger.info(`设备管理器初始化完成，共加载 ${devices.size} 台设备`)
  } catch (error) {
    logger.error('设备管理器初始化失败:', error)
  }
}

const getDevice = async (deviceId) => {
  if (devices.has(deviceId)) {
    return devices.get(deviceId)
  }

  try {
    const device = await Device.findOne({ where: { deviceId } })
    if (device) {
      const deviceData = device.toJSON()
      devices.set(deviceId, deviceData)
      return deviceData
    }
  } catch (error) {
    logger.error(`获取设备信息失败 ${deviceId}:`, error)
  }

  return null
}

const getAllDevices = async (filters = {}) => {
  try {
    const where = {}
    if (filters.factory) {
      where.factory = filters.factory
    }
    if (filters.status) {
      where.status = filters.status
    }

    const deviceList = await Device.findAll({ where })
    return deviceList.map(d => d.toJSON())
  } catch (error) {
    logger.error('获取设备列表失败:', error)
    return []
  }
}

const getDeviceStats = async (factory = null) => {
  try {
    const where = factory ? { factory } : {}
    const allDevices = await Device.findAll({ where })

    const stats = {
      totalCount: allDevices.length,
      onlineCount: allDevices.filter(d => d.status === 'online').length,
      offlineCount: allDevices.filter(d => d.status === 'offline').length,
      warningCount: allDevices.filter(d => d.status === 'warning' || d.status === 'error').length
    }

    return stats
  } catch (error) {
    logger.error('获取设备统计失败:', error)
    return {
      totalCount: 0,
      onlineCount: 0,
      offlineCount: 0,
      warningCount: 0
    }
  }
}

const addDevice = async (deviceData) => {
  try {
    const [device, created] = await Device.findOrCreate({
      where: { deviceId: deviceData.deviceId },
      defaults: deviceData
    })

    const deviceJson = device.toJSON()
    devices.set(device.deviceId, deviceJson)

    if (created) {
      logger.info(`新增设备: ${device.deviceId}`)
    }

    return deviceJson
  } catch (error) {
    logger.error('添加设备失败:', error)
    throw error
  }
}

const updateDevice = async (deviceId, updates) => {
  try {
    await Device.update(updates, { where: { deviceId } })
    const device = await Device.findOne({ where: { deviceId } })
    if (device) {
      const deviceJson = device.toJSON()
      devices.set(deviceId, deviceJson)
      return deviceJson
    }
  } catch (error) {
    logger.error(`更新设备失败 ${deviceId}:`, error)
  }
  return null
}

const updateDeviceStatus = async (deviceId, status) => {
  const now = new Date()
  return updateDevice(deviceId, {
    status,
    lastHeartbeat: now,
    updatedAt: now
  })
}

const updateHeartbeat = async (deviceId) => {
  const now = new Date()
  return updateDevice(deviceId, {
    lastHeartbeat: now,
    updatedAt: now
  })
}

const updateDeviceMetrics = async (deviceId, metrics) => {
  const updates = {}
  const now = new Date()

  if (metrics.temperature !== undefined) {
    updates.temperature = metrics.temperature
  }
  if (metrics.pressure !== undefined) {
    updates.pressure = metrics.pressure
  }

  updates.lastReport = now
  updates.updatedAt = now

  return updateDevice(deviceId, updates)
}

const writeMetrics = async (deviceId, metrics) => {
  try {
    const device = await getDevice(deviceId)

    await influxdb.writeMetrics(deviceId, {
      ...metrics,
      factory: device?.factory,
      type: device?.type,
      timestamp: Date.now()
    })

    logger.debug(`写入时序数据: ${deviceId}`, metrics)
  } catch (error) {
    logger.error(`写入时序数据失败 ${deviceId}:`, error)
  }
}

const getDeviceMetrics = async (deviceId, startTime, endTime) => {
  try {
    const start = startTime || '-24h'
    const stop = endTime || 'now()'

    const data = await influxdb.queryMetrics(deviceId, start, stop)

    const timeMap = new Map()

    for (const row of data) {
      const timeKey = new Date(row._time).toISOString()
      const displayTime = new Date(row._time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

      if (!timeMap.has(timeKey)) {
        timeMap.set(timeKey, {
          time: displayTime,
          temperature: null,
          pressure: null
        })
      }

      const entry = timeMap.get(timeKey)
      if (row._field === 'temperature') {
        entry.temperature = row._value
      } else if (row._field === 'pressure') {
        entry.pressure = row._value
      }
    }

    const sortedTimes = Array.from(timeMap.keys()).sort()
    const result = {
      timestamps: [],
      temperatures: [],
      pressures: []
    }

    for (const timeKey of sortedTimes) {
      const entry = timeMap.get(timeKey)
      result.timestamps.push(entry.time)
      result.temperatures.push(entry.temperature)
      result.pressures.push(entry.pressure)
    }

    return result
  } catch (error) {
    logger.error(`查询设备指标失败 ${deviceId}:`, error)
    return {
      timestamps: [],
      temperatures: [],
      pressures: []
    }
  }
}

const deleteDevice = async (deviceId) => {
  try {
    await Device.destroy({ where: { deviceId } })
    devices.delete(deviceId)
    logger.info(`删除设备: ${deviceId}`)
    return true
  } catch (error) {
    logger.error(`删除设备失败 ${deviceId}:`, error)
    return false
  }
}

export default {
  init,
  getDevice,
  getAllDevices,
  getDeviceStats,
  addDevice,
  updateDevice,
  updateDeviceStatus,
  updateHeartbeat,
  updateDeviceMetrics,
  writeMetrics,
  getDeviceMetrics,
  deleteDevice
}
