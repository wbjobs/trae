import Router from 'koa-router'
import DeviceManager from '../services/deviceManager.js'
import LogService from '../services/logService.js'
import TcpServer from '../tcp/index.js'
import protocol from '../protocol/index.js'
import OfflineCache from '../services/offlineCache.js'

const router = new Router()

router.get('/', async (ctx) => {
  const { factory, status } = ctx.query

  const devices = await DeviceManager.getAllDevices({ factory, status })

  ctx.body = {
    code: 200,
    message: 'success',
    data: devices
  }
})

router.get('/stats', async (ctx) => {
  const { factory } = ctx.query

  const stats = await DeviceManager.getDeviceStats(factory)

  ctx.body = {
    code: 200,
    message: 'success',
    data: stats
  }
})

router.get('/:deviceId', async (ctx) => {
  const { deviceId } = ctx.params

  const device = await DeviceManager.getDevice(deviceId)

  if (!device) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: '设备不存在',
      data: null
    }
    return
  }

  ctx.body = {
    code: 200,
    message: 'success',
    data: device
  }
})

router.get('/:deviceId/metrics', async (ctx) => {
  const { deviceId } = ctx.params
  const { startTime, endTime } = ctx.query

  const metrics = await DeviceManager.getDeviceMetrics(deviceId, startTime, endTime)

  ctx.body = {
    code: 200,
    message: 'success',
    data: metrics
  }
})

router.post('/', async (ctx) => {
  const deviceData = ctx.request.body

  const device = await DeviceManager.addDevice(deviceData)

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'create',
    module: 'device',
    target: deviceData.deviceId,
    description: `新增设备: ${deviceData.deviceName}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '创建成功',
    data: device
  }
})

router.put('/:deviceId', async (ctx) => {
  const { deviceId } = ctx.params
  const updates = ctx.request.body

  const device = await DeviceManager.updateDevice(deviceId, updates)

  if (!device) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: '设备不存在',
      data: null
    }
    return
  }

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'update',
    module: 'device',
    target: deviceId,
    description: `更新设备: ${device.deviceName}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '更新成功',
    data: device
  }
})

router.delete('/:deviceId', async (ctx) => {
  const { deviceId } = ctx.params
  const device = await DeviceManager.getDevice(deviceId)

  const success = await DeviceManager.deleteDevice(deviceId)

  if (!success) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: '设备不存在',
      data: null
    }
    return
  }

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'delete',
    module: 'device',
    target: deviceId,
    description: `删除设备: ${device?.deviceName || deviceId}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '删除成功',
    data: null
  }
})

router.post('/:deviceId/control', async (ctx) => {
  const { deviceId } = ctx.params
  const { command, params } = ctx.request.body

  const device = await DeviceManager.getDevice(deviceId)
  if (!device) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: '设备不存在',
      data: null
    }
    return
  }

  const conn = TcpServer.getConnection(deviceId)
  const cmdId = Math.floor(Math.random() * 65535)
  const cmdType = command === 'restart' ? 1 : command === 'shutdown' ? 2 : 0

  const message = {
    msgType: protocol.MSG_TYPE.CONTROL_CMD,
    payload: {
      cmdId,
      cmdType,
      params: params || {}
    }
  }

  const success = await OfflineCache.processOfflineMessage(deviceId, message)

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'device_control',
    module: 'device',
    target: deviceId,
    description: `发送控制命令: ${command} 到设备 ${device.deviceName}${success ? '' : '（已缓存，待设备上线后补发）'}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: success ? '控制命令已发送' : '设备离线，命令已缓存待补发',
    data: { cmdId, cached: !success }
  }
})

router.get('/cache/stats', async (ctx) => {
  const stats = await OfflineCache.getCacheStats()
  ctx.body = {
    code: 200,
    message: 'success',
    data: stats
  }
})

router.get('/:deviceId/cache', async (ctx) => {
  const { deviceId } = ctx.params
  const messages = await OfflineCache.getCachedMessages(deviceId)
  ctx.body = {
    code: 200,
    message: 'success',
    data: messages
  }
})

router.delete('/:deviceId/cache', async (ctx) => {
  const { deviceId } = ctx.params
  await OfflineCache.clearCache(deviceId)
  ctx.body = {
    code: 200,
    message: '缓存已清理',
    data: null
  }
})

router.post('/:deviceId/cache/resend', async (ctx) => {
  const { deviceId } = ctx.params
  const success = await OfflineCache.resendMessages(deviceId)
  ctx.body = {
    code: 200,
    message: success ? '补发成功' : '补发失败',
    data: { success }
  }
})

export default router
