const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received:', data.type);

      switch (data.type) {
        case 'create-room':
          handleCreateRoom(ws, data);
          break;
        case 'join-room':
          handleJoinRoom(ws, data);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          handleSignalingData(data);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    handleDisconnect();
  });

  function handleCreateRoom(ws, data) {
    const roomId = generateRoomId();
    userId = data.userId || generateRoomId();
    currentRoom = roomId;

    rooms.set(roomId, {
      id: roomId,
      users: new Map(),
    });

    rooms.get(roomId).users.set(userId, { ws, id: userId });

    ws.send(JSON.stringify({
      type: 'room-created',
      roomId,
      userId,
    }));
  }

  function handleJoinRoom(ws, data) {
    const { roomId } = data;
    const room = rooms.get(roomId);

    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: '房间不存在',
      }));
      return;
    }

    if (room.users.size >= 2) {
      ws.send(JSON.stringify({
        type: 'error',
        message: '房间已满',
      }));
      return;
    }

    userId = data.userId || generateRoomId();
    currentRoom = roomId;
    room.users.set(userId, { ws, id: userId });

    ws.send(JSON.stringify({
      type: 'room-joined',
      roomId,
      userId,
      users: Array.from(room.users.keys()),
    }));

    const otherUsers = Array.from(room.users.values()).filter(u => u.id !== userId);
    otherUsers.forEach(user => {
      user.ws.send(JSON.stringify({
        type: 'user-joined',
        userId,
      }));
    });
  }

  function handleSignalingData(data) {
    const { roomId, to, from } = data;
    const room = rooms.get(roomId);

    if (!room) return;

    const targetUser = room.users.get(to);
    if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
      targetUser.ws.send(JSON.stringify(data));
    }
  }

  function handleDisconnect() {
    if (!currentRoom || !userId) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    room.users.delete(userId);

    const remainingUsers = Array.from(room.users.values());
    remainingUsers.forEach(user => {
      user.ws.send(JSON.stringify({
        type: 'user-left',
        userId,
      }));
    });

    if (room.users.size === 0) {
      rooms.delete(currentRoom);
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
