import Router from 'koa-router'
import config, { getCurrentEnv, getAvailableEnvs, switchEnv } from '../config/index.js'

const router = new Router()

router.get('/', async (ctx) => {
  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      current: getCurrentEnv(),
      available: getAvailableEnvs(),
      server: {
        httpPort: config.server.httpPort,
        tcpPort: config.server.tcpPort,
        wsPort: config.server.wsPort
      },
      gateway: {
        strategy: config.gateway.strategy,
        heartbeatInterval: config.gateway.heartbeatInterval,
        offlineThreshold: config.gateway.offlineThreshold
      },
      logger: {
        level: config.logger.level
      },
      isDevelopment: config.isDevelopment(),
      isProduction: config.isProduction()
    }
  }
})

router.get('/env', async (ctx) => {
  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      current: getCurrentEnv(),
      available: getAvailableEnvs()
    }
  }
})

router.put('/env', async (ctx) => {
  const { mode } = ctx.request.body
  
  if (!mode) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: '缺少mode参数',
      data: null
    }
    return
  }

  try {
    const newEnv = switchEnv(mode)
    
    ctx.body = {
      code: 200,
      message: `已切换到${mode}环境`,
      data: {
        current: mode,
        env: {
          NODE_ENV: newEnv.NODE_ENV,
          HTTP_PORT: newEnv.HTTP_PORT,
          LOG_LEVEL: newEnv.LOG_LEVEL
        }
      }
    }
  } catch (error) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: error.message,
      data: null
    }
  }
})

router.get('/features', async (ctx) => {
  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      offlineCache: true,
      loadBalancer: true,
      cursorPagination: true,
      protocolViewer: true,
      envSwitcher: true
    }
  }
})

export default router
