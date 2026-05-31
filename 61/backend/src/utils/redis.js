import { createClient } from 'redis'
import logger from './logger.js'

let client = null

export const init = async () => {
  client = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
  })

  client.on('error', (err) => {
    logger.error('Redis 连接错误:', err)
  })

  client.on('connect', () => {
    logger.info('Redis 连接成功')
  })

  await client.connect()
}

export const getClient = () => client

export const set = async (key, value, ttl = null) => {
  if (ttl) {
    await client.setEx(key, ttl, JSON.stringify(value))
  } else {
    await client.set(key, JSON.stringify(value))
  }
}

export const get = async (key) => {
  const value = await client.get(key)
  return value ? JSON.parse(value) : null
}

export const del = async (key) => {
  await client.del(key)
}

export const hSet = async (key, field, value) => {
  await client.hSet(key, field, JSON.stringify(value))
}

export const hGet = async (key, field) => {
  const value = await client.hGet(key, field)
  return value ? JSON.parse(value) : null
}

export const hGetAll = async (key) => {
  const result = await client.hGetAll(key)
  const parsed = {}
  for (const [field, value] of Object.entries(result)) {
    parsed[field] = JSON.parse(value)
  }
  return parsed
}

export default {
  init,
  getClient,
  set,
  get,
  del,
  hSet,
  hGet,
  hGetAll
}
