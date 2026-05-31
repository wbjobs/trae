import { crc16modbus } from 'crc'
import logger from '../utils/logger.js'

export const PROTOCOL_HEADER = 0xAA55
export const PROTOCOL_TAIL = 0x55AA

export const MSG_TYPE = {
  HEARTBEAT: 0x0001,
  DATA_REPORT: 0x0002,
  DEVICE_STATUS: 0x0003,
  ALARM: 0x0004,
  CONTROL_CMD: 0x0005,
  CONTROL_ACK: 0x0006,
  REGISTER: 0x0007,
  REGISTER_ACK: 0x0008
}

export const MSG_TYPE_NAME = {
  [MSG_TYPE.HEARTBEAT]: '心跳包',
  [MSG_TYPE.DATA_REPORT]: '数据上报',
  [MSG_TYPE.DEVICE_STATUS]: '设备状态',
  [MSG_TYPE.ALARM]: '告警',
  [MSG_TYPE.CONTROL_CMD]: '控制命令',
  [MSG_TYPE.CONTROL_ACK]: '控制应答',
  [MSG_TYPE.REGISTER]: '注册',
  [MSG_TYPE.REGISTER_ACK]: '注册应答'
}

export const parseMessage = (buffer) => {
  try {
    let offset = 0

    if (buffer.length < 13) {
      return null
    }

    const header = buffer.readUInt16BE(offset)
    offset += 2

    if (header !== PROTOCOL_HEADER) {
      return null
    }

    const msgType = buffer.readUInt16BE(offset)
    offset += 2

    const msgLen = buffer.readUInt32BE(offset)
    offset += 4

    if (msgLen < 1 || msgLen > 65535) {
      logger.warn(`无效的消息长度: ${msgLen}`)
      return null
    }

    const totalLen = 12 + msgLen
    if (buffer.length < totalLen) {
      return null
    }

    const deviceIdLen = buffer.readUInt8(offset)
    offset += 1

    if (deviceIdLen < 1 || deviceIdLen > 64) {
      logger.warn(`无效的设备ID长度: ${deviceIdLen}`)
      return null
    }

    if (deviceIdLen + 1 > msgLen) {
      logger.warn(`设备ID长度超出消息长度范围`)
      return null
    }

    const deviceId = buffer.toString('utf8', offset, offset + deviceIdLen)
    offset += deviceIdLen

    const payloadLen = msgLen - deviceIdLen - 1
    const payload = buffer.slice(offset, offset + payloadLen)
    offset += payloadLen

    const crc = buffer.readUInt16BE(offset)
    offset += 2

    const tail = buffer.readUInt16BE(offset)
    offset += 2

    if (tail !== PROTOCOL_TAIL) {
      logger.warn(`无效的协议尾: 0x${tail.toString(16)}`)
      return null
    }

    const calculatedCrc = calculateCRC(buffer.slice(2, offset - 4))
    if (crc !== calculatedCrc) {
      logger.warn(`CRC校验失败: 收到 0x${crc.toString(16)}, 计算 0x${calculatedCrc.toString(16)}`)
      return null
    }

    const parsedPayload = parsePayload(msgType, payload)

    return {
      header,
      msgType,
      msgLen,
      deviceId,
      payload: parsedPayload,
      rawPayload: payload,
      crc,
      tail,
      timestamp: Date.now()
    }
  } catch (error) {
    logger.error('解析消息失败:', error)
    return null
  }
}

const parsePayload = (msgType, payload) => {
  try {
    let jsonData = null
    try {
      jsonData = JSON.parse(payload.toString('utf8'))
    } catch (e) {
      jsonData = null
    }

    if (jsonData) {
      return parseJsonPayload(msgType, jsonData)
    }

    switch (msgType) {
      case MSG_TYPE.HEARTBEAT:
        return parseHeartbeat(payload)
      case MSG_TYPE.DATA_REPORT:
        return parseDataReport(payload)
      case MSG_TYPE.DEVICE_STATUS:
        return parseDeviceStatus(payload)
      case MSG_TYPE.ALARM:
        return parseAlarm(payload)
      case MSG_TYPE.REGISTER:
        return parseRegister(payload)
      case MSG_TYPE.CONTROL_ACK:
        return parseControlAck(payload)
      default:
        return { raw: payload.toString('hex') }
    }
  } catch (error) {
    logger.error(`解析负载失败 (类型: 0x${msgType.toString(16)}):`, error)
    return { raw: payload.toString('hex') }
  }
}

const parseJsonPayload = (msgType, data) => {
  switch (msgType) {
    case MSG_TYPE.HEARTBEAT:
      return {
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        status: data.status || 'online',
        signalStrength: data.signal || 100
      }
    case MSG_TYPE.DATA_REPORT:
      return {
        dataType: data.dataType || 0,
        metrics: data.metrics || {}
      }
    case MSG_TYPE.REGISTER:
      return {
        deviceType: data.deviceType || '',
        model: data.model || '',
        firmwareVersion: data.firmware || '',
        ip: data.ip || ''
      }
    case MSG_TYPE.CONTROL_ACK:
      return {
        cmdId: data.cmdId || 0,
        success: data.success !== false,
        message: data.message || ''
      }
    default:
      return data
  }
}

const parseHeartbeat = (payload) => {
  let offset = 0
  const timestamp = payload.readUInt32BE(offset)
  offset += 4
  const status = payload.readUInt8(offset)
  offset += 1
  const signal = payload.readUInt8(offset)
  offset += 1

  return {
    timestamp: new Date(timestamp * 1000),
    status: status === 1 ? 'online' : 'offline',
    signalStrength: signal
  }
}

const parseDataReport = (payload) => {
  let offset = 0
  const dataType = payload.readUInt8(offset)
  offset += 1

  const metrics = {}

  const dataPoints = payload.readUInt8(offset)
  offset += 1

  for (let i = 0; i < dataPoints; i++) {
    if (offset + 5 > payload.length) break

    const tag = payload.readUInt8(offset)
    offset += 1
    const value = payload.readFloatBE(offset)
    offset += 4

    const tagMap = {
      0x01: 'temperature',
      0x02: 'pressure',
      0x03: 'flow',
      0x04: 'humidity',
      0x05: 'vibration',
      0x06: 'current',
      0x07: 'voltage',
      0x08: 'power',
      0x09: 'rpm',
      0x0A: 'load'
    }

    const fieldName = tagMap[tag] || `unknown_${tag}`
    metrics[fieldName] = value
  }

  return {
    dataType,
    metrics
  }
}

const parseDeviceStatus = (payload) => {
  let offset = 0
  const status = payload.readUInt8(offset)
  offset += 1
  const errorCode = payload.readUInt16BE(offset)
  offset += 2
  const runtime = payload.readUInt32BE(offset)
  offset += 4

  const statusMap = {
    0: 'offline',
    1: 'online',
    2: 'warning',
    3: 'error'
  }

  return {
    status: statusMap[status] || 'unknown',
    errorCode,
    runtime
  }
}

const parseAlarm = (payload) => {
  let offset = 0
  const alarmType = payload.readUInt8(offset)
  offset += 1
  const alarmLevel = payload.readUInt8(offset)
  offset += 1
  const alarmCode = payload.readUInt16BE(offset)
  offset += 2
  const messageLen = payload.readUInt8(offset)
  offset += 1
  const message = payload.toString('utf8', offset, offset + messageLen)

  const levelMap = {
    1: 'info',
    2: 'warning',
    3: 'error',
    4: 'critical'
  }

  return {
    alarmType,
    alarmLevel: levelMap[alarmLevel] || 'unknown',
    alarmCode,
    message
  }
}

const parseRegister = (payload) => {
  let offset = 0
  const deviceTypeLen = payload.readUInt8(offset)
  offset += 1
  const deviceType = payload.toString('utf8', offset, offset + deviceTypeLen)
  offset += deviceTypeLen

  const modelLen = payload.readUInt8(offset)
  offset += 1
  const model = payload.toString('utf8', offset, offset + modelLen)
  offset += modelLen

  const firmwareLen = payload.readUInt8(offset)
  offset += 1
  const firmwareVersion = payload.toString('utf8', offset, offset + firmwareLen)
  offset += firmwareLen

  const ip = Array.from(payload.slice(offset, offset + 4)).join('.')
  offset += 4

  return {
    deviceType,
    model,
    firmwareVersion,
    ip
  }
}

const parseControlAck = (payload) => {
  let offset = 0
  const cmdId = payload.readUInt16BE(offset)
  offset += 2
  const result = payload.readUInt8(offset)
  offset += 1
  const messageLen = payload.readUInt8(offset)
  offset += 1
  const message = payload.toString('utf8', offset, offset + messageLen)

  return {
    cmdId,
    success: result === 0,
    message
  }
}

export const buildMessage = (deviceId, msgType, payloadData) => {
  try {
    const deviceIdBuffer = Buffer.from(deviceId, 'utf8')
    const payloadBuffer = buildPayload(msgType, payloadData)

    const msgLen = deviceIdBuffer.length + 1 + payloadBuffer.length

    const headerBuffer = Buffer.alloc(8)
    headerBuffer.writeUInt16BE(PROTOCOL_HEADER, 0)
    headerBuffer.writeUInt16BE(msgType, 2)
    headerBuffer.writeUInt32BE(msgLen, 4)

    const deviceIdLenBuffer = Buffer.alloc(1)
    deviceIdLenBuffer.writeUInt8(deviceIdBuffer.length, 0)

    const crcData = Buffer.concat([
      headerBuffer.slice(2, 8),
      deviceIdLenBuffer,
      deviceIdBuffer,
      payloadBuffer
    ])
    const crc = calculateCRC(crcData)

    const crcBuffer = Buffer.alloc(2)
    crcBuffer.writeUInt16BE(crc, 0)

    const tailBuffer = Buffer.alloc(2)
    tailBuffer.writeUInt16BE(PROTOCOL_TAIL, 0)

    return Buffer.concat([
      headerBuffer,
      deviceIdLenBuffer,
      deviceIdBuffer,
      payloadBuffer,
      crcBuffer,
      tailBuffer
    ])
  } catch (error) {
    logger.error('构建消息失败:', error)
    return null
  }
}

const buildPayload = (msgType, data) => {
  switch (msgType) {
    case MSG_TYPE.CONTROL_CMD:
      return buildControlCommand(data)
    case MSG_TYPE.REGISTER_ACK:
      return buildRegisterAck(data)
    case MSG_TYPE.HEARTBEAT:
      return buildHeartbeatAck(data)
    default:
      return Buffer.alloc(0)
  }
}

const buildControlCommand = (data) => {
  const cmdId = data.cmdId || 0
  const cmdType = data.cmdType || 0
  const params = data.params || {}

  const paramsStr = JSON.stringify(params)
  const paramsBuffer = Buffer.from(paramsStr, 'utf8')

  const buffer = Buffer.alloc(3 + paramsBuffer.length)
  buffer.writeUInt16BE(cmdId, 0)
  buffer.writeUInt8(cmdType, 2)
  paramsBuffer.copy(buffer, 3)

  return buffer
}

const buildRegisterAck = (data) => {
  const buffer = Buffer.alloc(1)
  buffer.writeUInt8(data.success ? 0 : 1, 0)
  return buffer
}

const buildHeartbeatAck = (data) => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(Math.floor(Date.now() / 1000), 0)
  return buffer
}

const calculateCRC = (buffer) => {
  return crc16modbus(buffer)
}

export default {
  PROTOCOL_HEADER,
  PROTOCOL_TAIL,
  MSG_TYPE,
  MSG_TYPE_NAME,
  parseMessage,
  buildMessage,
  calculateCRC
}
