const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const Annotation = require('./models/Annotation');
const Room = require('./models/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb://localhost:27017/video-annotation', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

const rooms = new Map();

function getRoomState(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostId: null,
      isPlaying: false,
      currentTime: 0,
      users: new Map(),
      lastUpdate: Date.now()
    });
  }
  return rooms.get(roomId);
}

app.post('/api/room/create', async (req, res) => {
  try {
    const { userName, videoUrl } = req.body;
    const roomId = uuidv4().slice(0, 8);
    const hostId = uuidv4();

    const room = new Room({
      roomId,
      videoUrl,
      hostId,
      hostName: userName
    });
    await room.save();

    res.json({
      roomId,
      hostId,
      videoUrl,
      hostName: userName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/room/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({
      roomId: room.roomId,
      videoUrl: room.videoUrl,
      hostName: room.hostName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/room/:roomId/annotations', async (req, res) => {
  try {
    const { roomId } = req.params;
    const annotations = await Annotation.find({ roomId }).sort({ timestamp: 1 });
    res.json(annotations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', async ({ roomId, userId, userName, isHost }) => {
    const room = getRoomState(roomId);
    
    socket.join(roomId);
    
    room.users.set(userId, {
      id: userId,
      name: userName,
      socketId: socket.id,
      isHost: isHost || false
    });

    if (isHost && !room.hostId) {
      room.hostId = userId;
    }

    socket.emit('room-state', {
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
      users: Array.from(room.users.values()).map(u => ({
        id: u.id,
        name: u.name,
        isHost: u.isHost
      }))
    });

    io.to(roomId).emit('user-joined', {
      userId,
      userName,
      isHost,
      users: Array.from(room.users.values()).map(u => ({
        id: u.id,
        name: u.name,
        isHost: u.isHost
      }))
    });

    console.log(`User ${userName} joined room ${roomId}`);
  });

  socket.on('video-control', ({ roomId, userId, action, currentTime }) => {
    const room = getRoomState(roomId);
    const user = room.users.get(userId);
    
    if (!user) return;

    if (action === 'play') {
      room.isPlaying = true;
      room.currentTime = currentTime;
      room.lastUpdate = Date.now();
      io.to(roomId).emit('video-play', {
        currentTime,
        userId,
        userName: user.name
      });
    } else if (action === 'pause') {
      room.isPlaying = false;
      room.currentTime = currentTime;
      io.to(roomId).emit('video-pause', {
        currentTime,
        userId,
        userName: user.name
      });
    } else if (action === 'seek') {
      room.currentTime = currentTime;
      io.to(roomId).emit('video-seek', {
        currentTime,
        userId,
        userName: user.name
      });
    }
  });

  socket.on('sync-time', ({ roomId, currentTime }) => {
    const room = getRoomState(roomId);
    room.currentTime = currentTime;
    room.lastUpdate = Date.now();
  });

  socket.on('annotation', async (data) => {
    const { roomId, userId, type, annotationData, timestamp, color } = data;
    const room = getRoomState(roomId);
    const user = room.users.get(userId);
    
    if (!user) return;

    const annotation = new Annotation({
      roomId,
      type,
      data: annotationData,
      timestamp,
      userId,
      userName: user.name,
      color
    });
    await annotation.save();

    io.to(roomId).emit('annotation', {
      _id: annotation._id,
      type,
      data: annotationData,
      timestamp,
      userId,
      userName: user.name,
      color
    });
  });

  socket.on('delete-annotation', async ({ roomId, annotationId, userId }) => {
    const room = getRoomState(roomId);
    const user = room.users.get(userId);
    
    if (!user) return;

    const annotation = await Annotation.findById(annotationId);
    if (annotation && (annotation.userId === userId || user.isHost)) {
      await Annotation.findByIdAndDelete(annotationId);
      io.to(roomId).emit('annotation-deleted', { annotationId });
    }
  });

  socket.on('clear-annotations', async ({ roomId, userId }) => {
    const room = getRoomState(roomId);
    const user = room.users.get(userId);
    
    if (!user || !user.isHost) return;

    await Annotation.deleteMany({ roomId });
    io.to(roomId).emit('annotations-cleared');
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms) {
      for (const [userId, user] of room.users) {
        if (user.socketId === socket.id) {
          room.users.delete(userId);
          
          io.to(roomId).emit('user-left', {
            userId,
            userName: user.name,
            users: Array.from(room.users.values()).map(u => ({
              id: u.id,
              name: u.name,
              isHost: u.isHost
            }))
          });

          if (room.hostId === userId && room.users.size > 0) {
            const newHost = room.users.values().next().value;
            newHost.isHost = true;
            room.hostId = newHost.id;
            io.to(roomId).emit('host-changed', {
              hostId: newHost.id,
              hostName: newHost.name
            });
          }

          if (room.users.size === 0) {
            rooms.delete(roomId);
          }
          
          console.log(`User ${user.name} left room ${roomId}`);
          break;
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
