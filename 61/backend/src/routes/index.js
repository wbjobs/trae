import Router from 'koa-router'
import authRouter from './auth.js'
import deviceRouter from './device.js'
import logRouter from './log.js'
import factoryRouter from './factory.js'
import gatewayRouter from './gateway.js'
import configRouter from './config.js'

const router = new Router({ prefix: '/api' })

router.use('/auth', authRouter.routes(), authRouter.allowedMethods())
router.use('/devices', deviceRouter.routes(), deviceRouter.allowedMethods())
router.use('/logs', logRouter.routes(), logRouter.allowedMethods())
router.use('/factories', factoryRouter.routes(), factoryRouter.allowedMethods())
router.use('/gateways', gatewayRouter.routes(), gatewayRouter.allowedMethods())
router.use('/config', configRouter.routes(), configRouter.allowedMethods())

export default router.get('/health', async (ctx) => {
  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      status: 'ok',
      timestamp: Date.now()
    }
  }
})

export default router
