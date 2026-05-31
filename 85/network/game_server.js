const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { Protocol, MESSAGE_TYPES } = require('./protocol');
const PacketCompressor = require('./packet_compressor');

class GameServer {
  constructor(port = 3000) {
    this.port = port;
    this.wss = null;
    this.clients = new Map();
    this.gameState = null;
    this.isRunning = false;
    this.tickInterval = null;
    this.lastTickTime = Date.now();
    
    this.config = this.loadConfig('network_config.json');
    this.gameConfig = this.loadConfig('game_config.json');
    
    this.compressor = new PacketCompressor({
      compressionThreshold: this.config.compression?.threshold || 1024,
      compressionLevel: this.config.compression?.level || 6,
      useDictionary: this.config.compression?.use_dictionary || true
    });
    this.compressionEnabled = this.config.compression?.enabled !== false;
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  start(gameState) {
    this.gameState = gameState;
    this.isRunning = true;

    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const clientInfo = {
        id: clientId,
        ws,
        ip: req.socket.remoteAddress,
        connectedAt: Date.now(),
        lastPing: Date.now(),
        playerId: null
      };

      this.clients.set(clientId, clientInfo);
      console.log(`Client connected: ${clientId} from ${clientInfo.ip}`);

      ws.on('message', (message) => {
        this.handleMessage(clientId, message);
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error(`Client ${clientId} error:`, error);
        this.handleDisconnect(clientId);
      });

      this.sendToClient(clientId, Protocol.createMessage('connected', { clientId }));
    });

    this.startGameLoop();
    this.startPingInterval();

    console.log(`Game server started on port ${this.port}`);
    return this;
  }

  stop() {
    this.isRunning = false;
    
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const [clientId, client] of this.clients) {
      client.ws.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }

    console.log('Game server stopped');
  }

  startGameLoop() {
    const tickRate = this.gameConfig.tick_rate || 30;
    const tickInterval = 1000 / tickRate;

    this.tickInterval = setInterval(() => {
      if (!this.isRunning) return;
      
      const now = Date.now();
      const deltaTime = now - this.lastTickTime;
      this.lastTickTime = now;

      if (this.gameState && this.gameState.tick) {
        this.gameState.tick(deltaTime);
      }

      this.broadcastStateSync();
    }, tickInterval);
  }

  startPingInterval() {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients) {
        if (now - client.lastPing > this.config.server.timeout) {
          console.log(`Client ${clientId} timed out`);
          this.handleDisconnect(clientId);
        } else {
          this.sendToClient(clientId, Protocol.createPing());
        }
      }
    }, this.config.server.ping_interval);
  }

  handleMessage(clientId, message) {
    let messageStr;
    try {
      if (this.compressionEnabled && Buffer.isBuffer(message)) {
        const decompressed = this.compressor.decompress(message);
        messageStr = decompressed.data;
      } else {
        messageStr = message.toString();
      }
    } catch (error) {
      console.warn('Failed to decompress message, using raw:', error.message);
      messageStr = message.toString();
    }
    
    const parsed = Protocol.parseMessage(messageStr);
    const client = this.clients.get(clientId);
    
    if (!client) return;

    client.lastPing = Date.now();

    switch (parsed.type) {
      case MESSAGE_TYPES.PING:
        this.sendToClient(clientId, Protocol.createPong(parsed.data.timestamp));
        break;
      
      case MESSAGE_TYPES.PLAYER_JOIN:
        this.handlePlayerJoin(clientId, parsed.data);
        break;
      
      case MESSAGE_TYPES.PLAYER_MOVE:
        this.handlePlayerMove(clientId, parsed.data);
        break;
      
      case MESSAGE_TYPES.PLAYER_ACTION:
        this.handlePlayerAction(clientId, parsed.data);
        break;
      
      case MESSAGE_TYPES.ITEM_PICKUP:
        this.handleItemPickup(clientId, parsed.data);
        break;
      
      case MESSAGE_TYPES.CHAT:
        this.handleChat(clientId, parsed.data);
        break;
      
      default:
        console.log(`Received unknown message type: ${parsed.type} from ${clientId}`);
    }
  }

  handlePlayerJoin(clientId, data) {
    if (!this.gameState) return;

    const player = this.gameState.addPlayer(data.name);
    const client = this.clients.get(clientId);
    if (client) {
      client.playerId = player.id;
    }

    this.sendToClient(clientId, Protocol.createMessage('player_joined', {
      player,
      mapSeed: this.gameState.map.seed
    }));

    this.broadcast(Protocol.createPlayerJoin(player), clientId);
    this.sendFullState(clientId);
  }

  handlePlayerMove(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.playerId || !this.gameState) return;

    const result = this.gameState.movePlayer(client.playerId, data.x, data.y, data.posture);
    
    if (result.success) {
      this.broadcast(Protocol.createPlayerMove(
        client.playerId,
        data.x,
        data.y,
        data.posture
      ));
    } else {
      this.sendToClient(clientId, Protocol.createError(result.reason));
    }
  }

  handlePlayerAction(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.playerId || !this.gameState) return;

    const result = this.gameState.playerAction(client.playerId, data.action, data.payload);
    
    if (result.success) {
      this.broadcast(Protocol.createPlayerAction(
        client.playerId,
        data.action,
        result.data || {}
      ));
    } else {
      this.sendToClient(clientId, Protocol.createError(result.reason));
    }
  }

  handleItemPickup(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || !client.playerId || !this.gameState) return;

    const result = this.gameState.pickupItem(client.playerId, data.itemId);
    
    if (result.success) {
      this.broadcast(Protocol.createItemPickup(client.playerId, result.item));
    } else {
      this.sendToClient(clientId, Protocol.createError(result.reason));
    }
  }

  handleChat(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.broadcast(Protocol.createChat(client.playerId || clientId, data.message));
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.playerId && this.gameState) {
      this.gameState.removePlayer(client.playerId);
      this.broadcast(Protocol.createPlayerLeave(client.playerId));
    }

    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close();
    }

    this.clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  }

  broadcastStateSync() {
    if (!this.gameState || !this.gameState.stateSync) return;

    try {
      const delta = this.gameState.getDeltaState();
      if (delta && delta.changes && Object.keys(delta.changes).length > 0) {
        this.broadcast(Protocol.createDeltaSync(delta));
      }
    } catch (error) {
      console.error('Error broadcasting state sync:', error.message);
    }
  }

  sendFullState(clientId) {
    if (!this.gameState || !this.gameState.stateSync) return;

    const fullState = this.gameState.getFullState();
    this.sendToClient(clientId, Protocol.createStateSync(fullState));
  }

  broadcast(message, excludeClientId = null) {
    let dataToSend = message;
    if (this.compressionEnabled) {
      const compressed = this.compressor.compress(message);
      dataToSend = compressed.data;
    }
    
    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(dataToSend);
      }
    }
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      let dataToSend = message;
      if (this.compressionEnabled) {
        const compressed = this.compressor.compress(message);
        dataToSend = compressed.data;
      }
      client.ws.send(dataToSend);
    }
  }

  getCompressionStats() {
    return this.compressor.getCompressionStats();
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClients() {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      playerId: c.playerId,
      connectedAt: c.connectedAt,
      ip: c.ip
    }));
  }

  getPlayerCount() {
    return Array.from(this.clients.values()).filter(c => c.playerId).length;
  }
}

module.exports = GameServer;
