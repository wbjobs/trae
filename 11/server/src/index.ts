import express from 'express';
import cors from 'cors';
import http from 'http';
import { SubtitleOffsetStore } from './database';
import {
  VideoStreamer,
  VideoChunk,
  SubtitleChunk,
  getVideoFiles,
  DriftEvent
} from './streamer';
import {
  ReliableSubtitleTransport,
  ReliableTransportStats
} from './reliableTransport';
import path from 'path';
import fs from 'fs';

const PORT = parseInt(process.env.PORT || '8080', 10);
const VIDEO_DIR = path.join(process.cwd(), 'videos');

if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const db = new SubtitleOffsetStore();

interface ActiveStream {
  streamer: VideoStreamer;
  videoId: string;
  clients: Set<ClientSession>;
}

interface ClientSession {
  id: string;
  sendVideo: (chunk: VideoChunk) => void;
  sendSubtitle: (chunk: SubtitleChunk) => void;
  sendDrift: (event: DriftEvent) => void;
  reliableTransport: ReliableSubtitleTransport;
  closed: boolean;
}

const activeStreams = new Map<string, ActiveStream>();
const clientSessions = new Map<string, ClientSession>();

app.get('/api/videos', (_req, res) => {
  const videos = getVideoFiles(VIDEO_DIR);
  res.json({ videos });
});

app.get('/api/offset/:videoId', (req, res) => {
  const { videoId } = req.params;
  const offset = db.getOffset(videoId);
  res.json({ videoId, offset: offset ?? 0 });
});

app.post('/api/offset', (req, res) => {
  const { videoId, offsetMs } = req.body;
  
  if (typeof videoId !== 'string' || typeof offsetMs !== 'number') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const record = db.saveOffset(videoId, Math.round(offsetMs));
  res.json(record);
});

app.get('/api/offsets', (_req, res) => {
  const offsets = db.getAllOffsets();
  res.json(offsets);
});

function handleVideoChunk(streamId: string, chunk: VideoChunk) {
  const stream = activeStreams.get(streamId);
  if (!stream) return;

  for (const client of stream.clients) {
    if (!client.closed) {
      client.sendVideo(chunk);
    }
  }
}

function handleSubtitleChunk(streamId: string, chunk: SubtitleChunk) {
  const stream = activeStreams.get(streamId);
  if (!stream) return;

  for (const client of stream.clients) {
    if (!client.closed) {
      client.sendSubtitle(chunk);
    }
  }
}

function handleDriftEvent(streamId: string, event: DriftEvent) {
  const stream = activeStreams.get(streamId);
  if (!stream) return;

  for (const client of stream.clients) {
    if (!client.closed) {
      client.sendDrift(event);
    }
  }
}

function serializeDriftEvent(event: DriftEvent): Buffer {
  const payload = Buffer.from(JSON.stringify(event.result), 'utf8');
  const header = Buffer.alloc(8);
  header.writeBigUint64BE(BigInt(payload.length), 0);

  return Buffer.concat([Buffer.from([0x05]), header, payload]);
}

function startStream(videoId: string): ActiveStream {
  let stream = activeStreams.get(videoId);
  
  if (stream) return stream;

  const videoPath = path.join(VIDEO_DIR, videoId);
  const streamer = new VideoStreamer({
    videoPath,
    fps: 30,
    bitrate: '2M'
  });

  stream = {
    streamer,
    videoId,
    clients: new Set()
  };

  streamer.on('video', (chunk: VideoChunk) => {
    handleVideoChunk(videoId, chunk);
  });

  streamer.on('subtitle', (chunk: SubtitleChunk) => {
    handleSubtitleChunk(videoId, chunk);
  });

  streamer.on('drift', (event: DriftEvent) => {
    handleDriftEvent(videoId, event);
  });

  streamer.on('end', () => {
    console.log(`Stream ${videoId} ended`);
    activeStreams.delete(videoId);
  });

  activeStreams.set(videoId, stream);
  streamer.start();

  console.log(`Started stream for ${videoId}`);
  return stream;
}

function addClientToStream(session: ClientSession, videoId: string) {
  const stream = startStream(videoId);
  stream.clients.add(session);
  clientSessions.set(session.id, session);
  console.log(`Client ${session.id} joined stream ${videoId}`);
}

function removeClient(session: ClientSession) {
  session.closed = true;
  
  for (const [, stream] of activeStreams) {
    if (stream.clients.has(session)) {
      stream.clients.delete(session);
      console.log(`Client ${session.id} left stream ${stream.videoId}`);
      
      if (stream.clients.size === 0) {
        stream.streamer.stop();
        activeStreams.delete(stream.videoId);
        console.log(`Stopped stream ${stream.videoId} - no clients`);
      }
      break;
    }
  }
  
  clientSessions.delete(session.id);
}

function serializeVideoChunk(chunk: VideoChunk): Uint8Array {
  const header = Buffer.alloc(24);
  header.writeBigUint64BE(BigInt(chunk.data.length), 0);
  header.writeDoubleBE(chunk.pts, 8);
  header.writeDoubleBE(chunk.dts, 16);
  
  const flags = Buffer.alloc(1);
  flags[0] = chunk.isKeyFrame ? 1 : 0;
  
  return Buffer.concat([
    Buffer.from([0x01]),
    header,
    flags,
    chunk.data
  ]);
}

function serializeSubtitleChunk(chunk: SubtitleChunk): Uint8Array {
  const textBuffer = Buffer.from(chunk.data, 'utf8');
  const header = Buffer.alloc(24);
  header.writeBigUint64BE(BigInt(textBuffer.length), 0);
  header.writeDoubleBE(chunk.pts, 8);
  header.writeDoubleBE(chunk.duration, 16);
  
  return Buffer.concat([
    Buffer.from([0x02]),
    header,
    textBuffer
  ]);
}

app.post('/api/session', (req, res) => {
  const { videoId } = req.body;
  
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId is required' });
  }

  const videoPath = path.join(VIDEO_DIR, videoId);
  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  res.json({
    sessionId,
    videoId,
    supportedTransports: ['websocket'],
    wsEndpoint: `ws://localhost:${PORT}/ws/${sessionId}/${encodeURIComponent(videoId)}`
  });
});

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: /^\/ws\/.+$/ });

wss.on('connection', (ws: any, req: any) => {
  const pathParts = req.url.split('/').filter(Boolean);
  if (pathParts.length < 3) {
    ws.close();
    return;
  }

  const sessionId = pathParts[1];
  const videoId = decodeURIComponent(pathParts[2]);

  console.log(`WebSocket connected: ${sessionId} for video ${videoId}`);

  const sendRaw = (data: Buffer) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(data);
    } catch (e) {
      console.error('Error sending raw data:', e);
    }
  };

  const reliableTransport = new ReliableSubtitleTransport({
    sessionId,
    sendRaw,
    onDeliverSubtitle: () => {},
    onStats: (stats: ReliableTransportStats) => {
      console.log(
        `[ReliableStats] session=${sessionId}, sent=${stats.packetsSent}, retransmitted=${stats.packetsRetransmitted}, lost=${stats.packetsLost}, inFlight=${stats.inFlightCount}`
      );
    }
  });

  const session: ClientSession = {
    id: sessionId,
    closed: false,
    reliableTransport,
    sendVideo: (chunk: VideoChunk) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(serializeVideoChunk(chunk));
      } catch (e) {
        console.error('Error sending video:', e);
      }
    },
    sendSubtitle: (chunk: SubtitleChunk) => {
      reliableTransport.sendSubtitle(chunk);
    },
    sendDrift: (event: DriftEvent) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(serializeDriftEvent(event));
      } catch (e) {
        console.error('Error sending drift event:', e);
      }
    }
  };

  addClientToStream(session, videoId);

  ws.on('message', (data: Buffer) => {
    const sackData = ReliableSubtitleTransport.parseIncomingSACK(data);
    if (sackData) {
      reliableTransport.processSACK(sackData);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket closed: ${sessionId}`);
    reliableTransport.close();
    removeClient(session);
  });

  ws.on('error', (err: Error) => {
    console.error(`WebSocket error:`, err);
    reliableTransport.close();
    removeClient(session);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Video directory: ${VIDEO_DIR}`);
  console.log('Available endpoints:');
  console.log('  GET  /api/videos          - List available videos');
  console.log('  GET  /api/offset/:videoId - Get subtitle offset');
  console.log('  POST /api/offset          - Save subtitle offset');
  console.log('  POST /api/session         - Create streaming session');
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  
  for (const [, stream] of activeStreams) {
    stream.streamer.stop();
  }
  
  db.close();
  process.exit(0);
});
