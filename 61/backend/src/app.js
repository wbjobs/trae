import dotenv from 'dotenv'
dotenv.config()

import Koa from 'koa'
import cors from 'koa-cors'
import bodyParser from 'koa-bodyparser'
import { createServer } from 'http'
import { Server } from 'socket.io'

import logger from './utils/logger.js'
import router from './routes/index.js'
import { init as initDB } from './models/index.js'
import { init as initRedis } from './utils/redis.js'
import { init as initInfluxDB } from './utils/influxdb.js'
import TcpServer from './tcp/index.js'
import WebSocketService from './websocket/index.js'
import DeviceManager from './services/deviceManager.js'

const app = new Koa()
const httpServer = createServer(app.callback())

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())
app.use(bodyParser())

app.use(async (ctx, next) => {
  const start = Date.now()
  try {
    await next()
    logger.info(`${ctx.method} ${ctx.url} - ${Date.now() - start}ms`)
  } catch (error) {
    logger.error(`${ctx.method} ${ctx.url} - ${error.message}`)
    ctx.status = error.status || 500
    ctx.body = {
      code: ctx.status,
      message: error.message || '服务器内部错误',
      data: null
    }
  }
})

app.use(router.routes())
app.use(router.allowedMethods())

const HTTP_PORT = process.env.HTTP_PORT || 3000
const TCP_PORT = process.env.TCP_PORT || 8888
const WS_PORT = process.env.WS_PORT || 3001

const start = async () => {
  try {
    await initDB()
    logger.info('MySQL 数据库连接成功')

    await initRedis()
    logger.info('Redis 连接成功')

    await initInfluxDB()
    logger.info('InfluxDB 连接成功')

    await DeviceManager.init()
    logger.info('设备管理器初始化完成')

    TcpServer.start(TCP_PORT)
    logger.info(`TCP 服务启动成功，端口: ${TCP_PORT}`)

    WebSocketService.init(io)
    logger.info(`WebSocket 服务启动成功`)

    httpServer.listen(HTTP_PORT, () => {
      logger.info(`HTTP 服务启动成功，端口: ${HTTP_PORT}`)
    })
  } catch (error) {
    logger.error('服务启动失败:', error)
    process.exit(1)
  }
}

start()

process.on('SIGINT', () => {
  logger.info('正在关闭服务...')
  TcpServer.stop()
  httpServer.close(() => {
    logger.info('服务已关闭')
    process.exit(0)
  })
})
