const { app, BrowserWindow, ipcMain, Notification, Menu } = require('electron');
const path = require('path');
const log = require('electron-log');
const RedisClient = require('./redis-client');
const MqttClient = require('./mqtt-client');
const NotificationsService = require('./notifications');

log.initialize();
log.transports.file.level = 'info';
log.info('Application starting...');

let mainWindow;
let redisClient;
let mqttClient;
let notificationsService;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    show: false,
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log.info('Main window displayed');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeServices() {
  try {
    redisClient = new RedisClient();
    await redisClient.connect();
    log.info('Redis client connected');

    mqttClient = new MqttClient();
    mqttClient.on('gpsUpdate', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gps-update', data);
      }
    });
    await mqttClient.connect();
    log.info('MQTT client connected');

    notificationsService = new NotificationsService();
    log.info('Notifications service initialized');
  } catch (error) {
    log.error('Failed to initialize services:', error);
  }
}

ipcMain.handle('create-room', async (event, { peerId, nickname }) => {
  try {
    const roomCode = await redisClient.createRoom(peerId, nickname);
    log.info(`Room created: ${roomCode} by ${peerId}`);
    return { success: true, roomCode };
  } catch (error) {
    log.error('Failed to create room:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('join-room', async (event, { roomCode, peerId, nickname }) => {
  try {
    const result = await redisClient.joinRoom(roomCode, peerId, nickname);
    if (result.success) {
      log.info(`Peer ${peerId} joined room ${roomCode}`);
    }
    return result;
  } catch (error) {
    log.error('Failed to join room:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('leave-room', async (event, { roomCode, peerId }) => {
  try {
    await redisClient.leaveRoom(roomCode, peerId);
    log.info(`Peer ${peerId} left room ${roomCode}`);
    return { success: true };
  } catch (error) {
    log.error('Failed to leave room:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-room-members', async (event, { roomCode }) => {
  try {
    const members = await redisClient.getRoomMembers(roomCode);
    return { success: true, members };
  } catch (error) {
    log.error('Failed to get room members:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-signal-offer', async (event, { fromPeerId, toPeerId, roomCode, sdp }) => {
  try {
    await redisClient.sendSignalingOffer(fromPeerId, toPeerId, roomCode, sdp);
    return { success: true };
  } catch (error) {
    log.error('Failed to send offer:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-signal-answer', async (event, { fromPeerId, toPeerId, roomCode, sdp }) => {
  try {
    await redisClient.sendSignalingAnswer(fromPeerId, toPeerId, roomCode, sdp);
    return { success: true };
  } catch (error) {
    log.error('Failed to send answer:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-ice-candidate', async (event, { fromPeerId, toPeerId, roomCode, candidate, sdpMid, sdpMLineIndex }) => {
  try {
    await redisClient.sendIceCandidate(fromPeerId, toPeerId, roomCode, candidate, sdpMid, sdpMLineIndex);
    return { success: true };
  } catch (error) {
    log.error('Failed to send ICE candidate:', error);
    return { success: false, error: error.message };
  }
});

// 位置数据中转 IPC 接口
ipcMain.handle('publish-location', async (event, { roomCode, locationData }) => {
  try {
    await redisClient.publishLocationUpdate(roomCode, locationData);
    return { success: true };
  } catch (error) {
    log.error('Failed to publish location:', error);
    return { success: false, error: error.message };
  }
});

let locationCallbackHandler = null;

ipcMain.on('subscribe-room-locations', (event, { roomCode }) => {
  if (locationCallbackHandler) {
    // 清理旧的
    redisClient.unsubscribeFromRoomLocations(roomCode);
  }
  
  locationCallbackHandler = (locationData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('relay-location-update', locationData);
    }
  };
  
  redisClient.subscribeToRoomLocations(roomCode, locationCallbackHandler);
});

ipcMain.handle('get-room-locations', async (event, { roomCode }) => {
  try {
    const locations = await redisClient.getRoomLocations(roomCode);
    return { success: true, locations };
  } catch (error) {
    log.error('Failed to get room locations:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('unsubscribe-room-locations', async (event, { roomCode }) => {
  redisClient.unsubscribeFromRoomLocations(roomCode);
  locationCallbackHandler = null;
  return { success: true };
});

ipcMain.on('subscribe-signaling', (event, { peerId }) => {
  redisClient.subscribeToPeer(peerId, (channel, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('signal-message', { channel, message });
    }
  });
  log.info(`Subscribed to signaling for peer: ${peerId}`);
});

ipcMain.on('unsubscribe-signaling', (event, { peerId }) => {
  redisClient.unsubscribeFromPeer(peerId);
  log.info(`Unsubscribed from signaling for peer: ${peerId}`);
});

ipcMain.handle('show-notification', async (event, { title, body }) => {
  try {
    notificationsService.show(title, body);
    return { success: true };
  } catch (error) {
    log.error('Failed to show notification:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-gps-simulation', async () => {
  try {
    mqttClient.startSimulation();
    log.info('GPS simulation started');
    return { success: true };
  } catch (error) {
    log.error('Failed to start GPS simulation:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-gps-simulation', async () => {
  try {
    mqttClient.stopSimulation();
    log.info('GPS simulation stopped');
    return { success: true };
  } catch (error) {
    log.error('Failed to stop GPS simulation:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(async () => {
  await initializeServices();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (redisClient) {
    await redisClient.disconnect();
  }
  if (mqttClient) {
    await mqttClient.disconnect();
  }
  log.info('Application shutting down');
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection at:', promise, 'reason:', reason);
});
