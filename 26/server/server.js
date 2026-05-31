const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FFmpegMixer = require('./ffmpeg-mixer');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const mixers = new Map();
const activeSpeakers = new Map();

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    rooms: Array.from(rooms.keys()).map(roomId => ({
      id: roomId,
      participants: rooms.get(roomId).size
    }))
  });
});

app.get('/api/recordings', (req, res) => {
  const recordingsDir = path.join(__dirname, 'recordings');
  if (!fs.existsSync(recordingsDir)) {
    return res.json([]);
  }
  
  const files = fs.readdirSync(recordingsDir)
    .filter(file => file.endsWith('.mp4'))
    .map(file => {
      const filePath = path.join(recordingsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        created: stats.birthtime,
        url: `/download/${file}`
      };
    });
  
  res.json(files);
});

app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'recordings', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    };
    
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${filename}"`
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  let currentRoom = null;
  let currentRole = null;

  socket.on('join-room', ({ roomId, role, name }) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    
    const room = rooms.get(roomId);
    currentRoom = roomId;
    currentRole = role;
    const userName = name || 'Anonymous';
    
    const existingParticipants = Array.from(room.values())
      .map(p => ({ id: p.id, role: p.role, name: p.name }));
    
    room.set(socket.id, {
      id: socket.id,
      role,
      name: userName,
      socket
    });
    
    socket.join(roomId);
    
    console.log(`${socket.id} joined room ${roomId} as ${role}`);
    
    socket.emit('room-joined', {
      roomId,
      participants: existingParticipants,
      isHost: role === 'host'
    });
    
    socket.to(roomId).emit('participant-joined', {
      id: socket.id,
      role,
      name: userName
    });
    
    if (role === 'host') {
      if (!mixers.has(roomId)) {
        const mixer = new FFmpegMixer();
        mixers.set(roomId, mixer);
        
        mixer.on('started', (outputPath) => {
          io.to(roomId).emit('recording-started', { path: outputPath });
        });
        
        mixer.on('finished', (outputPath) => {
          io.to(roomId).emit('recording-finished', { path: outputPath });
        });
        
        mixer.on('error', (err) => {
          io.to(roomId).emit('recording-error', { error: err.message });
        });
      }
      
      const mixer = mixers.get(roomId);
      mixer.addStream(socket.id);
    }
    
    if (role === 'viewer') {
      existingParticipants.forEach(participant => {
        if (participant.role === 'host') {
          const hostSocket = io.sockets.sockets.get(participant.id);
          if (hostSocket) {
            hostSocket.emit('request-offer', {
              from: socket.id,
              to: participant.id
            });
          }
        }
      });
    } else if (role === 'host') {
      existingParticipants.forEach(participant => {
        if (participant.role === 'viewer') {
          socket.emit('request-offer', {
            from: participant.id,
            to: socket.id
          });
        }
      });
    }
  });

  socket.on('offer', ({ to, offer }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('offer', {
        from: socket.id,
        offer
      });
    }
  });

  socket.on('answer', ({ to, answer }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('answer', {
        from: socket.id,
        answer
      });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('ice-candidate', {
        from: socket.id,
        candidate
      });
    }
  });

  socket.on('stream-data', ({ roomId, data }) => {
    if (mixers.has(roomId)) {
      const mixer = mixers.get(roomId);
      mixer.writeData(socket.id, Buffer.from(data));
    }
  });

  socket.on('start-recording', ({ roomId, layout }) => {
    if (mixers.has(roomId)) {
      const mixer = mixers.get(roomId);
      const success = mixer.startMixing(layout);
      if (success) {
        socket.emit('recording-status', { status: 'started', path: mixer.getOutputPath() });
      }
    }
  });

  socket.on('stop-recording', ({ roomId }) => {
    if (mixers.has(roomId)) {
      const mixer = mixers.get(roomId);
      const outputPath = mixer.getOutputPath();
      mixer.stopMixing();
      socket.emit('recording-status', { status: 'stopped', path: outputPath });
    }
  });

  socket.on('negotiation-needed', ({ to, offer }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('negotiation-needed', {
        from: socket.id,
        offer
      });
    }
  });

  socket.on('speaking-status', ({ roomId, isSpeaking, volume }) => {
    if (!rooms.has(roomId)) return;
    
    const room = rooms.get(roomId);
    const participant = room.get(socket.id);
    if (participant) {
      participant.isSpeaking = isSpeaking;
      participant.lastSpeakTime = Date.now();
      participant.volume = volume || 0;
      
      if (isSpeaking) {
        activeSpeakers.set(roomId, {
          id: socket.id,
          name: participant.name,
          volume: volume || 0,
          timestamp: Date.now()
        });
        
        if (mixers.has(roomId)) {
          const mixer = mixers.get(roomId);
          mixer.updateActiveSpeaker(socket.id, participant.name);
        }
      } else {
        const currentSpeaker = activeSpeakers.get(roomId);
        if (currentSpeaker && currentSpeaker.id === socket.id) {
          activeSpeakers.delete(roomId);
          if (mixers.has(roomId)) {
            const mixer = mixers.get(roomId);
            mixer.updateActiveSpeaker(null, null);
          }
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(socket.id);
      
      socket.to(currentRoom).emit('participant-left', {
        id: socket.id
      });
      
      if (currentRole === 'host' && mixers.has(currentRoom)) {
        const mixer = mixers.get(currentRoom);
        mixer.removeStream(socket.id);
      }
      
      if (room.size === 0) {
        rooms.delete(currentRoom);
        if (mixers.has(currentRoom)) {
          const mixer = mixers.get(currentRoom);
          mixer.destroy();
          mixers.delete(currentRoom);
        }
        console.log(`Room ${currentRoom} deleted`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`SFU Signaling Server running on port ${PORT}`);
  console.log(`HTTP API: http://localhost:${PORT}`);
  console.log(`Socket.IO: ws://localhost:${PORT}`);
});
