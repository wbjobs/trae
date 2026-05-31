import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import logger from '../utils/logger.js'
import redis from '../utils/redis.js'
import protocol from '../protocol/index.js'
import TcpServer from '../tcp/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CACHE_DIR = path.join(__dirname, '../../data', 'offline-cache')
const REDIS_KEY = 'offline:cache'
const MAX_CACHE_SIZE = 10000
const MAX_FILE_SIZE = 100 * 1024 * 1024
const RETRY_INTERVAL = 5000
const MAX_RETRY_COUNT = 3

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

const pendingMessages = new Map()
const retryTimers = new Map()

const getCacheFilePath = (deviceId) => {
  return path.join(CACHE_DIR, `${deviceId}.log`)
}

const appendToFile = async (deviceId, message) => {
  try {
    const filePath = getCacheFilePath(deviceId)
    const line = JSON.stringify({
      ...message,
      cachedAt: Date.now()
    }) + '\n'
    fs.appendFileSync(filePath, line)
    
    const stats = fs.statSync(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      logger.warn(`设备 ${deviceId} 缓存文件超过限制，进行截断`)
      const content = fs.readFileSync(filePath, 'utf8')
      const lines = content.split('\n').slice(-5000).join('\n')
      fs.writeFileSync(filePath, lines)
    }
  } catch (error) {
    logger.error(`写入缓存文件失败 ${deviceId}:`, error)
  }
}

const readFromFile = async (deviceId) => {
  try {
    const filePath = getCacheFilePath(deviceId)
    if (!fs.existsSync(filePath)) {
      return []
    }
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(l => l.trim())
    return lines.map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    }).filter(msg => msg !== null)
  } catch (error) {
    logger.error(`读取缓存文件失败 ${deviceId}:`, error)
    return []
  }
}

const clearFileCache = async (deviceId) => {
  try {
    const filePath = getCacheFilePath(deviceId)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    logger.error(`清理缓存文件失败 ${deviceId}:`, error)
  }
}

const cacheMessage = async (deviceId, message) => {
  try {
    const msgToCache = {
      deviceId,
      msgType: message.msgType,
      payload: message.payload,
      timestamp: Date.now()
    }

    await redis.hSet(`${REDIS_KEY}:${deviceId}`, `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, msgToCache)

    appendToFile(deviceId, msgToCache)

    if (!pendingMessages.has(deviceId)) {
      pendingMessages.set(deviceId, [])
    }
    const deviceQueue = pendingMessages.get(deviceId)
    deviceQueue.push(msgToCache)
    
    if (deviceQueue.length > MAX_CACHE_SIZE) {
      deviceQueue.shift()
    }

    logger.debug(`缓存消息 - 设备: ${deviceId}, 类型: ${protocol.MSG_TYPE_NAME[message.msgType]}, 缓存数量: ${deviceQueue.length}`)
  } catch (error) {
    logger.error(`缓存消息失败 ${deviceId}:`, error)
  }
}

const getCachedMessages = async (deviceId) => {
  try {
    const fromRedis = await redis.hGetAll(`${REDIS_KEY}:${deviceId}`)
    const fromFile = await readFromFile(deviceId)
    
    const allMessages = [...fromRedis, ...fromFile]
    
    const uniqueMap = new Map()
    for (const msg of allMessages) {
      const key = `${msg.timestamp}_${msg.msgType}`
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, msg)
      }
    }
    
    return Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp)
  } catch (error) {
    logger.error(`获取缓存消息失败 ${deviceId}:`, error)
    return []
  }
}

const clearCache = async (deviceId) => {
  try {
    await redis.del(`${REDIS_KEY}:${deviceId}`)
    await clearFileCache(deviceId)
    pendingMessages.delete(deviceId)
    
    if (retryTimers.has(deviceId)) {
      clearTimeout(retryTimers.get(deviceId))
      retryTimers.delete(deviceId)
    }
    
    logger.info(`清理设备 ${deviceId} 缓存`)
  } catch (error) {
    logger.error(`清理缓存失败 ${deviceId}:`, error)
  }
}

const resendMessages = async (deviceId) => {
  try {
    const conn = TcpServer.getConnection(deviceId)
    if (!conn) {
      logger.warn(`设备 ${deviceId} 不在线，无法补发消息`)
      return false
    }

    const messages = await getCachedMessages(deviceId)
    if (messages.length === 0) {
      logger.info(`设备 ${deviceId} 没有缓存消息需要补发`)
      return true
    }

    logger.info(`开始补发设备 ${deviceId} 的缓存消息，共 ${messages.length} 条`)

    let successCount = 0
    let failCount = 0

    for (const msg of messages) {
      try {
        const message = protocol.buildMessage(deviceId, msg.msgType, msg.payload)
        if (message) {
          conn.socket.write(message)
          successCount++
        } else {
          failCount++
        }
        await new Promise(resolve => setTimeout(resolve, 10))
      } catch (error) {
        failCount++
        logger.error(`补发消息失败 ${deviceId}:`, error)
      }
    }

    logger.info(`补发完成 - 设备: ${deviceId}, 成功: ${successCount}, 失败: ${failCount}`)

    if (failCount === 0) {
      await clearCache(deviceId)
    }

    return failCount === 0
  } catch (error) {
    logger.error(`补发消息异常 ${deviceId}:`, error)
    return false
  }
}

const startResendRetry = async (deviceId) => {
  if (retryTimers.has(deviceId)) {
    clearTimeout(retryTimers.get(deviceId))
  }

  let retryCount = 0

  const retry = async () => {
    retryCount++
    logger.info(`补发重试 ${retryCount}/${MAX_RETRY_COUNT} - 设备: ${deviceId}`)
    
    const success = await resendMessages(deviceId)
    
    if (!success && retryCount < MAX_RETRY_COUNT) {
      const timer = setTimeout(retry, RETRY_INTERVAL)
      retryTimers.set(deviceId, timer)
    }
  }

  const timer = setTimeout(retry, RETRY_INTERVAL)
  retryTimers.set(deviceId, timer)
}

const getCacheStats = async () => {
  const stats = {
    totalDevices: pendingMessages.size,
    totalMessages: 0,
    devices: []
  }

  for (const [deviceId, messages of pendingMessages.entries()) {
    stats.totalMessages += messages.length
    stats.devices.push({
      deviceId,
      messageCount: messages.length
    })
  }

  try {
    const files = fs.readdirSync(CACHE_DIR)
    stats.cachedFiles = files.length
  } catch {
    stats.cachedFiles = 0
  }

  return stats
}

const getDeviceCacheStats = async (deviceId) => {
  const messages = pendingMessages.get(deviceId) || []
  const fileMessages = await readFromFile(deviceId)
  
  return {
    deviceId,
    memoryCount: messages.length,
    fileCount: fileMessages.length,
    totalCount: messages.length + fileMessages.length
  }
}

const processOfflineMessage = async (deviceId, message) => {
  const conn = TcpServer.getConnection(deviceId)
  
  if (conn) {
    const msg = protocol.buildMessage(deviceId, message.msgType, message.payload)
    if (msg) {
      conn.socket.write(msg)
      return true
    }
  }
  
  await cacheMessage(deviceId, message)
  return false
}

export default {
  cacheMessage,
  getCachedMessages,
  clearCache,
  resendMessages,
  startResendRetry,
  getCacheStats,
  getDeviceCacheStats,
  processOfflineMessage
}
