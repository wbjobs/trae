const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-room', (callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      creator: socket.id,
      peer: null,
      fileTransferState: null
    });
    socket.join(roomId);
    callback({ success: true, roomId });
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  socket.on('join-room', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }
    if (room.peer) {
      callback({ success: false, error: 'Room is full' });
      return;
    }
    room.peer = socket.id;
    socket.join(roomId);
    callback({ success: true, roomId });
    io.to(room.creator).emit('peer-joined', { peerId: socket.id });
    console.log(`Peer ${socket.id} joined room ${roomId}`);
  });

  socket.on('signal', ({ roomId, data }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const targetId = socket.id === room.creator ? room.peer : room.creator;
    if (targetId) {
      io.to(targetId).emit('signal', { data });
    }
  });

  socket.on('save-transfer-state', ({ roomId, state }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.fileTransferState = state;
    }
  });

  socket.on('get-transfer-state', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (room && room.fileTransferState) {
      callback({ success: true, state: room.fileTransferState });
    } else {
      callback({ success: false, error: 'No transfer state found' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      if (room.creator === socket.id) {
        if (room.peer) {
          io.to(room.peer).emit('peer-disconnected');
        }
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (creator left)`);
      } else if (room.peer === socket.id) {
        room.peer = null;
        io.to(room.creator).emit('peer-disconnected');
        console.log(`Peer left room ${roomId}`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
