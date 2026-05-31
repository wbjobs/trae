import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT || '3001', 10),
    host: process.env.SERVER_HOST || '0.0.0.0',
  },
  etcd: {
    endpoints: process.env.ETCD_ENDPOINTS?.split(',') || ['http://127.0.0.1:2379'],
    username: process.env.ETCD_USERNAME,
    password: process.env.ETCD_PASSWORD,
    rulesKey: process.env.ETCD_RULES_KEY || '/apisix/plugins/gray-routing/rules',
    watchKey: process.env.ETCD_WATCH_KEY || '/apisix/plugins/gray-routing',
  },
  kafka: {
    enabled: process.env.KAFKA_ENABLED === 'true',
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    topic: process.env.KAFKA_TOPIC || 'gray-routing-requests',
    clientId: process.env.KAFKA_CLIENT_ID || 'gray-routing-backend',
    groupId: process.env.KAFKA_GROUP_ID || 'gray-routing-consumer',
  },
  sampling: {
    enabled: process.env.SAMPLING_ENABLED === 'true',
    rate: parseFloat(process.env.SAMPLING_RATE || '0.01'),
    maxBodySize: parseInt(process.env.MAX_BODY_SIZE || '1048576', 10),
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config;
