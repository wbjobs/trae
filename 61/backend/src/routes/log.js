import Router from 'koa-router'
import LogService from '../services/logService.js'

const router = new Router()

router.get('/device', async (ctx) => {
  const result = await LogService.getDeviceLogs(ctx.query)

  ctx.body = {
    code: 200,
    message: 'success',
    data: result
  }
})

router.get('/offline', async (ctx) => {
  const result = await LogService.getOfflineRecords(ctx.query)

  ctx.body = {
    code: 200,
    message: 'success',
    data: result
  }
})

router.get('/audit', async (ctx) => {
  const result = await LogService.getAuditLogs(ctx.query)

  ctx.body = {
    code: 200,
    message: 'success',
    data: result
  }
})

router.get('/trace/:deviceId/:recordId', async (ctx) => {
  const { deviceId, recordId } = ctx.params

  const analysis = await LogService.getTraceAnalysis(deviceId, recordId)

  if (!analysis) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: '记录不存在',
      data: null
    }
    return
  }

  ctx.body = {
    code: 200,
    message: 'success',
    data: analysis
  }
})

router.get('/export', async (ctx) => {
  const { type = 'device', deviceId, level, startTime, endTime } = ctx.query

  let data = []
  if (type === 'device') {
    data = await LogService.exportDeviceLogs({ deviceId, level, startTime, endTime })
  } else if (type === 'offline') {
    const result = await LogService.getOfflineRecords({ pageSize: 10000, useCursor: false })
    data = result.list
  } else if (type === 'audit') {
    const result = await LogService.getAuditLogs({ pageSize: 10000, useCursor: false })
    data = result.list
  }

  if (data.length === 0) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: '没有可导出的数据',
      data: null
    }
    return
  }

  const csvContent = [
    Object.keys(data[0] || {}).join(','),
    ...data.map(row => Object.values(row).map(v => `"${v}"`).join(','))
  ].join('\n')

  ctx.set('Content-Type', 'text/csv; charset=utf-8')
  ctx.set('Content-Disposition', `attachment; filename="${type}_logs_${Date.now()}.csv"`)
  ctx.body = '\ufeff' + csvContent
})

router.get('/stats', async (ctx) => {
  const { deviceId, days = 7 } = ctx.query
  
  if (!deviceId) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: '缺少deviceId参数',
      data: null
    }
    return
  }

  const stats = await LogService.getLogStats(deviceId, parseInt(days))
  
  ctx.body = {
    code: 200,
    message: 'success',
    data: stats
  }
})

export default router
