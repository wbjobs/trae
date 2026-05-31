import { Sequelize } from 'sequelize'
import logger from '../utils/logger.js'

let sequelize = null

export const init = async () => {
  const host = process.env.MYSQL_HOST || 'localhost'
  const port = process.env.MYSQL_PORT || 3306
  const user = process.env.MYSQL_USER || 'root'
  const password = process.env.MYSQL_PASSWORD || '123456'
  const database = process.env.MYSQL_DATABASE || 'iot_platform'

  sequelize = new Sequelize(database, user, password, {
    host,
    port,
    dialect: 'mysql',
    timezone: '+08:00',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  })

  try {
    await sequelize.authenticate()
    logger.info('MySQL 连接成功')

    const { User } = await import('./User.js')
    const { Role } = await import('./Role.js')
    const { Device } = await import('./Device.js')
    const { DeviceLog } = await import('./DeviceLog.js')
    const { OfflineRecord } = await import('./OfflineRecord.js')
    const { AuditLog } = await import('./AuditLog.js')
    const { Factory } = await import('./Factory.js')

    await sequelize.sync({ alter: false })
    logger.info('数据库模型同步完成')

    return sequelize
  } catch (error) {
    logger.error('MySQL 连接失败:', error)
    throw error
  }
}

export const getSequelize = () => sequelize

export default {
  init,
  getSequelize
}
