import { createServer } from 'http';
import { GameServer } from './websocket/GameServer';

const PORT = process.env.PORT || 8080;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const gameServer = new GameServer(server, REDIS_URL);

server.listen(PORT, () => {
  console.log(`斗兽棋服务器启动成功`);
  console.log(`端口: ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
});

const shutdown = () => {
  console.log('正在关闭服务器...');
  gameServer.close();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
