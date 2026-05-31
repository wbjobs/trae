import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initAuth } from '../../../common/auth';
import { authMiddleware } from './middleware/auth';
import authRouter from './router/auth';
import protocolRouter from './router/protocol';
import schemaRouter from './router/schema';
import routeRouter from './router/route';
import deviceRouter from './router/device';
import logRouter from './router/log';
import statisticsRouter from './router/statistics';
import pollingRouter from './router/polling';
import versionRouter from './router/version';
import { testParse } from './controller/parser';
import { adapterManager } from '../../../parse-layer/protocol-adapter/src';
import { messageRouter } from '../../../forward-layer/message-router/src';
import { tsdbStorage } from '../../../parse-layer/tsdb-storage/src';
import { store } from './model/store';
import { parseResultCache } from '../../../parse-layer/cache-pool/src';
import { loadBalancer } from '../../../forward-layer/load-balancer/src';
import { versionManager } from '../../../forward-layer/version-manager/src';
import { logger } from '../../../common/logger/src';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

initAuth();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/auth', authRouter);
app.use('/polling', pollingRouter);
app.use(authMiddleware);
app.use('/protocols', protocolRouter);
app.use('/schemas', schemaRouter);
app.use('/routes', routeRouter);
app.use('/devices', deviceRouter);
app.use('/logs', logRouter);
app.use('/statistics', statisticsRouter);
app.use('/version', versionRouter);
app.post('/parser/test', testParse);

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

async function initSystem() {
  logger.info('System', 'Starting system initialization...');
  
  const protocols = store.getProtocols();
  protocols.forEach(p => adapterManager.registerAdapter(p));
  logger.info('System', `Registered ${protocols.length} protocol adapters`);
  
  const routes = store.getRoutes();
  messageRouter.loadRules(routes);
  logger.info('System', `Loaded ${routes.length} routing rules`);
  
  const schemas = store.getSchemas();
  schemas.forEach(s => {
    const { messageParser } = require('../../../parse-layer/message-parser/src');
    messageParser.registerSchema(s);
    adapterManager.registerSchemaForProtocol(s.protocolId, s.id);
  });
  logger.info('System', `Registered ${schemas.length} message schemas`);
  
  adapterManager.onParsedMessage(async (msg) => {
    logger.debug('AdapterManager', `Parsed message from ${msg.deviceId}`);
    await tsdbStorage.storeRawMessage(msg);
    await tsdbStorage.storeParsedLog(msg);
    
    const forwardLogs = await messageRouter.route(msg);
    for (const log of forwardLogs) {
      await tsdbStorage.storeForwardLog(log);
    }
  });
  
  messageRouter.on('deviceCommand', (deviceId, data) => {
    logger.info('Router', `Sending command to device ${deviceId}`);
    const protocols = store.getProtocols();
    const device = store.getDevice(deviceId);
    if (device) {
      const protocol = protocols.find(p => p.type === device.protocol);
      if (protocol) {
        adapterManager.send(protocol.id, deviceId, JSON.stringify(data));
      }
    }
  });
  
  parseResultCache.on('cacheHit', ({ key, messageId }) => {
    logger.debug('Cache', `Cache hit for ${key.substring(0, 50)}...`);
  });
  
  parseResultCache.on('cacheEviction', ({ key }) => {
    logger.debug('Cache', `Cache eviction for ${key.substring(0, 50)}...`);
  });
  
  versionManager.on('releaseStarted', (release) => {
    logger.info('VersionManager', `Gray release started: ${release.name}`);
  });
  
  versionManager.on('releaseCompleted', (release) => {
    logger.info('VersionManager', `Gray release completed: ${release.name}`);
  });
  
  versionManager.on('deviceUpgraded', ({ deviceId, version }) => {
    logger.info('VersionManager', `Device ${deviceId} upgraded to version ${version}`);
  });
  
  await adapterManager.startAll();
  
  logger.info('System', 'All modules initialized successfully');
  console.log('[System] All modules initialized successfully');
}

app.listen(PORT, async () => {
  console.log(`Config Server running on port ${PORT}`);
  await initSystem();
});
