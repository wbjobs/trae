const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const screenshotCapture = require('./src/vision/ScreenshotCapture');

let mainWindow;
let recorder = null;
let player = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (recorder) {
      recorder.stop();
    }
    if (player) {
      player.stop();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register('Ctrl+Shift+R', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-record');
    }
  });

  globalShortcut.register('Ctrl+Shift+S', () => {
    if (mainWindow) {
      mainWindow.webContents.send('stop-record');
    }
  });

  globalShortcut.register('Ctrl+Shift+P', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-play');
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('save-script', (event, script) => {
  const defaultPath = path.join(app.getPath('documents'), 'auto-scripts');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  const filePath = path.join(defaultPath, `script_${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(script, null, 2));
  event.reply('script-saved', filePath);
});

ipcMain.on('load-script', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const script = JSON.parse(content);
    event.reply('script-loaded', script);
  } catch (err) {
    event.reply('script-load-error', err.message);
  }
});

ipcMain.on('log-message', (event, message) => {
  console.log('[App]', message);
});
