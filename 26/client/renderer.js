const io = require('socket.io-client');

let socket = null;
let localStream = null;
let localAudioStream = null;
let peerConnections = new Map();
let dataChannels = new Map();
let currentRoomId = null;
let currentRole = null;
let selectedSourceId = null;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let audioContext = null;
let analyser = null;
let vadInterval = null;
let isSpeaking = false;
let lastSpeakTime = 0;
let audioStreamSource = null;

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

const elements = {
  serverUrl: document.getElementById('serverUrl'),
  roomId: document.getElementById('roomId'),
  userName: document.getElementById('userName'),
  roleSelect: document.getElementById('roleSelect'),
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  connectionStatus: document.getElementById('connectionStatus'),
  connectionText: document.getElementById('connectionText'),
  currentRoom: document.getElementById('currentRoom'),
  currentRole: document.getElementById('currentRole'),
  participantCount: document.getElementById('participantCount'),
  hostControls: document.getElementById('hostControls'),
  refreshSourcesBtn: document.getElementById('refreshSourcesBtn'),
  sourceList: document.getElementById('sourceList'),
  startShareBtn: document.getElementById('startShareBtn'),
  stopShareBtn: document.getElementById('stopShareBtn'),
  localVideo: document.getElementById('localVideo'),
  layoutSelect: document.getElementById('layoutSelect'),
  startRecordingBtn: document.getElementById('startRecordingBtn'),
  stopRecordingBtn: document.getElementById('stopRecordingBtn'),
  remoteVideos: document.getElementById('remoteVideos'),
  participantsList: document.getElementById('participantsList'),
  recordingsList: document.getElementById('recordingsList'),
  refreshRecordingsBtn: document.getElementById('refreshRecordingsBtn')
};

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'all 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function setConnected(connected) {
  elements.connectionStatus.classList.toggle('connected', connected);
  elements.connectionText.textContent = connected ? '已连接' : '未连接';
  elements.connectBtn.disabled = connected;
  elements.disconnectBtn.disabled = !connected;
  elements.serverUrl.disabled = connected;
  elements.roomId.disabled = connected;
  elements.userName.disabled = connected;
  elements.roleSelect.disabled = connected;
}

elements.connectBtn.addEventListener('click', () => {
  const serverUrl = elements.serverUrl.value.trim();
  const roomId = elements.roomId.value.trim();
  const userName = elements.userName.value.trim() || 'Anonymous';
  const role = elements.roleSelect.value;
  
  if (!serverUrl) {
    showNotification('请输入服务器地址', 'error');
    return;
  }
  
  if (!roomId) {
    showNotification('请输入房间号', 'error');
    return;
  }
  
  connectToServer(serverUrl, roomId, role, userName);
});

elements.disconnectBtn.addEventListener('click', () => {
  disconnectFromServer();
});

function connectToServer(serverUrl, roomId, role, userName) {
  try {
    socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      currentRoomId = roomId;
      currentRole = role;
      
      elements.currentRoom.textContent = roomId;
      elements.currentRole.textContent = role === 'host' ? '主播' : '观众';
      
      socket.emit('join-room', { roomId, role, name: userName });
      
      if (role === 'host') {
        elements.hostControls.style.display = 'block';
        refreshSources();
      } else {
        elements.hostControls.style.display = 'none';
      }
      
      showNotification('已连接到服务器', 'success');
    });
    
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      showNotification('连接服务器失败: ' + error.message, 'error');
      setConnected(false);
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
      cleanup();
      showNotification('已断开连接', 'info');
    });
    
    socket.on('room-joined', (data) => {
      console.log('Room joined:', data);
      updateParticipantCount(data.participants.length + 1);
      updateParticipantsList([{ id: socket.id, role, name: userName }, ...data.participants]);
      
      data.participants.forEach(participant => {
        if (participant.role === 'host') {
          createPeerConnection(participant.id, false);
        }
      });
    });
    
    socket.on('participant-joined', (participant) => {
      console.log('Participant joined:', participant);
      showNotification(`${participant.name} 加入了房间`, 'info');
      
      updateParticipantCount(elements.participantCount.textContent * 1 + 1);
      addParticipantToList(participant);
    });
    
    socket.on('request-offer', async (data) => {
      console.log('Received request-offer from:', data.from, 'to:', data.to);
      
      if (data.to === socket.id && currentRole === 'host') {
        const peerId = data.from;
        
        let pc = peerConnections.get(peerId);
        if (!pc) {
          pc = createPeerConnection(peerId, true);
        }
        
        if (localStream) {
          localStream.getTracks().forEach(track => {
            const senders = pc.getSenders();
            const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
            if (!existingSender) {
              pc.addTrack(track, localStream);
            }
          });
        }
        
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          socket.emit('offer', {
            to: peerId,
            offer: pc.localDescription
          });
        } catch (error) {
          console.error('Error creating offer on request:', error);
        }
      }
    });
    
    socket.on('participant-left', (data) => {
      console.log('Participant left:', data.id);
      const pc = peerConnections.get(data.id);
      if (pc) {
        pc.close();
        peerConnections.delete(data.id);
      }
      
      const videoContainer = document.getElementById(`video-${data.id}`);
      if (videoContainer) {
        videoContainer.remove();
      }
      
      const participantItem = document.querySelector(`[data-participant-id="${data.id}"]`);
      if (participantItem) {
        participantItem.remove();
      }
      
      updateParticipantCount(elements.participantCount.textContent * 1 - 1);
      
      checkEmptyRemoteVideos();
    });
    
    socket.on('offer', async (data) => {
      console.log('Received offer from:', data.from);
      
      let pc = peerConnections.get(data.from);
      if (!pc) {
        pc = createPeerConnection(data.from, false);
      }
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', {
          to: data.from,
          answer: pc.localDescription
        });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });
    
    socket.on('answer', async (data) => {
      console.log('Received answer from:', data.from);
      
      const pc = peerConnections.get(data.from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
          console.error('Error setting remote description:', error);
        }
      }
    });
    
    socket.on('ice-candidate', async (data) => {
      const pc = peerConnections.get(data.from);
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    });
    
    socket.on('recording-started', (data) => {
      console.log('Recording started:', data.path);
      showNotification('服务器录制已开始', 'success');
    });
    
    socket.on('recording-finished', (data) => {
      console.log('Recording finished:', data.path);
      showNotification('服务器录制已完成', 'success');
      loadRecordings();
    });
    
    socket.on('recording-error', (data) => {
      console.error('Recording error:', data.error);
      showNotification('录制错误: ' + data.error, 'error');
    });
    
  } catch (error) {
    console.error('Error connecting to server:', error);
    showNotification('连接失败: ' + error.message, 'error');
  }
}

function disconnectFromServer() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  stopVAD();
  
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
  
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  cleanup();
}

function cleanup() {
  elements.currentRoom.textContent = '-';
  elements.currentRole.textContent = '-';
  elements.participantCount.textContent = '0';
  elements.hostControls.style.display = 'none';
  elements.localVideo.srcObject = null;
  elements.remoteVideos.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">暂无远程视频流</div>';
  elements.participantsList.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">暂无参与者</div>';
  elements.sourceList.innerHTML = '';
  selectedSourceId = null;
  elements.startShareBtn.disabled = true;
  elements.stopShareBtn.disabled = true;
}

function createPeerConnection(peerId, isInitiator) {
  console.log('Creating peer connection with:', peerId, 'isInitiator:', isInitiator);
  
  const pc = new RTCPeerConnection(config);
  peerConnections.set(peerId, pc);
  
  if (localStream && isInitiator) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        to: peerId,
        candidate: event.candidate
      });
    }
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      peerConnections.delete(peerId);
      const videoContainer = document.getElementById(`video-${peerId}`);
      if (videoContainer) {
        videoContainer.remove();
      }
      checkEmptyRemoteVideos();
    }
  };
  
  pc.ontrack = (event) => {
    console.log('Received track from:', peerId);
    const [stream] = event.streams;
    addRemoteVideo(peerId, stream);
  };
  
  pc.onnegotiationneeded = async () => {
    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', {
          to: peerId,
          offer: pc.localDescription
        });
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    }
  };
  
  return pc;
}

function addRemoteVideo(peerId, stream) {
  let container = document.getElementById(`video-${peerId}`);
  
  if (!container) {
    container = document.createElement('div');
    container.id = `video-${peerId}`;
    container.className = 'video-container';
    
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `远程用户 ${peerId.substring(0, 6)}`;
    
    container.appendChild(video);
    container.appendChild(label);
    
    const placeholder = elements.remoteVideos.querySelector('div[style*="text-align: center"]');
    if (placeholder) {
      placeholder.remove();
    }
    
    elements.remoteVideos.appendChild(container);
  }
}

function checkEmptyRemoteVideos() {
  if (elements.remoteVideos.children.length === 0) {
    elements.remoteVideos.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">暂无远程视频流</div>';
  }
}

function updateParticipantCount(count) {
  elements.participantCount.textContent = count;
}

function updateParticipantsList(participants) {
  elements.participantsList.innerHTML = '';
  participants.forEach(p => addParticipantToList(p));
}

function addParticipantToList(participant) {
  const placeholder = elements.participantsList.querySelector('div[style*="text-align: center"]');
  if (placeholder) {
    placeholder.remove();
  }
  
  const item = document.createElement('div');
  item.className = 'participant-item';
  item.dataset.participantId = participant.id;
  
  const avatar = document.createElement('div');
  avatar.className = 'participant-avatar';
  avatar.textContent = participant.name.charAt(0).toUpperCase();
  
  const info = document.createElement('div');
  info.className = 'participant-info';
  
  const name = document.createElement('div');
  name.className = 'participant-name';
  name.textContent = participant.name + (participant.id === socket.id ? ' (我)' : '');
  
  const role = document.createElement('div');
  role.className = 'participant-role';
  role.textContent = participant.role === 'host' ? '主播' : '观众';
  
  info.appendChild(name);
  info.appendChild(role);
  item.appendChild(avatar);
  item.appendChild(info);
  elements.participantsList.appendChild(item);
}

elements.refreshSourcesBtn.addEventListener('click', refreshSources);

async function refreshSources() {
  try {
    elements.sourceList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">加载中...</div>';
    
    const sources = await window.electronAPI.getSources(['screen', 'window']);
    
    elements.sourceList.innerHTML = '';
    
    if (sources.length === 0) {
      elements.sourceList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">未找到可用的共享源</div>';
      return;
    }
    
    sources.forEach(source => {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.dataset.sourceId = source.id;
      
      const thumbnail = document.createElement('img');
      thumbnail.src = source.thumbnail;
      
      const info = document.createElement('div');
      info.className = 'source-info';
      
      const name = document.createElement('div');
      name.className = 'source-name';
      name.textContent = source.name;
      
      const type = document.createElement('div');
      type.className = 'source-type';
      type.textContent = source.id.startsWith('screen') ? '屏幕' : '窗口';
      
      info.appendChild(name);
      info.appendChild(type);
      item.appendChild(thumbnail);
      item.appendChild(info);
      
      item.addEventListener('click', () => {
        document.querySelectorAll('.source-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        selectedSourceId = source.id;
        elements.startShareBtn.disabled = false;
      });
      
      elements.sourceList.appendChild(item);
    });
  } catch (error) {
    console.error('Error getting sources:', error);
    elements.sourceList.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 20px;">获取共享源失败</div>';
    showNotification('获取共享源失败: ' + error.message, 'error');
  }
}

async function startVAD() {
  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioStreamSource = audioContext.createMediaStreamSource(localAudioStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    audioStreamSource.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    vadInterval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      const now = Date.now();
      const threshold = 30;
      
      if (average > threshold) {
        lastSpeakTime = now;
        if (!isSpeaking) {
          isSpeaking = true;
          if (socket && currentRoomId) {
            socket.emit('speaking-status', {
              roomId: currentRoomId,
              isSpeaking: true,
              volume: average
            });
          }
        }
      } else if (isSpeaking && now - lastSpeakTime > 500) {
        isSpeaking = false;
        if (socket && currentRoomId) {
          socket.emit('speaking-status', {
            roomId: currentRoomId,
            isSpeaking: false,
            volume: 0
          });
        }
      }
    }, 100);
    
    console.log('VAD started');
  } catch (error) {
    console.error('Error starting VAD:', error);
  }
}

function stopVAD() {
  if (vadInterval) {
    clearInterval(vadInterval);
    vadInterval = null;
  }
  
  if (audioStreamSource) {
    audioStreamSource.disconnect();
    audioStreamSource = null;
  }
  
  if (analyser) {
    analyser.disconnect();
    analyser = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  if (localAudioStream) {
    localAudioStream.getTracks().forEach(track => track.stop());
    localAudioStream = null;
  }
  
  isSpeaking = false;
  console.log('VAD stopped');
}

elements.startShareBtn.addEventListener('click', async () => {
  if (!selectedSourceId) {
    showNotification('请先选择一个共享源', 'error');
    return;
  }
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSourceId,
          maxWidth: 1920,
          maxHeight: 1080
        }
      }
    });
    
    localStream = stream;
    elements.localVideo.srcObject = stream;
    
    await startVAD();
    
    peerConnections.forEach((pc, peerId) => {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    });
    
    elements.startShareBtn.disabled = true;
    elements.stopShareBtn.disabled = false;
    elements.refreshSourcesBtn.disabled = true;
    
    showNotification('屏幕共享已开始', 'success');
    
  } catch (error) {
    console.error('Error starting screen share:', error);
    showNotification('开始共享失败: ' + error.message, 'error');
  }
});

elements.stopShareBtn.addEventListener('click', () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  stopVAD();
  
  elements.localVideo.srcObject = null;
  elements.startShareBtn.disabled = false;
  elements.stopShareBtn.disabled = true;
  elements.refreshSourcesBtn.disabled = false;
  
  showNotification('屏幕共享已停止', 'info');
});

elements.startRecordingBtn.addEventListener('click', () => {
  if (!socket || !currentRoomId) return;
  
  const layout = elements.layoutSelect.value;
  socket.emit('start-recording', { roomId: currentRoomId, layout });
  
  elements.startRecordingBtn.disabled = true;
  elements.stopRecordingBtn.disabled = false;
  isRecording = true;
  
  showNotification('录制指令已发送', 'info');
});

elements.stopRecordingBtn.addEventListener('click', () => {
  if (!socket || !currentRoomId) return;
  
  socket.emit('stop-recording', { roomId: currentRoomId });
  
  elements.startRecordingBtn.disabled = false;
  elements.stopRecordingBtn.disabled = true;
  isRecording = false;
  
  showNotification('停止录制指令已发送', 'info');
});

elements.refreshRecordingsBtn.addEventListener('click', loadRecordings);

async function loadRecordings() {
  try {
    const serverUrl = elements.serverUrl.value.trim();
    const response = await fetch(`${serverUrl}/api/recordings`);
    const recordings = await response.json();
    
    elements.recordingsList.innerHTML = '';
    
    if (recordings.length === 0) {
      elements.recordingsList.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">暂无录制文件</div>';
      return;
    }
    
    recordings.forEach(recording => {
      const item = document.createElement('div');
      item.className = 'recording-item';
      
      const info = document.createElement('div');
      info.className = 'recording-info';
      
      const name = document.createElement('div');
      name.className = 'recording-name';
      name.textContent = recording.name;
      
      const meta = document.createElement('div');
      meta.className = 'recording-meta';
      const size = (recording.size / 1024 / 1024).toFixed(2);
      const date = new Date(recording.created).toLocaleString();
      meta.textContent = `${size} MB · ${date}`;
      
      info.appendChild(name);
      info.appendChild(meta);
      
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'btn btn-primary';
      downloadBtn.textContent = '下载';
      downloadBtn.style.padding = '6px 12px';
      downloadBtn.style.fontSize = '12px';
      downloadBtn.addEventListener('click', () => {
        window.open(`${serverUrl}${recording.url}`, '_blank');
      });
      
      item.appendChild(info);
      item.appendChild(downloadBtn);
      elements.recordingsList.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading recordings:', error);
    showNotification('加载录制列表失败', 'error');
  }
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
  });
});

setConnected(false);
