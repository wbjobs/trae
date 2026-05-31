import Router from 'koa-router'
import GatewayLoadBalancer from '../services/gatewayLoadBalancer.js'
import logger from '../utils/logger.js'

const router = new Router()

router.get('/', async (ctx) => {
  const { region } = ctx.query
  const gateways = region
    ? GatewayLoadBalancer.getOnlineGateways(region)
    : GatewayLoadBalancer.getAllGateways()
  
  ctx.body = {
    code: 200,
    message: 'success',
    data: gateways
  }
})

router.get('/stats', async (ctx) => {
  const stats = GatewayLoadBalancer.getGatewayStats()
  ctx.body = {
    code: 200,
    message: 'success',
    data: stats
  }
})

router.post('/register', async (ctx) => {
  const { gatewayId, host, port, tcpPort, wsPort, region, maxConnections } = ctx.request.body
  
  if (!gatewayId || !host || !port) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: '缺少必要参数',
      data: null
    }
    return
  }

  const gateway = await GatewayLoadBalancer.registerGateway({
    gatewayId,
    host,
    port: parseInt(port),
    tcpPort: parseInt(tcpPort) || 8888,
    wsPort: parseInt(wsPort) || 3001,
    region,
    maxConnections: parseInt(maxConnections) || 1000
  })

  ctx.body = {
    code: 200,
    message: '注册成功',
    data: gateway
  }
})

router.post('/:gatewayId/heartbeat', async (ctx) => {
  const { gatewayId } = ctx.params
  const { connections } = ctx.request.body

  const success = await GatewayLoadBalancer.heartbeat(gatewayId)
  if (success && connections !== undefined) {
    await GatewayLoadBalancer.updateConnections(gatewayId, parseInt(connections))
  }

  ctx.body = {
    code: 200,
    message: success ? '心跳成功' : '网关不存在',
    data: { success }
  }
})

router.delete('/:gatewayId', async (ctx) => {
  const { gatewayId } = ctx.params
  await GatewayLoadBalancer.unregisterGateway(gatewayId)
  
  ctx.body = {
    code: 200,
    message: '注销成功',
    data: null
  }
})

router.get('/select', async (ctx) => {
  const { deviceId, region } = ctx.query
  
  if (!deviceId) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: '缺少deviceId参数',
      data: null
    }
    return
  }

  let gateway = await GatewayLoadBalancer.getDeviceGateway(deviceId)
  
  if (!gateway) {
    gateway = GatewayLoadBalancer.selectGateway(deviceId, region)
    if (gateway) {
      await GatewayLoadBalancer.assignDeviceToGateway(deviceId, gateway.gatewayId)
    }
  }

  if (gateway) {
    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        gatewayId: gateway.gatewayId,
        host: gateway.host,
        port: gateway.port,
        tcpPort: gateway.tcpPort,
        wsPort: gateway.wsPort,
        region: gateway.region
      }
    }
  } else {
    ctx.status = 503
    ctx.body = {
      code: 503,
      message: '没有可用的网关',
      data: null
    }
  }
})

router.get('/device/:deviceId', async (ctx) => {
  const { deviceId } = ctx.params
  const gateway = await GatewayLoadBalancer.getDeviceGateway(deviceId)
  
  ctx.body = {
    code: 200,
    message: 'success',
    data: gateway
  }
})

router.get('/strategy', async (ctx) => {
  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      current: GatewayLoadBalancer.getStrategy(),
      available: Object.values(GatewayLoadBalancer.STRATEGY)
    }
  }
})

router.put('/strategy', async (ctx) => {
  const { strategy } = ctx.request.body
  
  if (!strategy) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: '缺少strategy参数',
      data: null
    }
    return
  }

  const success = GatewayLoadBalancer.setStrategy(strategy)
  
  ctx.body = {
    code: success ? 200 : 400,
    message: success ? '策略更新成功' : '无效的策略',
    data: { success }
  }
})

export default router
