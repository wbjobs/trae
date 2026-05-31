import logger from '../utils/logger.js'
import protocol from '../protocol/index.js'
import TcpServer from './index.js'
import DeviceManager from '../services/deviceManager.js'
import LogService from '../services/logService.js'
import WebSocketService from '../websocket/index.js'
import OfflineCache from '../services/offlineCache.js'

const handle = async (clientId, message) => {
  const { msgType, deviceId, payload } = message

  logger.info(`收到消息 - 设备: ${deviceId}, 类型: ${protocol.MSG_TYPE_NAME[msgType] || '未知'}`)

  try {
    switch (msgType) {
      case protocol.MSG_TYPE.REGISTER:
        await handleRegister(clientId, deviceId, payload)
        break
      case protocol.MSG_TYPE.HEARTBEAT:
        await handleHeartbeat(clientId, deviceId, payload)
        break
      case protocol.MSG_TYPE.DATA_REPORT:
        await handleDataReport(deviceId, payload)
        break
      case protocol.MSG_TYPE.DEVICE_STATUS:
        await handleDeviceStatus(deviceId, payload)
        break
      case protocol.MSG_TYPE.ALARM:
        await handleAlarm(deviceId, payload)
        break
      case protocol.MSG_TYPE.CONTROL_ACK:
        await handleControlAck(deviceId, payload)
        break
      default:
        logger.warn(`未知消息类型: 0x${msgType.toString(16)}`)
    }
  } catch (error) {
    logger.error('处理消息失败:', error)
  }
}

const handleRegister = async (clientId, deviceId, payload) => {
  logger.info(`设备注册: ${deviceId}`, payload)

  TcpServer.setDeviceId(clientId, deviceId)

  const device = await DeviceManager.getDevice(deviceId)
  if (!device) {
    await DeviceManager.addDevice({
      deviceId,
      deviceName: payload.deviceType || deviceId,
      factory: 'factory-a',
      type: payload.deviceType,
      model: payload.model,
      ipAddress: payload.ip
    })
  }

  await DeviceManager.updateDeviceStatus(deviceId, 'online')

  const ackMessage = protocol.buildMessage(deviceId, protocol.MSG_TYPE.REGISTER_ACK, {
    success: true
  })
  const conn = TcpServer.getConnection(deviceId)
  if (conn && ackMessage) {
    conn.socket.write(ackMessage)
  }

  await LogService.addDeviceLog({
    deviceId,
    deviceName: device?.deviceName || deviceId,
    level: 'info',
    module: 'gateway',
    content: `设备注册成功 - 类型: ${payload.deviceType}, 型号: ${payload.model}, 固件: ${payload.firmwareVersion}`,
    source: 'tcp'
  })

  WebSocketService.broadcast('device:status', {
    deviceId,
    deviceName: device?.deviceName || deviceId,
    status: 'online'
  })

  setTimeout(async () => {
    const cacheStats = await OfflineCache.getDeviceCacheStats(deviceId)
    if (cacheStats.totalCount > 0) {
      logger.info(`设备 ${deviceId} 重新上线，存在 ${cacheStats.totalCount} 条缓存消息待补发`)
      await OfflineCache.resendMessages(deviceId)
    }
  }, 1000)
}

const handleHeartbeat = async (clientId, deviceId, payload) => {
  logger.debug(`设备心跳: ${deviceId}`, payload)

  await DeviceManager.updateHeartbeat(deviceId)

  const device = await DeviceManager.getDevice(deviceId)
  if (device && device.status !== 'online') {
    await DeviceManager.updateDeviceStatus(deviceId, 'online')

    WebSocketService.broadcast('device:status', {
      deviceId,
      deviceName: device.deviceName,
      status: 'online'
    })
  }

  const ackMessage = protocol.buildMessage(deviceId, protocol.MSG_TYPE.HEARTBEAT, {
    timestamp: Date.now()
  })
  const conn = TcpServer.getConnection(deviceId)
  if (conn && ackMessage) {
    conn.socket.write(ackMessage)
  }
}

const handleDataReport = async (deviceId, payload) => {
  logger.debug(`数据上报: ${deviceId}`, payload.metrics)

  const device = await DeviceManager.getDevice(deviceId)

  await DeviceManager.updateDeviceMetrics(deviceId, payload.metrics)
  await DeviceManager.writeMetrics(deviceId, payload.metrics)

  await LogService.addDeviceLog({
    deviceId,
    deviceName: device?.deviceName || deviceId,
    level: 'info',
    module: 'metrics',
    content: `数据上报 - ${JSON.stringify(payload.metrics)}`,
    source: 'tcp',
    rawData: payload
  })

  WebSocketService.broadcast('device:update', {
    deviceId,
    deviceName: device?.deviceName || deviceId,
    ...payload.metrics
  })

  if (payload.metrics.temperature > 80 || payload.metrics.pressure > 1.6) {
    const alarmMessage = protocol.buildMessage(deviceId, protocol.MSG_TYPE.ALARM, {
      alarmType: 1,
      alarmLevel: 2,
      alarmCode: payload.metrics.temperature > 80 ? 0x0001 : 0x0002,
      message: payload.metrics.temperature > 80 ? '温度过高' : '压力过高'
    })
    await handleAlarm(deviceId, alarmMessage)
  }
}

const handleDeviceStatus = async (deviceId, payload) => {
  logger.info(`设备状态更新: ${deviceId}`, payload)

  const device = await DeviceManager.getDevice(deviceId)

  await DeviceManager.updateDeviceStatus(deviceId, payload.status)

  if (payload.runtime) {
    await DeviceManager.updateDevice(deviceId, {
      runtime: payload.runtime
    })
  }

  if (payload.status === 'error' || payload.status === 'warning') {
    await LogService.addDeviceLog({
      deviceId,
      deviceName: device?.deviceName || deviceId,
      level: payload.status === 'error' ? 'error' : 'warning',
      module: 'status',
      content: `设备状态异常 - 状态: ${payload.status}, 错误码: 0x${payload.errorCode.toString(16)}`,
      source: 'tcp'
    })
  }

  WebSocketService.broadcast('device:status', {
    deviceId,
    deviceName: device?.deviceName || deviceId,
    status: payload.status,
    errorCode: payload.errorCode
  })
}

const handleAlarm = async (deviceId, payload) => {
  logger.warn(`设备告警: ${deviceId}`, payload)

  const device = await DeviceManager.getDevice(deviceId)

  await LogService.addDeviceLog({
    deviceId,
    deviceName: device?.deviceName || deviceId,
    level: payload.alarmLevel === 'critical' ? 'fatal' : payload.alarmLevel,
    module: 'alarm',
    content: `设备告警 - 类型: ${payload.alarmType}, 代码: 0x${payload.alarmCode.toString(16)}, 消息: ${payload.message}`,
    source: 'tcp'
  })

  await DeviceManager.updateDeviceStatus(deviceId, 'warning')

  WebSocketService.broadcast('device:alarm', {
    deviceId,
    deviceName: device?.deviceName || deviceId,
    alarmLevel: payload.alarmLevel,
    alarmCode: payload.alarmCode,
    message: payload.message
  })
}

const handleControlAck = async (deviceId, payload) => {
  logger.info(`控制命令应答: ${deviceId}`, payload)

  const device = await DeviceManager.getDevice(deviceId)

  await LogService.addDeviceLog({
    deviceId,
    deviceName: device?.deviceName || deviceId,
    level: payload.success ? 'info' : 'error',
    module: 'control',
    content: `控制命令${payload.success ? '执行成功' : '执行失败'} - 命令ID: ${payload.cmdId}, 消息: ${payload.message}`,
    source: 'tcp'
  })
}

const handleDisconnect = async (deviceId) => {
  logger.info(`设备断开: ${deviceId}`)

  const device = await DeviceManager.getDevice(deviceId)
  if (device) {
    await DeviceManager.updateDeviceStatus(deviceId, 'offline')

    await LogService.addOfflineRecord({
      deviceId,
      deviceName: device.deviceName,
      factory: device.factory,
      offlineTime: new Date(),
      lastOnlineTime: device.lastHeartbeat,
      lastHeartbeat: device.lastHeartbeat,
      offlineReason: '网络断开或心跳超时'
    })

    WebSocketService.broadcast('device:status', {
      deviceId,
      deviceName: device.deviceName,
      status: 'offline'
    })
  }
}

export default {
  handle,
  handleDisconnect
}
