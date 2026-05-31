const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  createRoom: (peerId, nickname) => ipcRenderer.invoke('create-room', { peerId, nickname }),
  joinRoom: (roomCode, peerId, nickname) => ipcRenderer.invoke('join-room', { roomCode, peerId, nickname }),
  leaveRoom: (roomCode, peerId) => ipcRenderer.invoke('leave-room', { roomCode, peerId }),
  getRoomMembers: (roomCode) => ipcRenderer.invoke('get-room-members', { roomCode }),
  
  sendSignalOffer: (fromPeerId, toPeerId, roomCode, sdp) => 
    ipcRenderer.invoke('send-signal-offer', { fromPeerId, toPeerId, roomCode, sdp }),
  sendSignalAnswer: (fromPeerId, toPeerId, roomCode, sdp) => 
    ipcRenderer.invoke('send-signal-answer', { fromPeerId, toPeerId, roomCode, sdp }),
  sendIceCandidate: (fromPeerId, toPeerId, roomCode, candidate, sdpMid, sdpMLineIndex) => 
    ipcRenderer.invoke('send-ice-candidate', { fromPeerId, toPeerId, roomCode, candidate, sdpMid, sdpMLineIndex }),
  
  subscribeSignaling: (peerId) => ipcRenderer.send('subscribe-signaling', { peerId }),
  unsubscribeSignaling: (peerId) => ipcRenderer.send('unsubscribe-signaling', { peerId }),
  
  onSignalMessage: (callback) => {
    ipcRenderer.on('signal-message', (event, data) => callback(data));
  },
  
  onGpsUpdate: (callback) => {
    ipcRenderer.on('gps-update', (event, data) => callback(data));
  },
  
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  
  startGpsSimulation: () => ipcRenderer.invoke('start-gps-simulation'),
  stopGpsSimulation: () => ipcRenderer.invoke('stop-gps-simulation'),
  
  // 位置中转相关
  publishLocation: (roomCode, locationData) => 
    ipcRenderer.invoke('publish-location', { roomCode, locationData }),
  subscribeRoomLocations: (roomCode) => 
    ipcRenderer.send('subscribe-room-locations', { roomCode }),
  getRoomLocations: (roomCode) => 
    ipcRenderer.invoke('get-room-locations', { roomCode }),
  unsubscribeRoomLocations: (roomCode) => 
    ipcRenderer.invoke('unsubscribe-room-locations', { roomCode }),
  onRelayLocationUpdate: (callback) => {
    ipcRenderer.on('relay-location-update', (event, data) => callback(data));
  }
});
