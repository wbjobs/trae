require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3001,
    nodeId: process.env.NODE_ID || `node-${Math.random().toString(36).substr(2, 9)}`,
    host: process.env.NODE_HOST || '127.0.0.1',
    workerCount: parseInt(process.env.WORKER_COUNT) || 0,
    enableHotReload: process.env.ENABLE_HOT_RELOAD === 'true' || false
  },

  redis: {
    nodes: process.env.REDIS_CLUSTER_NODES 
      ? process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port) };
        })
      : [{ host: '127.0.0.1', port: 6379 }],
    password: process.env.REDIS_PASSWORD || '',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'api_key_cluster:',
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100
  },

  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'api_key_cluster',
    dialect: 'mysql',
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: false
  },

  key: {
    rotationInterval: parseInt(process.env.KEY_ROTATION_INTERVAL) || 86400000,
    expireDays: parseInt(process.env.KEY_EXPIRE_DAYS) || 30,
    gracePeriodDays: parseInt(process.env.KEY_GRACE_PERIOD_DAYS) || 7,
    length: 64,
    algorithm: 'HS256'
  },

  gray: {
    ipRanges: process.env.GRAY_IP_RANGES 
      ? process.env.GRAY_IP_RANGES.split(',') 
      : [],
    trafficPercent: parseInt(process.env.GRAY_TRAFFIC_PERCENT) || 10,
    levels: {
      PUBLIC: 0,
      BASIC: 1,
      ADVANCED: 2,
      ADMIN: 3
    }
  },

  cluster: {
    nodes: process.env.CLUSTER_NODES 
      ? process.env.CLUSTER_NODES.split(',') 
      : [],
    syncInterval: parseInt(process.env.SYNC_INTERVAL) || 5000,
    syncTimeout: 3000,
    electionKey: 'cluster:master_election',
    syncChannel: 'cluster:sync_channel'
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
    maxSize: '20m',
    maxFiles: '14d',
    categories: {
      KEY_GENERATION: 'key_generation',
      KEY_ROTATION: 'key_rotation',
      KEY_EXPIRY: 'key_expiry',
      AUTH: 'authentication',
      GRAY: 'gray_release',
      SYNC: 'cluster_sync',
      HOT_RELOAD: 'hot_reload',
      RATE_LIMIT: 'rate_limit',
      SYSTEM: 'system'
    }
  },

  rateLimit: {
    defaultLimit: parseInt(process.env.RATE_LIMIT_DEFAULT) || 1000,
    windowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW) || 60,
    blockDuration: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION) || 3600,
    violationsBeforeBlock: parseInt(process.env.RATE_LIMIT_VIOLATIONS) || 10,
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false'
  },

  encryption: {
    enabled: process.env.ENCRYPTION_ENABLED === 'true' || true,
    masterKey: process.env.ENCRYPTION_MASTER_KEY || 'default_master_key_please_change_in_production',
    defaultLevel: parseInt(process.env.ENCRYPTION_LEVEL) || 1
  }
};

module.exports = config;
