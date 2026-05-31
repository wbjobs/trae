import logger from '../utils/logger.js'
import redis from '../utils/redis.js'

const STRATEGY = {
  ROUND_ROBIN: 'round_robin',
  LEAST_CONNECTIONS: 'least_connections',
  IP_HASH: 'ip_hash',
  RANDOM: 'random'
}

class GatewayLoadBalancer {
  constructor() {
    this.gateways = new Map()
    this.roundRobinIndex = new Map()
    this.strategy = process.env.GATEWAY_STRATEGY || STRATEGY.ROUND_ROBIN
    this.healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 10000
    this.redisKey = 'gateway:registry'
    
    this.startHealthCheck()
  }

  async registerGateway(gatewayInfo) {
    const { gatewayId, host, port, tcpPort, wsPort, region, maxConnections } = gatewayInfo
    
    const gateway = {
      gatewayId,
      host,
      port,
      tcpPort,
      wsPort,
      region: region || 'default',
      maxConnections: maxConnections || 1000,
      currentConnections: 0,
      status: 'online',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      weight: gatewayInfo.weight || 100
    }

    this.gateways.set(gatewayId, gateway)

    await redis.hSet(this.redisKey, gatewayId, {
      ...gateway,
      registeredAt: new Date(gateway.registeredAt).toISOString(),
      lastHeartbeat: new Date(gateway.lastHeartbeat).toISOString()
    })

    this.roundRobinIndex.set(gateway.region || 'default', 0)

    logger.info(`网关注册成功: ${gatewayId} (${host}:${port})`)
    return gateway
  }

  async unregisterGateway(gatewayId) {
    this.gateways.delete(gatewayId)
    await redis.del(`${this.redisKey}:${gatewayId}`)
    logger.info(`网关注销: ${gatewayId}`)
  }

  async heartbeat(gatewayId) {
    const gateway = this.gateways.get(gatewayId)
    if (gateway) {
      gateway.lastHeartbeat = Date.now()
      gateway.status = 'online'
      
      await redis.hSet(this.redisKey, gatewayId, {
        ...gateway,
        lastHeartbeat: new Date(gateway.lastHeartbeat).toISOString()
      })
      
      return true
    }
    return false
  }

  async updateConnections(gatewayId, count) {
    const gateway = this.gateways.get(gatewayId)
    if (gateway) {
      gateway.currentConnections = count
      await redis.hSet(this.redisKey, gatewayId, {
        ...gateway,
        lastHeartbeat: new Date(gateway.lastHeartbeat).toISOString()
      })
      return true
    }
    return false
  }

  selectGateway(deviceId, region = 'default') {
    const onlineGateways = this.getOnlineGateways(region)
    
    if (onlineGateways.length === 0) {
      logger.warn(`区域 ${region} 没有可用的网关`)
      return null
    }

    let selectedGateway = null

    switch (this.strategy) {
      case STRATEGY.ROUND_ROBIN:
        selectedGateway = this.roundRobin(onlineGateways, region)
        break
      case STRATEGY.LEAST_CONNECTIONS:
        selectedGateway = this.leastConnections(onlineGateways)
        break
      case STRATEGY.IP_HASH:
        selectedGateway = this.ipHash(onlineGateways, deviceId)
        break
      case STRATEGY.RANDOM:
        selectedGateway = this.random(onlineGateways)
        break
      default:
        selectedGateway = this.roundRobin(onlineGateways, region)
    }

    if (selectedGateway) {
      logger.debug(`设备 ${deviceId} 分配到网关 ${selectedGateway.gatewayId}`)
    }

    return selectedGateway
  }

  roundRobin(gateways, region) {
    const key = region || 'default'
    const idx = this.roundRobinIndex.get(key) || 0
    const gateway = gateways[idx % gateways.length]
    this.roundRobinIndex.set(key, (idx + 1) % gateways.length)
    return gateway
  }

  leastConnections(gateways) {
    return gateways.reduce((min, gateway) => {
      if (gateway.currentConnections < min.currentConnections) {
        return gateway
      }
      return min
    }, gateways[0])
  }

  ipHash(gateways, deviceId) {
    let hash = 0
    for (let i = 0; i < deviceId.length; i++) {
      hash = ((hash << 5) - hash + deviceId.charCodeAt(i)) | 0
    }
    const index = Math.abs(hash % gateways.length)
    return gateways[index]
  }

  random(gateways) {
    const index = Math.floor(Math.random() * gateways.length)
    return gateways[index]
  }

  getOnlineGateways(region = 'default') {
    const allGateways = Array.from(this.gateways.values())
    return allGateways.filter(g => 
      g.status === 'online' && 
      (region === 'default' || g.region === region)
    )
  }

  getAllGateways() {
    return Array.from(this.gateways.values())
  }

  getGateway(gatewayId) {
    return this.gateways.get(gatewayId)
  }

  getGatewayStats() {
    const gateways = this.getAllGateways()
    const stats = {
      total: gateways.length,
      online: 0,
      offline: 0,
      totalConnections: 0,
      regions: {},
      gateways: gateways.map(g => ({
        gatewayId: g.gatewayId,
        host: g.host,
        region: g.region,
        status: g.status,
        currentConnections: g.currentConnections,
        maxConnections: g.maxConnections,
        loadPercent: ((g.currentConnections / g.maxConnections) * 100).toFixed(2),
        uptime: Date.now() - g.registeredAt
      }))
    }

    for (const g of gateways) {
      if (g.status === 'online') {
        stats.online++
      } else {
        stats.offline++
      }
      stats.totalConnections += g.currentConnections
      
      if (!stats.regions[g.region]) {
        stats.regions[g.region] = { online: 0, offline: 0 }
      }
      if (g.status === 'online') {
        stats.regions[g.region].online++
      } else {
        stats.regions[g.region].offline++
      }
    }

    return stats
  }

  async getDeviceGateway(deviceId) {
    const cachedGatewayId = await redis.get(`device:gateway:${deviceId}`)
    if (cachedGatewayId) {
      const gateway = this.getGateway(cachedGatewayId)
      if (gateway && gateway.status === 'online') {
        return gateway
      }
    }
    return null
  }

  async assignDeviceToGateway(deviceId, gatewayId) {
    await redis.set(`device:gateway:${deviceId}`, gatewayId, 86400)
    logger.info(`设备 ${deviceId} 已分配到网关 ${gatewayId}`)
  }

  startHealthCheck() {
    setInterval(() => {
      const now = Date.now()
      for (const [gatewayId, gateway of this.gateways.entries()) {
        if (now - gateway.lastHeartbeat > 30000) {
          if (gateway.status === 'online') {
            gateway.status = 'offline'
            logger.warn(`网关 ${gatewayId} 超时未心跳，标记为离线`)
          }
        }
      }
    }, this.healthCheckInterval)
  }

  setStrategy(strategy) {
    if (Object.values(STRATEGY).includes(strategy)) {
      this.strategy = strategy
      logger.info(`负载均衡策略已切换为: ${strategy}`)
      return true
    }
    return false
  }

  getStrategy() {
    return this.strategy
  }
}

const loadBalancer = new GatewayLoadBalancer()

export default {
  STRATEGY,
  registerGateway: (info) => loadBalancer.registerGateway(info),
  unregisterGateway: (id) => loadBalancer.unregisterGateway(id),
  heartbeat: (id) => loadBalancer.heartbeat(id),
  updateConnections: (id, count) => loadBalancer.updateConnections(id, count),
  selectGateway: (deviceId, region) => loadBalancer.selectGateway(deviceId, region),
  getOnlineGateways: (region) => loadBalancer.getOnlineGateways(region),
  getAllGateways: () => loadBalancer.getAllGateways(),
  getGateway: (id) => loadBalancer.getGateway(id),
  getGatewayStats: () => loadBalancer.getGatewayStats(),
  getDeviceGateway: (deviceId) => loadBalancer.getDeviceGateway(deviceId),
  assignDeviceToGateway: (deviceId, gatewayId) => loadBalancer.assignDeviceToGateway(deviceId, gatewayId),
  setStrategy: (strategy) => loadBalancer.setStrategy(strategy),
  getStrategy: () => loadBalancer.getStrategy()
}
