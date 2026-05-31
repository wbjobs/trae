import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ENV_MODES = ['development', 'testing', 'staging', 'production']

const loadEnv = () => {
  const mode = process.env.NODE_ENV || 'development'
  
  const envFiles = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    '.env.local',
    '.env'
  ]

  for (const file of envFiles) {
    const filePath = path.resolve(__dirname, '../..', file)
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: true })
      console.log(`[Config] Loaded environment file: ${file}`)
    }
  }

  return process.env
}

const env = loadEnv()

const config = {
  nodeEnv: env.NODE_ENV || 'development',
  
  server: {
    httpPort: parseInt(env.HTTP_PORT) || 3000,
    tcpPort: parseInt(env.TCP_PORT) || 8888,
    wsPort: parseInt(env.WS_PORT) || 3001,
    corsOrigin: env.CORS_ORIGIN || '*'
  },
  
  database: {
    mysql: {
      host: env.MYSQL_HOST || 'localhost',
      port: parseInt(env.MYSQL_PORT) || 3306,
      user: env.MYSQL_USER || 'root',
      password: env.MYSQL_PASSWORD || '123456',
      database: env.MYSQL_DATABASE || 'iot_platform',
      connectionLimit: parseInt(env.MYSQL_CONNECTION_LIMIT) || 10
    },
    redis: {
      host: env.REDIS_HOST || 'localhost',
      port: parseInt(env.REDIS_PORT) || 6379,
      password: env.REDIS_PASSWORD || null,
      db: parseInt(env.REDIS_DB) || 0
    },
    influxdb: {
      host: env.INFLUXDB_HOST || 'localhost',
      port: parseInt(env.INFLUXDB_PORT) || 8086,
      token: env.INFLUXDB_TOKEN || 'iot-token',
      org: env.INFLUXDB_ORG || 'iot-org',
      bucket: env.INFLUXDB_BUCKET || 'iot-data'
    }
  },
  
  security: {
    jwtSecret: env.JWT_SECRET || 'iot-platform-secret-key',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '24h',
    bcryptRounds: parseInt(env.BCRYPT_ROUNDS) || 10
  },
  
  gateway: {
    timeout: parseInt(env.GATEWAY_TIMEOUT) || 30000,
    heartbeatInterval: parseInt(env.HEARTBEAT_INTERVAL) || 15000,
    offlineThreshold: parseInt(env.OFFLINE_THRESHOLD) || 45000,
    strategy: env.GATEWAY_STRATEGY || 'round_robin'
  },
  
  logger: {
    level: env.LOG_LEVEL || 'info',
    file: env.LOG_FILE || 'logs/app.log',
    maxSize: env.LOG_MAX_SIZE || '100m',
    maxFiles: parseInt(env.LOG_MAX_FILES) || 10
  },
  
  cache: {
    ttl: parseInt(env.CACHE_TTL) || 60,
    offlineCacheDir: env.OFFLINE_CACHE_DIR || 'data/offline-cache',
    maxCacheSize: parseInt(env.MAX_CACHE_SIZE) || 10000
  },
  
  isDevelopment: () => config.nodeEnv === 'development',
  isProduction: () => config.nodeEnv === 'production',
  isTesting: () => config.nodeEnv === 'testing',
  isStaging: () => config.nodeEnv === 'staging'
}

export const switchEnv = (mode) => {
  if (!ENV_MODES.includes(mode)) {
    throw new Error(`Invalid environment mode: ${mode}. Available modes: ${ENV_MODES.join(', ')}`)
  }
  
  process.env.NODE_ENV = mode
  console.log(`[Config] Switched to ${mode} environment`)
  return loadEnv()
}

export const getCurrentEnv = () => config.nodeEnv

export const getAvailableEnvs = () => ENV_MODES

export default config
