import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';

import { initDB, createRoom, getVersionHistory } from './db.js';
import { 
  getOrCreateRoom, 
  addUserToRoom, 
  removeUserFromRoom, 
  getRoomUsers,
  saveRoomState,
  updateCursor,
  getAllCursorStates,
  addFrozenRange,
  removeFrozenRange,
  getFrozenRanges,
  canEditRange,
} from './roomManager.js';
import { User, CursorPosition, WebRTCSignal, FrozenRange } from './types.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const userColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

app.get('/api/rooms/:roomId/history', async (req, res) => {
  try {
    const history = await getVersionHistory(req.params.roomId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/rooms', async (req, res) => {
  const roomId = uuidv4();
  const { name } = req.body;
  await createRoom(roomId, name || 'Untitled');
  res.json({ roomId });
});

io.on('connection', (socket) => {
  let currentUser: User | null = null;

  socket.on('join-room', async ({ roomId, userName }) => {
    try {
      const room = await getOrCreateRoom(roomId);
      
      const colorIndex = room.users.size % userColors.length;
      const user: User = {
        id: socket.id,
        name: userName || 'Anonymous',
        color: userColors[colorIndex],
        roomId,
      };

      currentUser = user;
      addUserToRoom(roomId, user);
      socket.join(roomId);

      socket.emit('user-joined', {
        user,
        users: getRoomUsers(roomId),
        yjsState: Y.encodeStateAsUpdate(room.yjsDoc),
        cursorStates: getAllCursorStates(roomId),
        frozenRanges: getFrozenRanges(roomId),
      });

      socket.to(roomId).emit('user-joined', {
        user,
        users: getRoomUsers(roomId),
      });

      console.log(`User ${user.name} joined room ${roomId}`);

      room.yjsDoc.on('update', (update: Uint8Array, origin: any) => {
        if (origin !== socket.id) {
          socket.emit('yjs-update', update);
        }
      });

    } catch (err) {
      console.error('Join room error:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('yjs-update', ({ roomId, update }) => {
    const room = getOrCreateRoom(roomId);
    room.then(r => {
      Y.applyUpdate(r.yjsDoc, update, socket.id);
      socket.to(roomId).emit('yjs-update', update);
    });
  });

  socket.on('cursor-move', ({ roomId, position }: { roomId: string; position: Omit<CursorPosition, 'userId'> }) => {
    const fullPosition: CursorPosition = {
      ...position,
      userId: socket.id,
    };

    const { shouldBroadcast, resolvedPosition } = updateCursor(roomId, fullPosition);
    
    if (shouldBroadcast) {
      socket.to(roomId).emit('cursor-move', resolvedPosition);
    } else {
      socket.emit('cursor-rejected', {
        received: fullPosition,
        resolved: resolvedPosition,
        reason: 'older_lamport_time'
      });
    }
  });

  socket.on('freeze-range', ({ roomId, range }: { 
    roomId: string; 
    range: Omit<FrozenRange, 'id' | 'lockedAt' | 'lockedBy' | 'lockedByName'> 
  }) => {
    const user = currentUser;
    if (!user) {
      socket.emit('freeze-error', { error: 'User not authenticated' });
      return;
    }

    const fullRange = {
      ...range,
      lockedBy: socket.id,
      lockedByName: user.name,
    };

    const result = addFrozenRange(roomId, fullRange);
    
    if (result.success && result.range) {
      socket.emit('freeze-success', { range: result.range });
      socket.to(roomId).emit('range-frozen', { range: result.range });
    } else {
      socket.emit('freeze-error', { error: result.error });
    }
  });

  socket.on('unfreeze-range', ({ roomId, rangeId }: { roomId: string; rangeId: string }) => {
    const result = removeFrozenRange(roomId, rangeId, socket.id);
    
    if (result.success) {
      socket.emit('unfreeze-success', { rangeId });
      socket.to(roomId).emit('range-unfrozen', { rangeId });
    } else {
      socket.emit('unfreeze-error', { error: result.error });
    }
  });

  socket.on('webrtc-signal', ({ roomId, signal }: { roomId: string; signal: WebRTCSignal }) => {
    const targetSocket = io.sockets.sockets.get(signal.to);
    if (targetSocket) {
      targetSocket.emit('webrtc-signal', {
        ...signal,
        from: socket.id,
      });
    }
  });

  socket.on('save-version', async ({ roomId, userId }) => {
    await saveRoomState(roomId, userId);
    socket.to(roomId).emit('version-saved');
  });

  socket.on('chat-message', ({ roomId, message, userName }) => {
    io.to(roomId).emit('chat-message', {
      userId: socket.id,
      userName,
      message,
      timestamp: Date.now(),
    });
  });

  socket.on('leave-room', async ({ roomId }) => {
    if (currentUser) {
      removeUserFromRoom(roomId, socket.id);
      socket.leave(roomId);
      socket.to(roomId).emit('user-left', {
        userId: socket.id,
        users: getRoomUsers(roomId),
      });
      console.log(`User ${currentUser.name} left room ${roomId}`);
    }
  });

  socket.on('disconnect', async () => {
    if (currentUser) {
      removeUserFromRoom(currentUser.roomId, socket.id);
      socket.to(currentUser.roomId).emit('user-left', {
        userId: socket.id,
        users: getRoomUsers(currentUser.roomId),
      });
      console.log(`User ${currentUser.name} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  await initDB();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
