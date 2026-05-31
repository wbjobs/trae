const WebSocket = require('ws');
const { Protocol, MESSAGE_TYPES } = require('./protocol');
const PacketCompressor = require('./packet_compressor');

class GameClient {
  constructor(serverUrl = 'ws://localhost:3000') {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.isConnected = false;
    this.clientId = null;
    this.playerId = null;
    this.gameState = null;
    this.eventHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    
    this.compressor = new PacketCompressor({
      compressionThreshold: 1024,
      compressionLevel: 6,
      useDictionary: true
    });
    this.compressionEnabled = true;
  }

  connect(playerName) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.on('open', () => {
          this.isConnected = true;
          console.log('Connected to game server');

          this.send(Protocol.createMessage(MESSAGE_TYPES.PLAYER_JOIN, {
            name: playerName
          }));

          this.startPing();
          resolve(this);
        });

        this.ws.on('message', (message) => {
          this.handleMessage(message.toString());
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          console.log('Disconnected from game server');
          this.stopPing();
          this.attemptReconnect(playerName);
        });

        this.ws.on('error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    this.reconnectAttempts = this.maxReconnectAttempts;
    
    if (this.ws) {
      this.ws.close();
    }
    
    this.stopPing();
    this.isConnected = false;
    console.log('Disconnected manually');
  }

  attemptReconnect(playerName) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      this.emit('disconnected', { reason: 'max_reconnect' });
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect(playerName).catch(() => {
        console.log('Reconnect failed');
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  handleMessage(message) {
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

    switch (parsed.type) {
      case 'connected':
        this.clientId = parsed.data.clientId;
        console.log(`Assigned client ID: ${this.clientId}`);
        break;

      case 'player_joined':
        this.playerId = parsed.data.player.id;
        this.gameState = {
          player: parsed.data.player,
          mapSeed: parsed.data.mapSeed
        };
        console.log(`Joined game as ${parsed.data.player.name}`);
        this.emit('player_joined', parsed.data);
        break;

      case MESSAGE_TYPES.PLAYER_JOIN:
        this.emit('player_join', parsed.data);
        break;

      case MESSAGE_TYPES.PLAYER_LEAVE:
        this.emit('player_leave', parsed.data);
        break;

      case MESSAGE_TYPES.PLAYER_MOVE:
        this.emit('player_move', parsed.data);
        break;

      case MESSAGE_TYPES.PLAYER_ACTION:
        this.emit('player_action', parsed.data);
        break;

      case MESSAGE_TYPES.STATE_SYNC:
        this.gameState = { ...this.gameState, ...parsed.data };
        this.emit('state_sync', parsed.data);
        break;

      case MESSAGE_TYPES.DELTA_SYNC:
        this.applyDelta(parsed.data);
        this.emit('delta_sync', parsed.data);
        break;

      case MESSAGE_TYPES.ITEM_PICKUP:
        this.emit('item_pickup', parsed.data);
        break;

      case MESSAGE_TYPES.DANGER_ALERT:
        this.emit('danger_alert', parsed.data);
        break;

      case MESSAGE_TYPES.ENVIRONMENT_CHANGE:
        this.emit('environment_change', parsed.data);
        break;

      case MESSAGE_TYPES.CHAT:
        this.emit('chat', parsed.data);
        break;

      case MESSAGE_TYPES.PING:
        this.send(Protocol.createPong(parsed.data.timestamp));
        break;

      case MESSAGE_TYPES.PONG:
        const latency = Date.now() - parsed.data.pingTimestamp;
        this.emit('pong', { latency });
        break;

      case MESSAGE_TYPES.GAME_START:
        this.emit('game_start', parsed.data);
        break;

      case MESSAGE_TYPES.GAME_END:
        this.emit('game_end', parsed.data);
        break;

      case MESSAGE_TYPES.ERROR:
        console.error('Server error:', parsed.data.message);
        this.emit('error', parsed.data);
        break;

      default:
        console.log(`Received unknown message type: ${parsed.type}`);
    }
  }

  applyDelta(delta) {
    if (!this.gameState) return;

    if (delta.changes) {
      if (delta.changes.players) {
        this.gameState.players = this.gameState.players || [];
        for (const [id, change] of Object.entries(delta.changes.players)) {
          if (change.action === 'add') {
            this.gameState.players.push(change.player);
          } else if (change.action === 'update') {
            const idx = this.gameState.players.findIndex(p => p.id === id);
            if (idx !== -1) {
              this.gameState.players[idx] = { ...this.gameState.players[idx], ...change.player };
            }
          } else if (change.action === 'remove') {
            this.gameState.players = this.gameState.players.filter(p => p.id !== id);
          }
        }
      }

      if (delta.changes.game_time !== undefined) {
        this.gameState.game_time = delta.changes.game_time;
      }
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      let dataToSend = message;
      if (this.compressionEnabled) {
        const compressed = this.compressor.compress(message);
        dataToSend = compressed.data;
      }
      this.ws.send(dataToSend);
      return true;
    }
    return false;
  }

  getCompressionStats() {
    return this.compressor.getCompressionStats();
  }

  setCompressionEnabled(enabled) {
    this.compressionEnabled = enabled;
  }

  move(x, y, posture = 'stand') {
    return this.send(Protocol.createPlayerMove(this.playerId, x, y, posture));
  }

  action(actionType, payload = {}) {
    return this.send(Protocol.createPlayerAction(this.playerId, actionType, payload));
  }

  pickupItem(itemId) {
    return this.send(Protocol.createMessage(MESSAGE_TYPES.ITEM_PICKUP, {
      playerId: this.playerId,
      itemId
    }));
  }

  chat(message) {
    return this.send(Protocol.createChat(this.playerId, message));
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      this.send(Protocol.createPing());
    }, 5000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName).push(handler);
  }

  off(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) {
        handlers.splice(idx, 1);
      }
    }
  }

  emit(eventName, data) {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in event handler for ${eventName}:`, e);
        }
      }
    }
  }

  getState() {
    return this.gameState;
  }

  isConnectedToServer() {
    return this.isConnected;
  }
}

module.exports = GameClient;
