const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { RoomManager, NetworkHandler } = require('./src/network/network');
const GameStorage = require('./src/storage/storage');
const { MapConfig } = require('./src/config/mapConfig');
const { ReplayManager } = require('./src/core/replaySystem');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager();
const mapConfig = new MapConfig();
const replayManager = new ReplayManager();
const networkHandler = new NetworkHandler(io, roomManager, {
  packetMerger: { flushInterval: 50 }
});
const storage = new GameStorage();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

app.get('/api/maps', (req, res) => {
  res.json(mapConfig.getAllMaps());
});

app.get('/api/maps/custom', (req, res) => {
  res.json(mapConfig.getCustomMapList());
});

app.post('/api/maps/import', (req, res) => {
  try {
    const result = mapConfig.importCustomMap(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/maps/:mapId', (req, res) => {
  const result = mapConfig.deleteCustomMap(req.params.mapId);
  res.json(result);
});

app.get('/api/maps/:mapId/export', (req, res) => {
  const mapData = mapConfig.exportMap(req.params.mapId);
  res.json(mapData);
});

app.get('/api/rooms', (req, res) => {
  res.json(roomManager.getPublicRooms());
});

app.get('/api/games/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(storage.getRecentGames(limit));
});

app.get('/api/games/:gameId', (req, res) => {
  const game = storage.loadGameResult(req.params.gameId);
  if (game) {
    res.json(game);
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

app.get('/api/replays', (req, res) => {
  res.json(replayManager.getReplayList());
});

app.get('/api/replays/:filename', (req, res) => {
  try {
    const replay = replayManager.loadReplay(req.params.filename);
    res.json({
      metadata: replay.getMetadata(),
      duration: replay.getDuration(),
      frameCount: replay.getFrames().length,
      eventCount: replay.getEvents().length
    });
  } catch (error) {
    res.status(404).json({ error: 'Replay not found' });
  }
});

app.delete('/api/replays/:filename', (req, res) => {
  const result = replayManager.deleteReplay(req.params.filename);
  res.json({ success: result });
});

app.get('/api/leaderboard', (req, res) => {
  const sortBy = req.query.sortBy || 'totalScore';
  const limit = parseInt(req.query.limit) || 10;
  res.json(storage.getLeaderboard({ sortBy, limit }));
});

app.get('/api/players/:playerId/stats', (req, res) => {
  res.json(storage.getPlayerStats(req.params.playerId));
});

app.get('/api/stats', (req, res) => {
  res.json({
    activeRooms: roomManager.getRoomCount(),
    activePlayers: roomManager.getTotalPlayers(),
    totalGames: storage.getGameCount(),
    totalPlayers: storage.getPlayerCount(),
    totalReplays: replayManager.getReplayList().length,
    customMaps: mapConfig.getCustomMapList().length,
    storage: storage.getStorageStats()
  });
});

setInterval(() => {
  try {
    roomManager.rooms.forEach((room) => {
      if (room && room.game && room.game.status === 'finished' && !room.saved) {
        try {
          const result = room.game.getGameResult();
          storage.saveGameResult(result);
          room.saved = true;
          console.log(`游戏 ${room.id} 已保存`);
        } catch (saveError) {
          console.error(`保存游戏 ${room.id} 失败:`, saveError);
        }
      }
    });
  } catch (error) {
    console.error('游戏保存循环错误:', error);
  }
}, 5000);

networkHandler.startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`空域对战游戏服务器运行在端口 ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 开始游戏`);
  console.log(`已加载 ${mapConfig.getAllMaps().length} 张地图`);
});
