import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { config } from './config.js';

const wss = new WebSocketServer({ port: config.appPort });

const rooms = new Map();
const CHAT_BATCH_INTERVAL_MS = 50;

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map(),
      messages: [],
      pendingChat: [],
      chatTimer: null
    });
  }
  return rooms.get(roomId);
};

const flushChatBatch = (roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.pendingChat.length === 0) return;

  room.chatTimer = null;

  const messages = room.pendingChat;
  room.pendingChat = [];

  for (const msg of messages) {
    const json = JSON.stringify(msg);
    for (const [conn] of room.users) {
      if (conn.readyState === 1) {
        conn.send(json);
      }
    }
  }
};

const broadcastChat = (roomId, chatMsg) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.messages.push(chatMsg);
  if (room.messages.length > 200) {
    room.messages = room.messages.slice(-200);
  }

  room.pendingChat.push(chatMsg);

  if (!room.chatTimer) {
    room.chatTimer = setTimeout(() => {
      flushChatBatch(roomId);
    }, CHAT_BATCH_INTERVAL_MS);
  }
};

const broadcastToRoom = (roomId, data, excludeConn = null) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const json = JSON.stringify(data);
  for (const [conn] of room.users) {
    if (conn !== excludeConn && conn.readyState === 1) {
      conn.send(json);
    }
  }
};

const broadcastUserList = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const users = [];
  for (const [, user] of room.users) {
    users.push({
      id: user.id,
      name: user.name,
      color: user.color,
      isReadOnly: user.isReadOnly
    });
  }

  broadcastToRoom(roomId, {
    type: 'userList',
    users
  });
};

wss.on('connection', (conn, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room') || 'default';
  const isReadOnly = url.searchParams.get('readonly') === 'true';

  const userId = nanoid(8);
  const userName = `用户_${userId.slice(0, 4)}`;
  const userColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;

  const room = getRoom(roomId);

  const userInfo = {
    id: userId,
    name: userName,
    color: userColor,
    isReadOnly,
    roomId
  };
  room.users.set(conn, userInfo);

  const selfInfo = {
    type: 'init',
    self: userInfo,
    users: Array.from(room.users.values()),
    messages: room.messages.slice(-50)
  };
  conn.send(JSON.stringify(selfInfo));

  broadcastToRoom(roomId, {
    type: 'system',
    id: nanoid(),
    message: `${userName} 加入了房间`,
    timestamp: Date.now()
  });

  broadcastUserList(roomId);

  conn.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'chat': {
          if (!msg.message || !msg.message.trim()) return;

          const chatMsg = {
            type: 'chat',
            id: nanoid(),
            userId,
            userName,
            userColor,
            message: msg.message.trim(),
            timestamp: Date.now()
          };

          broadcastChat(roomId, chatMsg);
          break;
        }

        case 'rename': {
          if (!msg.name || !msg.name.trim()) return;
          const newName = msg.name.trim().slice(0, 20);
          userInfo.name = newName;

          broadcastToRoom(roomId, {
            type: 'system',
            id: nanoid(),
            message: `${userName} 改名为 ${newName}`,
            timestamp: Date.now()
          });

          broadcastUserList(roomId);
          break;
        }
      }
    } catch (err) {
      console.error('[App] Message parse error:', err.message);
    }
  });

  conn.on('close', () => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.users.delete(conn);

    if (room.chatTimer) {
      clearTimeout(room.chatTimer);
      flushChatBatch(roomId);
    }

    broadcastToRoom(roomId, {
      type: 'system',
      id: nanoid(),
      message: `${userName} 离开了房间`,
      timestamp: Date.now()
    });

    if (room.users.size === 0) {
      rooms.delete(roomId);
      console.log(`[App] Cleaned up room: ${roomId}`);
    } else {
      broadcastUserList(roomId);
    }
  });

  console.log(`[App] Client connected to room: ${roomId} (readonly=${isReadOnly})`);
});

console.log(`[App] WebSocket server running on ws://localhost:${config.appPort}`);
