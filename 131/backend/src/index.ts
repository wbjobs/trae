import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import routes from './routes';
import { ruleService } from './services/rule.service';
import { kafkaService } from './services/kafka.service';

const app = express();

app.use(cors({
  origin: config.cors.origin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sampling-Source'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({
    name: 'APISIX Gray Routing API',
    version: '2.0.0',
    features: ['gray-routing', 'hot-update', 'request-sampling'],
    endpoints: {
      health: '/api/health',
      config: '/api/config',
      rules: '/api/rules',
      sampling: '/api/sampling',
    },
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message,
  });
});

ruleService.subscribeToChanges((rules) => {
  logger.info(`Rules updated: ${rules.length} rules active`);
});

const startServer = async () => {
  // 初始化 Kafka 服务
  if (config.kafka.enabled) {
    await kafkaService.init();
    logger.info('📨 Kafka service initialized');
  }

  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(`🚀 Gray Routing API server running on http://${config.server.host}:${config.server.port}`);
    logger.info(`📡 Watching etcd for rule changes...`);
    if (config.kafka.enabled) {
      logger.info(`📨 Kafka sampling enabled, topic: ${config.kafka.topic}`);
    }
  });

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    server.close(() => {
      logger.info('HTTP server closed');
    });

    if (config.kafka.enabled) {
      await kafkaService.disconnect();
    }

    setTimeout(() => {
      logger.error('Forced shutdown after 10 seconds');
      process.exit(1);
    }, 10000);

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
