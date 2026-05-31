const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const {
  createContainer,
  resizeContainer,
  getContainerStats,
  removeContainer,
  updateActivity,
  isContainerActive,
  sendInput,
} = require('./dockerService');

const sessions = new Map();
const containerToSession = new Map();
let statsInterval = null;

const RATE_LIMIT_WINDOW = 1000;
const MAX_MESSAGES_PER_WINDOW = 100;

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  startStatsLoop(wss);

  wss.on('connection', (ws) => {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      ws,
      containerId: null,
      messageTimestamps: [],
      createdAt: Date.now(),
    };

    sessions.set(sessionId, session);

    ws.on('message', (data) => {
      if (!checkRateLimit(session)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: '请求频率过高，请稍后再试',
        }));
        return;
      }

      handleMessage(ws, session, data);
    });

    ws.on('close', () => {
      handleDisconnect(sessionId);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error for session', sessionId, ':', err);
      handleDisconnect(sessionId);
    });
  });

  return wss;
}

function checkRateLimit(session) {
  const now = Date.now();
  session.messageTimestamps = session.messageTimestamps.filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW
  );

  if (session.messageTimestamps.length >= MAX_MESSAGES_PER_WINDOW) {
    return false;
  }

  session.messageTimestamps.push(now);
  return true;
}

function handleMessage(ws, session, data) {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    return;
  }

  switch (message.type) {
    case 'create':
      handleCreate(ws, session, message);
      break;
    case 'input':
      handleInput(session, message);
      break;
    case 'resize':
      handleResize(session, message);
      break;
    case 'stats':
      handleStats(ws, session);
      break;
    case 'destroy':
      handleDestroy(session);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

async function handleCreate(ws, session, message) {
  const { image, cmd } = message;

  if (session.containerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '该会话已存在容器，请先销毁现有容器',
    }));
    return;
  }

  try {
    const containerInfo = await createContainer(image, cmd || ['/bin/sh']);
    session.containerId = containerInfo.id;
    containerToSession.set(containerInfo.id, session.id);

    ws.send(JSON.stringify({
      type: 'created',
      containerId: containerInfo.id,
      image: containerInfo.image,
    }));

    setupStreamHandlers(session, containerInfo);
  } catch (err) {
    console.error('Failed to create container for session', session.id, ':', err);
    ws.send(JSON.stringify({
      type: 'error',
      message: `创建容器失败: ${err.message}`,
    }));
  }
}

function setupStreamHandlers(session, containerInfo) {
  const { stream, id } = containerInfo;

  stream.on('data', (chunk) => {
    const currentSession = sessions.get(session.id);
    if (currentSession && currentSession.ws.readyState === WebSocket.OPEN) {
      currentSession.ws.send(JSON.stringify({
        type: 'output',
        data: chunk.toString('utf8'),
      }));
    }
    updateActivity(id);
  });

  stream.on('error', (err) => {
    console.error('Stream error for container', id, ':', err);
    const currentSession = sessions.get(session.id);
    if (currentSession && currentSession.ws.readyState === WebSocket.OPEN) {
      currentSession.ws.send(JSON.stringify({
        type: 'error',
        message: `流错误: ${err.message}`,
      }));
    }
  });

  stream.on('end', () => {
    const currentSession = sessions.get(session.id);
    if (currentSession && currentSession.ws.readyState === WebSocket.OPEN) {
      currentSession.ws.send(JSON.stringify({
        type: 'container-exited',
        containerId: id,
      }));
    }
  });
}

function handleInput(session, message) {
  const { data } = message;
  const containerId = session.containerId;

  if (!containerId || !isContainerActive(containerId)) {
    session.ws.send(JSON.stringify({
      type: 'error',
      message: '没有活跃的容器',
    }));
    return;
  }

  const ownerSessionId = containerToSession.get(containerId);
  if (ownerSessionId !== session.id) {
    console.warn('Session', session.id, 'attempted to access container', containerId, 'owned by', ownerSessionId);
    session.ws.send(JSON.stringify({
      type: 'error',
      message: '无权访问该容器',
    }));
    return;
  }

  sendInput(containerId, data);
}

function handleResize(session, message) {
  const { cols, rows } = message;
  const containerId = session.containerId;

  if (!containerId) return;

  const ownerSessionId = containerToSession.get(containerId);
  if (ownerSessionId !== session.id) {
    return;
  }

  resizeContainer(containerId, cols, rows);
}

async function handleStats(ws, session) {
  const containerId = session.containerId;

  if (!containerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '没有活跃的容器',
    }));
    return;
  }

  const ownerSessionId = containerToSession.get(containerId);
  if (ownerSessionId !== session.id) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '无权访问该容器',
    }));
    return;
  }

  try {
    const stats = await getContainerStats(containerId);
    ws.send(JSON.stringify({
      type: 'stats',
      stats,
    }));
  } catch (err) {
    console.error('Failed to get stats for container', containerId, ':', err);
  }
}

function handleDestroy(session) {
  const { containerId } = session;

  if (containerId) {
    const ownerSessionId = containerToSession.get(containerId);
    if (ownerSessionId === session.id) {
      removeContainer(containerId);
      containerToSession.delete(containerId);
      session.containerId = null;

      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'destroyed',
          containerId,
        }));
      }
    }
  }
}

function handleDisconnect(sessionId) {
  const session = sessions.get(sessionId);

  if (session) {
    if (session.containerId) {
      removeContainer(session.containerId);
      containerToSession.delete(session.containerId);
    }
    sessions.delete(sessionId);
  }
}

function startStatsLoop(wss) {
  if (statsInterval) {
    clearInterval(statsInterval);
  }

  statsInterval = setInterval(async () => {
    for (const [sessionId, session] of sessions.entries()) {
      if (session.containerId && session.ws.readyState === WebSocket.OPEN) {
        const ownerSessionId = containerToSession.get(session.containerId);
        if (ownerSessionId === sessionId) {
          try {
            const stats = await getContainerStats(session.containerId);
            session.ws.send(JSON.stringify({
              type: 'stats',
              stats,
            }));
          } catch (err) {
          }
        }
      }
    }
  }, 2000);
}

function getActiveSessions() {
  return sessions.size;
}

module.exports = {
  setupWebSocket,
  getActiveSessions,
};
