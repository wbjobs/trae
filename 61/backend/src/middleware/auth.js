import jwt from 'jsonwebtoken'
import logger from '../utils/logger.js'

const JWT_SECRET = process.env.JWT_SECRET || 'iot-platform-secret-key'

export const authMiddleware = async (ctx, next) => {
  const publicPaths = ['/api/auth/login', '/api/health']

  if (publicPaths.includes(ctx.path)) {
    await next()
    return
  }

  const token = ctx.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    ctx.status = 401
    ctx.body = {
      code: 401,
      message: '未提供认证令牌',
      data: null
    }
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    ctx.state.user = decoded
    await next()
  } catch (error) {
    logger.warn('JWT 验证失败:', error.message)
    ctx.status = 401
    ctx.body = {
      code: 401,
      message: '认证令牌无效或已过期',
      data: null
    }
  }
}

export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      factory: user.factory
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  )
}

export default {
  authMiddleware,
  generateToken
}
