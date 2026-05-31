import logger from '../utils/logger.js'

let io = null
const clients = new Map()

const init = (socketIo) => {
  io = socketIo

  io.on('connection', (socket) => {
    const clientId = socket.id
    logger.info(`WebSocket 客户端连接: ${clientId}`)

    clients.set(clientId, {
      socket,
      userId: null,
      connectedAt: Date.now()
    })

    socket.on('authenticate', async (token) => {
      try {
        socket.emit('authenticated', { success: true })
      } catch (error) {
        socket.emit('authenticated', { success: false, message: '认证失败' })
      }
    })

    socket.on('subscribe', (data) => {
      const { topic } = data
      socket.join(topic)
      logger.info(`客户端 ${clientId} 订阅主题: ${topic}`)
    })

    socket.on('unsubscribe', (data) => {
      const { topic } = data
      socket.leave(topic)
      logger.info(`客户端 ${clientId} 取消订阅主题: ${topic}`)
    })

    socket.on('device:control', async (data) => {
      const { deviceId, command } = data
      logger.info(`收到控制命令 - 设备: ${deviceId}, 命令: ${command}`)
      socket.emit('device:control:ack', { deviceId, success: true })
    })

    socket.on('disconnect', () => {
      logger.info(`WebSocket 客户端断开: ${clientId}`)
      clients.delete(clientId)
    })
  })

  logger.info('WebSocket 服务初始化完成')
}

const broadcast = (event, data) => {
  if (io) {
    io.emit(event, data)
    logger.debug(`广播消息: ${event}`, data)
  }
}

const sendToTopic = (topic, event, data) => {
  if (io) {
    io.to(topic).emit(event, data)
  }
}

const sendToClient = (clientId, event, data) => {
  const client = clients.get(clientId)
  if (client) {
    client.socket.emit(event, data)
  }
}

const getClientCount = () => {
  return clients.size
}

export default {
  init,
  broadcast,
  sendToTopic,
  sendToClient,
  getClientCount
}
