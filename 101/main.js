const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const P2PNode = require('./src/p2pNode');
const ConfigStore = require('./src/configStore');

let mainWindow = null;
let p2pNode = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'dConfig Sync',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (p2pNode) {
    try { await p2pNode.stop(); } catch (e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});

function pushState() {
  if (!mainWindow || !p2pNode) return;
  const payload = {
    peerId: p2pNode.getPeerId(),
    addresses: p2pNode.getAddresses(),
    peers: p2pNode.getConnectedPeers(),
    config: p2pNode.configStore.getSnapshot(),
    history: p2pNode.configStore.getHistory(),
    mergeStrategy: p2pNode.configStore.mergeStrategy,
    dhtHealth: p2pNode.getDHTHealth(),
    dag: {
      chain: p2pNode.configStore.getDAGChain(),
      headHash: p2pNode.configStore.getDAGHeadHash(),
      genesisHash: p2pNode.configStore.getDAG().genesisHash,
      size: p2pNode.configStore.getDAG().size(),
    },
  };
  mainWindow.webContents.send('state:update', payload);
}

ipcMain.handle('node:start', async (_event, opts = {}) => {
  if (p2pNode) {
    return { started: true, peerId: p2pNode.getPeerId(), addresses: p2pNode.getAddresses() };
  }

  const configStore = new ConfigStore({
    mergeStrategy: opts.mergeStrategy || ConfigStore.MERGE_LWW,
  });

  p2pNode = new P2PNode({
    configStore,
    bootstraps: opts.bootstraps || [],
    listenAddresses: opts.listenAddresses || ['/ip4/0.0.0.0/tcp/0'],
    mergeStrategy: opts.mergeStrategy || ConfigStore.MERGE_LWW,
  });

  p2pNode.on((msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('node:event', msg);
    }
    if (['peer-connect', 'peer-disconnect', 'config-change', 'snapshot-imported', 'started', 'dag-imported', 'dag-verify-result', 'dag-verify-failed'].includes(msg.event)) {
      pushState();
    }
  });

  configStore.onChange(() => {
    pushState();
  });

  await p2pNode.start();
  return { started: true, peerId: p2pNode.getPeerId(), addresses: p2pNode.getAddresses() };
});

ipcMain.handle('node:stop', async () => {
  if (p2pNode) {
    await p2pNode.stop();
    p2pNode = null;
    return { stopped: true };
  }
  return { stopped: false };
});

ipcMain.handle('node:status', () => {
  if (!p2pNode) return { started: false };
  return {
    started: true,
    peerId: p2pNode.getPeerId(),
    addresses: p2pNode.getAddresses(),
    peers: p2pNode.getConnectedPeers(),
    config: p2pNode.configStore.getSnapshot(),
    history: p2pNode.configStore.getHistory(),
    mergeStrategy: p2pNode.configStore.mergeStrategy,
    dhtHealth: p2pNode.getDHTHealth(),
    dag: {
      chain: p2pNode.configStore.getDAGChain(),
      headHash: p2pNode.configStore.getDAGHeadHash(),
      genesisHash: p2pNode.configStore.getDAG().genesisHash,
      size: p2pNode.configStore.getDAG().size(),
    },
  };
});

ipcMain.handle('dag:verify', () => {
  if (!p2pNode) return null;
  return p2pNode.configStore.verifyDAG();
});

ipcMain.handle('dag:verify-remote', async (_event, peerId) => {
  if (!p2pNode) return null;
  return p2pNode.verifyRemoteDAG(peerId);
});

ipcMain.handle('dag:request-remote', async (_event, peerId) => {
  if (!p2pNode) return null;
  return p2pNode.requestDAGFrom(peerId);
});

ipcMain.handle('dht:health', () => {
  if (!p2pNode) return null;
  return p2pNode.getDHTHealth();
});

ipcMain.handle('config:set', (_event, { key, value }) => {
  if (!p2pNode) return { applied: false, reason: 'not-started' };
  return p2pNode.configStore.set(key, value);
});

ipcMain.handle('config:delete', (_event, { key }) => {
  if (!p2pNode) return { applied: false, reason: 'not-started' };
  return p2pNode.configStore.delete(key);
});

ipcMain.handle('config:mergeStrategy', (_event, strategy) => {
  if (!p2pNode) return { ok: false };
  if (strategy === ConfigStore.MERGE_LWW || strategy === ConfigStore.MERGE_CRDT) {
    p2pNode.configStore.mergeStrategy = strategy;
    pushState();
    return { ok: true, strategy };
  }
  return { ok: false };
});
