import { createServer } from 'net'
import logger from '../utils/logger.js'
import protocol from '../protocol/index.js'
import MessageHandler from './handler.js'

let server = null
const connections = new Map()

const findNextHeader = (buffer) => {
  const header = 0xAA55
  for (let i = 0; i <= buffer.length - 2; i++) {
    if (buffer.readUInt16BE(i) === header) {
      return i
    }
  }
  return -1
}

const start = (port) => {
  server = createServer((socket) => {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`
    logger.info(`TCP 客户端连接: ${clientId}`)

    socket.setNoDelay(true)
    socket.setKeepAlive(true, 60000)

    connections.set(clientId, {
      socket,
      deviceId: null,
      connectedAt: Date.now(),
      lastMessageAt: Date.now()
    })

    let buffer = Buffer.alloc(0)

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])
      const conn = connections.get(clientId)
      if (conn) {
        conn.lastMessageAt = Date.now()
      }

      while (buffer.length >= 12) {
        const headerIndex = findNextHeader(buffer)
        if (headerIndex === -1) {
          buffer = buffer.slice(-11)
          break
        }

        if (headerIndex > 0) {
          logger.warn(`丢弃无效数据 ${headerIndex} 字节，寻找协议头`)
          buffer = buffer.slice(headerIndex)
        }

        const msg = protocol.parseMessage(buffer)
        if (!msg) {
          buffer = buffer.slice(2)
          continue
        }

        const totalLen = msg.msgLen + 12
        if (buffer.length >= totalLen) {
          buffer = buffer.slice(totalLen)
          MessageHandler.handle(clientId, msg)
        } else {
          break
        }
      }
    })

    socket.on('error', (error) => {
      logger.error(`TCP 客户端错误 ${clientId}:`, error)
    })

    socket.on('close', () => {
      logger.info(`TCP 客户端断开: ${clientId}`)
      const conn = connections.get(clientId)
      if (conn && conn.deviceId) {
        MessageHandler.handleDisconnect(conn.deviceId)
      }
      connections.delete(clientId)
    })

    socket.on('timeout', () => {
      logger.warn(`TCP 客户端超时: ${clientId}`)
      socket.end()
    })
  })

  server.listen(port, () => {
    logger.info(`TCP 服务监听端口: ${port}`)
  })

  server.on('error', (error) => {
    logger.error('TCP 服务错误:', error)
  })

  setInterval(checkHeartbeat, 15000)
}

const stop = () => {
  if (server) {
    server.close()
    server = null
  }
  connections.clear()
}

const sendMessage = (deviceId, msgType, payload) => {
  for (const [clientId, conn] of connections.entries()) {
    if (conn.deviceId === deviceId) {
      const msg = protocol.buildMessage(deviceId, msgType, payload)
      if (msg) {
        conn.socket.write(msg)
        return true
      }
    }
  }
  return false
}

const getConnection = (deviceId) => {
  for (const conn of connections.values()) {
    if (conn.deviceId === deviceId) {
      return conn
    }
  }
  return null
}

const getAllConnections = () => {
  return Array.from(connections.values())
}

const checkHeartbeat = () => {
  const now = Date.now()
  const timeout = process.env.OFFLINE_THRESHOLD || 45000

  for (const [clientId, conn] of connections.entries()) {
    if (now - conn.lastMessageAt > timeout) {
      logger.warn(`TCP 连接心跳超时: ${clientId}`)
      if (conn.deviceId) {
        MessageHandler.handleDisconnect(conn.deviceId)
      }
      conn.socket.end()
      connections.delete(clientId)
    }
  }
}

const setDeviceId = (clientId, deviceId) => {
  const conn = connections.get(clientId)
  if (conn) {
    conn.deviceId = deviceId
    return true
  }
  return false
}

export default {
  start,
  stop,
  sendMessage,
  getConnection,
  getAllConnections,
  setDeviceId
}
