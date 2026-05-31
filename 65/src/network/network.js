const { v4: uuidv4 } = require('uuid');
const { GameCore } = require('../core/gameCore');
const { PacketMerger } = require('./debouncer');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.players = new Map();
  }

  createRoom(options = {}) {
    const roomId = uuidv4();
    const room = {
      id: roomId,
      name: options.name || `房间 ${this.rooms.size + 1}`,
      game: new GameCore(options),
      players: new Set(),
      maxPlayers: options.maxPlayers || 4,
      isPrivate: options.isPrivate || false,
      password: options.password || null,
      createdAt: Date.now(),
      status: 'waiting'
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    if (room.game.status !== 'finished') {
      room.game.end('room_deleted');
    }
    this.rooms.delete(roomId);
    return true;
  }

  joinRoom(roomId, playerId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: '房间不存在' };

    if (room.players.size >= room.maxPlayers) {
      return { success: false, error: '房间已满' };
    }

    room.players.add(playerId);

    const result = room.game.addPlayer(playerId, playerName);
    
    this.players.set(playerId, {
      id: playerId,
      roomId,
      name: playerName
    });

    return { success: true, room, playerData: result };
  }

  leaveRoom(playerId) {
    const playerInfo = this.players.get(playerId);
    if (!playerInfo) return false;

    const room = this.rooms.get(playerInfo.roomId);
    if (room) {
      room.players.delete(playerId);
      room.game.removePlayer(playerId);
      
      if (room.players.size === 0) {
        this.deleteRoom(room.id);
      }
    }

    this.players.delete(playerId);
    return true;
  }

  getPlayerRoom(playerId) {
    const playerInfo = this.players.get(playerId);
    if (!playerInfo) return null;
    return this.rooms.get(playerInfo.roomId) || null;
  }

  getPublicRooms() {
    return Array.from(this.rooms.values())
      .filter(room => !room.isPrivate)
      .map(room => ({
        id: room.id,
        name: room.name,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        status: room.game.status,
        map: room.game.mapConfig.currentMap?.id || 'default'
      }));
  }

  getRoomCount() {
    return this.rooms.size;
  }

  getTotalPlayers() {
    return this.players.size;
  }
}

class NetworkHandler {
  constructor(io, roomManager, options = {}) {
    this.io = io;
    this.roomManager = roomManager;
    this.packetMerger = new PacketMerger(options.packetMerger);
    this.setupEventHandlers();
    this.setupPacketFlush();
  }

  setupPacketFlush() {
    setInterval(() => {
      const flushed = this.packetMerger.flushAll();
      flushed.forEach(({ roomId, merged }) => {
        this.io.to(roomId).emit('batch_update', merged);
      });
    }, 50);
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`玩家连接: ${socket.id}`);
      
      socket.on('list_rooms', () => {
        socket.emit('rooms_list', this.roomManager.getPublicRooms());
      });

      socket.on('create_room', (data) => {
        const room = this.roomManager.createRoom(data);
        socket.emit('room_created', {
          roomId: room.id,
          ...this.serializeRoom(room)
        });
      });

      socket.on('join_room', (data) => {
        const result = this.roomManager.joinRoom(data.roomId, socket.id, data.playerName);
        
        if (result.success) {
          socket.join(data.roomId);
          socket.emit('room_joined', {
            roomId: data.roomId,
            playerId: socket.id,
            ...result.playerData
          });
          
          this.io.to(data.roomId).emit('player_joined', {
            playerId: socket.id,
            playerName: data.playerName
          });
          
          this.broadcastRoomState(data.roomId);
        } else {
          socket.emit('join_error', { error: result.error });
        }
      });

      socket.on('leave_room', () => {
        const playerInfo = this.roomManager.players.get(socket.id);
        if (playerInfo) {
          const roomId = playerInfo.roomId;
          this.roomManager.leaveRoom(socket.id);
          socket.leave(roomId);
          this.io.to(roomId).emit('player_left', { playerId: socket.id });
          this.broadcastRoomState(roomId);
        }
      });

      socket.on('player_ready', (data) => {
        const room = this.roomManager.getPlayerRoom(socket.id);
        if (room) {
          room.game.setPlayerReady(socket.id, data.isReady);
          this.io.to(room.id).emit('player_ready_changed', {
            playerId: socket.id,
            isReady: data.isReady
          });
          this.broadcastRoomState(room.id);
        }
      });

      socket.on('set_route', (data) => {
        const room = this.roomManager.getPlayerRoom(socket.id);
        if (room && room.game.status === 'playing') {
          const result = room.game.setRoute(socket.id, data.waypoints);
          if (result && result.success) {
            this.broadcastRoomState(room.id);
          }
        }
      });

      socket.on('fire_weapon', (data) => {
        const room = this.roomManager.getPlayerRoom(socket.id);
        if (room && room.game.status === 'playing') {
          const result = room.game.fireWeapon(socket.id, data.targetId);
          if (result) {
            this.broadcastRoomState(room.id);
          }
        }
      });

      socket.on('capture_resource', (data) => {
        const room = this.roomManager.getPlayerRoom(socket.id);
        if (room && room.game.status === 'playing') {
          const result = room.game.captureResource(socket.id, data.resourceId);
          if (result) {
            this.broadcastRoomState(room.id);
          }
        }
      });

      socket.on('disconnect', () => {
        console.log(`玩家断开连接: ${socket.id}`);
        this.roomManager.leaveRoom(socket.id);
      });
    });
  }

  broadcastRoomState(roomId) {
    try {
      const room = this.roomManager.getRoom(roomId);
      if (!room || !room.game) return;

      const state = room.game.getGameState();
      const merged = this.packetMerger.addPacket(roomId, 'game_state', state);
      if (merged) {
        this.io.to(roomId).emit('game_state', state);
      }
    } catch (error) {
      console.error('广播房间状态失败:', error);
    }
  }

  startGameLoop() {
    setInterval(() => {
      try {
        this.roomManager.rooms.forEach((room, roomId) => {
          if (room && room.game && room.game.status === 'playing') {
            this.broadcastRoomState(roomId);
          }
        });
      } catch (error) {
        console.error('游戏循环错误:', error);
      }
    }, 100);
  }

  serializeRoom(room) {
    return {
      id: room.id,
      name: room.name,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      status: room.game.status,
      map: room.game.mapConfig.currentMap?.id || 'default'
    };
  }
}

module.exports = { RoomManager, NetworkHandler };
