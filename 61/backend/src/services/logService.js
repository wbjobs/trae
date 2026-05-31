import logger from '../utils/logger.js'
import { DeviceLog } from '../models/DeviceLog.js'
import { OfflineRecord } from '../models/OfflineRecord.js'
import { AuditLog } from '../models/AuditLog.js'
import { Op, fn, col, literal } from 'sequelize'
import redis from '../utils/redis.js'

const addDeviceLog = async (logData) => {
  try {
    const log = await DeviceLog.create(logData)
    return log.toJSON()
  } catch (error) {
    logger.error('添加设备日志失败:', error)
    return null
  }
}

const CACHE_TTL = 60

const generateCacheKey = (prefix, params) => {
  const sorted = Object.keys(params).sort()
  const str = sorted.map(k => `${k}:${params[k]}`).join('|')
  return `log:${prefix}:${Buffer.from(str).toString('base64')}`
}

const getDeviceLogs = async (params = {}) => {
  try {
    const { cursor, pageSize = 20, deviceId, level, startTime, endTime, useCursor = true } = params
    const where = {}

    if (deviceId) {
      where.deviceId = { [Op.like]: `%${deviceId}%` }
    }
    if (level) {
      where.level = level
    }
    if (startTime && endTime) {
      where.createdAt = {
        [Op.between]: [new Date(startTime), new Date(endTime)]
      }
    }

    if (useCursor && cursor) {
      where.id = { [Op.lt]: parseInt(cursor) }
    }

    const cacheKey = generateCacheKey('device', { deviceId, level, startTime, endTime, cursor, pageSize })
    const cached = await redis.get(cacheKey)
    if (cached) {
      logger.debug('命中缓存:', cacheKey)
      return cached
    }

    const rows = await DeviceLog.findAll({
      where,
      order: [['id', 'DESC'], ['createdAt', 'DESC']],
      limit: pageSize + 1
    })

    const hasMore = rows.length > pageSize
    const list = rows.slice(0, pageSize).map(r => r.toJSON())
    const nextCursor = hasMore ? list[list.length - 1].id : null

    const result = {
      list,
      nextCursor,
      hasMore,
      pageSize
    }

    await redis.set(cacheKey, result, CACHE_TTL)

    return result
  } catch (error) {
    logger.error('查询设备日志失败:', error)
    return { list: [], nextCursor: null, hasMore: false, pageSize }
  }
}

const addOfflineRecord = async (recordData) => {
  try {
    const record = await OfflineRecord.create(recordData)
    return record.toJSON()
  } catch (error) {
    logger.error('添加离线记录失败:', error)
    return null
  }
}

const getOfflineRecords = async (params = {}) => {
  try {
    const { cursor, pageSize = 20, deviceId, factory, status, useCursor = true } = params
    const where = {}

    if (deviceId) {
      where.deviceId = { [Op.like]: `%${deviceId}%` }
    }
    if (factory) {
      where.factory = factory
    }
    if (status) {
      where.status = status
    }

    if (useCursor && cursor) {
      where.id = { [Op.lt]: parseInt(cursor) }
    }

    const cacheKey = generateCacheKey('offline', { deviceId, factory, status, cursor, pageSize })
    const cached = await redis.get(cacheKey)
    if (cached) {
      return cached
    }

    const rows = await OfflineRecord.findAll({
      where,
      order: [['id', 'DESC'], ['offlineTime', 'DESC']],
      limit: pageSize + 1
    })

    const hasMore = rows.length > pageSize
    const list = rows.slice(0, pageSize).map(r => r.toJSON())
    const nextCursor = hasMore ? list[list.length - 1].id : null

    const result = {
      list,
      nextCursor,
      hasMore,
      pageSize
    }

    await redis.set(cacheKey, result, CACHE_TTL)

    return result
  } catch (error) {
    logger.error('查询离线记录失败:', error)
    return { list: [], nextCursor: null, hasMore: false, pageSize }
  }
}

const getTraceAnalysis = async (deviceId, recordId) => {
  try {
    const record = await OfflineRecord.findByPk(recordId)
    if (!record) {
      return null
    }

    const logs = await DeviceLog.findAll({
      where: { deviceId },
      order: [['createdAt', 'DESC']],
      limit: 50
    })

    const analysis = analyzeOfflineReason(record, logs)

    return {
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      lastOnlineTime: record.lastOnlineTime,
      offlineDuration: record.offlineDuration,
      analysis,
      suggestions: generateSuggestions(analysis)
    }
  } catch (error) {
    logger.error('溯源分析失败:', error)
    return null
  }
}

const analyzeOfflineReason = (record, logs) => {
  const reasons = [
    { reason: '网络中断', confidence: 60, severity: 'warning', detail: '设备与服务器之间的网络连接可能中断' },
    { reason: '设备断电', confidence: 25, severity: 'info', detail: '设备可能因电源问题导致离线' },
    { reason: '设备故障', confidence: 10, severity: 'error', detail: '设备本身可能发生硬件或软件故障' },
    { reason: '防火墙限制', confidence: 5, severity: 'info', detail: '可能是防火墙策略变更导致连接被阻止' }
  ]

  const recentErrorLogs = logs.filter(l => l.level === 'error' || l.level === 'fatal')
  if (recentErrorLogs.length > 0) {
    reasons[2].confidence = 40
    reasons[0].confidence = 40
  }

  reasons.sort((a, b) => b.confidence - a.confidence)

  return reasons[0]
}

const generateSuggestions = (analysis) => {
  const suggestions = [
    { type: 'primary', title: '检查网络连接', description: '请检查设备网络线缆是否正常，确认网络连通性' },
    { type: 'success', title: '检查设备电源', description: '确认设备供电正常，电源指示灯是否亮起' },
    { type: 'warning', title: '重启设备', description: '尝试重启设备，观察是否能重新连接' },
    { type: 'info', title: '联系运维人员', description: '如问题持续，请联系运维人员进行现场排查' }
  ]

  return suggestions
}

const addAuditLog = async (logData) => {
  try {
    const log = await AuditLog.create(logData)
    return log.toJSON()
  } catch (error) {
    logger.error('添加审计日志失败:', error)
    return null
  }
}

const getAuditLogs = async (params = {}) => {
  try {
    const { cursor, pageSize = 20, username, action, startTime, endTime, useCursor = true } = params
    const where = {}

    if (username) {
      where.username = { [Op.like]: `%${username}%` }
    }
    if (action) {
      where.action = action
    }
    if (startTime && endTime) {
      where.createdAt = {
        [Op.between]: [new Date(startTime), new Date(endTime)]
      }
    }

    if (useCursor && cursor) {
      where.id = { [Op.lt]: parseInt(cursor) }
    }

    const cacheKey = generateCacheKey('audit', { username, action, startTime, endTime, cursor, pageSize })
    const cached = await redis.get(cacheKey)
    if (cached) {
      return cached
    }

    const rows = await AuditLog.findAll({
      where,
      order: [['id', 'DESC'], ['createdAt', 'DESC']],
      limit: pageSize + 1
    })

    const hasMore = rows.length > pageSize
    const list = rows.slice(0, pageSize).map(r => r.toJSON())
    const nextCursor = hasMore ? list[list.length - 1].id : null

    const result = {
      list,
      nextCursor,
      hasMore,
      pageSize
    }

    await redis.set(cacheKey, result, CACHE_TTL)

    return result
  } catch (error) {
    logger.error('查询审计日志失败:', error)
    return { list: [], nextCursor: null, hasMore: false, pageSize }
  }
}

const exportDeviceLogs = async (params = {}) => {
  try {
    const { deviceId, level, startTime, endTime } = params
    const where = {}

    if (deviceId) {
      where.deviceId = { [Op.like]: `%${deviceId}%` }
    }
    if (level) {
      where.level = level
    }
    if (startTime && endTime) {
      where.createdAt = {
        [Op.between]: [new Date(startTime), new Date(endTime)]
      }
    }

    const rows = await DeviceLog.findAll({
      where,
      order: [['id', 'DESC']],
      limit: 10000
    })

    return rows.map(r => r.toJSON())
  } catch (error) {
    logger.error('导出设备日志失败:', error)
    return []
  }
}

const getLogStats = async (deviceId, days = 7) => {
  try {
    const cacheKey = `log:stats:${deviceId}:${days}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      return cached
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const logs = await DeviceLog.findAll({
      where: {
        deviceId,
        createdAt: { [Op.gte]: startDate }
      },
      attributes: [
        [fn('DATE', col('createdAt')), 'date'],
        [fn('COUNT', col('id')), 'count'],
        'level'
      ],
      group: ['date', 'level'],
      order: [['date', 'ASC']]
    })

    const stats = {}
    for (const log of logs) {
      const date = log.dataValues.date
      const level = log.dataValues.level
      const count = parseInt(log.dataValues.count)
      if (!stats[date]) {
        stats[date] = {}
      }
      stats[date][level] = count
    }

    await redis.set(cacheKey, stats, 300)

    return stats
  } catch (error) {
    logger.error('获取日志统计失败:', error)
    return {}
  }
}

export default {
  addDeviceLog,
  getDeviceLogs,
  addOfflineRecord,
  getOfflineRecords,
  getTraceAnalysis,
  addAuditLog,
  getAuditLogs,
  exportDeviceLogs,
  getLogStats
}
