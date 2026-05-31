const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dconfig', {
  start: (opts) => ipcRenderer.invoke('node:start', opts),
  stop: () => ipcRenderer.invoke('node:stop'),
  status: () => ipcRenderer.invoke('node:status'),
  getDHTHealth: () => ipcRenderer.invoke('dht:health'),
  verifyDAG: () => ipcRenderer.invoke('dag:verify'),
  verifyRemoteDAG: (peerId) => ipcRenderer.invoke('dag:verify-remote', peerId),
  requestRemoteDAG: (peerId) => ipcRenderer.invoke('dag:request-remote', peerId),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', { key, value }),
  deleteConfig: (key) => ipcRenderer.invoke('config:delete', { key }),
  setMergeStrategy: (strategy) => ipcRenderer.invoke('config:mergeStrategy', strategy),
  onState: (cb) => {
    const handler = (_ev, data) => cb(data);
    ipcRenderer.on('state:update', handler);
    return () => ipcRenderer.off('state:update', handler);
  },
  onEvent: (cb) => {
    const handler = (_ev, data) => cb(data);
    ipcRenderer.on('node:event', handler);
    return () => ipcRenderer.off('node:event', handler);
  },
});
