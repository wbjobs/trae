require('dotenv').config();

const config = {
  port: process.env.PORT || 4000,

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'graphql_gateway',
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || 10),
    waitForConnections: true,
    queueLimit: 0
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || 3),
    enableReadyCheck: true,
    retryDelayOnFailFast: 1000
  },

  weatherApi: {
    baseUrl: process.env.WEATHER_API_BASE_URL || 'https://api.openweathermap.org/data/2.5',
    apiKey: process.env.WEATHER_API_KEY || '',
    timeout: parseInt(process.env.WEATHER_API_TIMEOUT || 5000)
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL || 300000),
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || 1000)
  }
};

module.exports = config;
