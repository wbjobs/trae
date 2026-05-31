const express = require('express');
const http = require('http');
const cors = require('cors');
const { setupWebSocket, getActiveSessions } = require('./wsServer');
const { listContainers, cleanupAll, DEFAULT_IMAGE, MAX_CONTAINERS, getActiveContainerCount } = require('./dockerService');

const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: getActiveSessions(),
    activeContainers: getActiveContainerCount(),
    maxContainers: MAX_CONTAINERS,
  });
});

app.get('/api/containers', (req, res) => {
  res.json({
    count: getActiveContainerCount(),
    maxContainers: MAX_CONTAINERS,
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    defaultImage: DEFAULT_IMAGE,
    idleTimeout: '10 minutes',
    maxContainers: MAX_CONTAINERS,
    networkDisabled: true,
    readonlyRootfs: true,
  });
});

app.post('/api/cleanup', async (req, res) => {
  try {
    await cleanupAll();
    res.json({ message: 'All containers cleaned up' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);

server.maxConnections = 50;

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`Container Terminal Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`REST API: http://localhost:${PORT}/api`);
  console.log(`Max containers: ${MAX_CONTAINERS}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanupAll().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, cleaning up...');
  cleanupAll().then(() => process.exit(0));
});
