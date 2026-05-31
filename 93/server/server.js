import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;

const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcastToRoom(roomId, message, excludeSender = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.clients.forEach((client) => {
    if (client !== excludeSender && client.readyState === 1) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let userId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'CREATE_ROOM': {
          const roomId = generateRoomId();
          userId = message.userId || 'sender';
          rooms.set(roomId, {
            id: roomId,
            clients: [ws],
            users: new Set([userId])
          });
          currentRoomId = roomId;
          ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            roomId,
            userId
          }));
          break;
        }

        case 'JOIN_ROOM': {
          const { roomId } = message;
          const room = rooms.get(roomId);
          
          if (!room) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: '房间不存在'
            }));
            return;
          }

          if (room.clients.length >= 2) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: '房间已满'
            }));
            return;
          }

          userId = message.userId || 'receiver';
          room.clients.push(ws);
          room.users.add(userId);
          currentRoomId = roomId;

          ws.send(JSON.stringify({
            type: 'JOINED_ROOM',
            roomId,
            userId
          }));

          broadcastToRoom(roomId, {
            type: 'PEER_CONNECTED',
            userId
          }, ws);
          break;
        }

        case 'SIGNAL': {
          const { roomId, data } = message;
          broadcastToRoom(roomId, {
            type: 'SIGNAL',
            data,
            from: userId
          }, ws);
          break;
        }

        case 'LEAVE_ROOM': {
          if (currentRoomId) {
            const room = rooms.get(currentRoomId);
            if (room) {
              room.clients = room.clients.filter((c) => c !== ws);
              room.users.delete(userId);
              
              broadcastToRoom(currentRoomId, {
                type: 'PEER_DISCONNECTED',
                userId
              });

              if (room.clients.length === 0) {
                rooms.delete(currentRoomId);
              }
            }
            currentRoomId = null;
          }
          break;
        }

        default:
          console.log('未知消息类型:', message.type);
      }
    } catch (error) {
      console.error('消息处理错误:', error);
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: '无效的消息格式'
      }));
    }
  });

  ws.on('close', () => {
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.clients = room.clients.filter((c) => c !== ws);
        room.users.delete(userId);
        
        broadcastToRoom(currentRoomId, {
          type: 'PEER_DISCONNECTED',
          userId
        });

        if (room.clients.length === 0) {
          rooms.delete(currentRoomId);
        }
      }
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: rooms.size,
    timestamp: Date.now()
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 信令服务已启动`);
  console.log(`📡 WebSocket 服务器运行在 ws://localhost:${PORT}`);
  console.log(`🌐 健康检查: http://localhost:${PORT}/health`);
  console.log(`\n当前活跃房间数: ${rooms.size}`);
});
