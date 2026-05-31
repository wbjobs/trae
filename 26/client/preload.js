const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: (types) => ipcRenderer.invoke('get-sources', types),
  getDisplays: () => ipcRenderer.invoke('get-displays')
});
