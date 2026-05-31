const socket = io();

const userId = localStorage.getItem('userId');
const userName = localStorage.getItem('userName');
const roomId = new URLSearchParams(window.location.search).get('roomId') || localStorage.getItem('roomId');
const isHost = localStorage.getItem('isHost') === 'true';

if (!userId || !userName || !roomId) {
  window.location.href = '/';
}

document.getElementById('roomIdDisplay').textContent = roomId;
document.getElementById('roleDisplay').textContent = isHost ? '主持人' : '观众';

const video = document.getElementById('videoPlayer');
const canvas = document.getElementById('annotationCanvas');
const ctx = canvas.getContext('2d');

let currentTool = 'arrow';
let currentColor = '#ff4444';
let annotations = [];
let isDrawing = false;
let startX = 0;
let startY = 0;
let startRatioX = 0;
let startRatioY = 0;
let pendingTextPosition = null;
let isHostControl = false;
let hostName = '';

let isPlaybackMode = false;
let isPlaybackPlaying = false;
let playbackStartTime = 0;
let playbackEndTime = 0;
let playbackCurrentTime = 0;
let playbackSpeed = 1;
let playbackAnimationId = null;
let playbackLastTimestamp = 0;
let annotationOpacities = new Map();

fetch(`/api/room/${roomId}`)
  .then(res => res.json())
  .then(data => {
    video.src = data.videoUrl;
    hostName = data.hostName;
    document.getElementById('hostDisplay').textContent = hostName;
  })
  .catch(() => {
    alert('房间不存在');
    window.location.href = '/';
  });

fetch(`/api/room/${roomId}/annotations`)
  .then(res => res.json())
  .then(data => {
    annotations = data;
    updateAnnotationList();
    renderAnnotations();
  });

function getVideoDisplaySize() {
  const videoRatio = video.videoWidth / video.videoHeight;
  const containerRect = video.getBoundingClientRect();
  const containerRatio = containerRect.width / containerRect.height;
  
  let displayWidth, displayHeight, offsetX, offsetY;
  
  if (videoRatio > containerRatio) {
    displayWidth = containerRect.width;
    displayHeight = containerRect.width / videoRatio;
    offsetX = 0;
    offsetY = (containerRect.height - displayHeight) / 2;
  } else {
    displayHeight = containerRect.height;
    displayWidth = containerRect.height * videoRatio;
    offsetX = (containerRect.width - displayWidth) / 2;
    offsetY = 0;
  }
  
  return { displayWidth, displayHeight, offsetX, offsetY };
}

function resizeCanvas() {
  const rect = video.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas.style.left = `${rect.left}px`;
  canvas.style.top = `${rect.top}px`;
  renderAnnotations();
}

video.addEventListener('loadedmetadata', resizeCanvas);
window.addEventListener('resize', resizeCanvas);

socket.emit('join-room', { roomId, userId, userName, isHost });

socket.on('room-state', (state) => {
  updateUserList(state.users);
  if (state.users.find(u => u.id === userId)?.isHost) {
    localStorage.setItem('isHost', 'true');
    document.getElementById('roleDisplay').textContent = '主持人';
  }
  
  if (!isHostControl && state.isPlaying) {
    video.currentTime = state.currentTime;
    video.play();
  } else if (!isHostControl && !state.isPlaying) {
    video.currentTime = state.currentTime;
    video.pause();
  }
});

socket.on('user-joined', (data) => {
  updateUserList(data.users);
  showToast(`${data.userName} 加入了房间`);
});

socket.on('user-left', (data) => {
  updateUserList(data.users);
  showToast(`${data.userName} 离开了房间`);
});

socket.on('host-changed', (data) => {
  hostName = data.hostName;
  document.getElementById('hostDisplay').textContent = hostName;
  if (data.hostId === userId) {
    localStorage.setItem('isHost', 'true');
    document.getElementById('roleDisplay').textContent = '主持人';
    showToast('你已成为主持人');
  }
});

socket.on('video-play', (data) => {
  if (userId !== data.userId) {
    isHostControl = true;
    video.currentTime = data.currentTime;
    video.play().catch(() => {});
    setTimeout(() => { isHostControl = false; }, 1000);
  }
  showToast(`${data.userName} 播放了视频`);
});

socket.on('video-pause', (data) => {
  if (userId !== data.userId) {
    isHostControl = true;
    video.currentTime = data.currentTime;
    video.pause();
    setTimeout(() => { isHostControl = false; }, 1000);
  }
  showToast(`${data.userName} 暂停了视频`);
});

socket.on('video-seek', (data) => {
  if (userId !== data.userId) {
    isHostControl = true;
    video.currentTime = data.currentTime;
    setTimeout(() => { isHostControl = false; }, 1000);
  }
  showToast(`${data.userName} 跳转到 ${formatTime(data.currentTime)}`);
});

socket.on('annotation', (data) => {
  annotations.push(data);
  updateAnnotationList();
  renderAnnotations();
  showToast(`${data.userName} 添加了${getTypeName(data.type)}批注`);
});

socket.on('annotation-deleted', (data) => {
  annotations = annotations.filter(a => a._id !== data.annotationId);
  updateAnnotationList();
  renderAnnotations();
});

socket.on('annotations-cleared', () => {
  annotations = [];
  updateAnnotationList();
  renderAnnotations();
  showToast('所有批注已被清除');
});

function updateUserList(users) {
  const list = document.getElementById('userList');
  list.innerHTML = users.map(u => `
    <li>
      <span>${u.name}</span>
      ${u.isHost ? '<span class="host-badge">主持人</span>' : ''}
    </li>
  `).join('');
}

function getTypeName(type) {
  const names = { arrow: '箭头', rectangle: '矩形', text: '文本' };
  return names[type] || type;
}

function updateAnnotationList() {
  const list = document.getElementById('annotationList');
  const currentTime = video.currentTime;
  const tolerance = 5;
  
  const visibleAnnotations = annotations.filter(a => 
    Math.abs(a.timestamp - currentTime) <= tolerance
  );
  
  list.innerHTML = visibleAnnotations.map(a => `
    <div class="annotation-item" onclick="jumpToAnnotation(${a.timestamp})">
      <div class="annotation-meta">
        <span>${a.userName}</span>
        <span>${formatTime(a.timestamp)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:12px;height:12px;background:${a.color};border-radius:50%;"></span>
        <span>${getTypeName(a.type)}${a.type === 'text' ? ': ' + a.data.text : ''}</span>
      </div>
    </div>
  `).join('');
}

function jumpToAnnotation(timestamp) {
  video.currentTime = timestamp;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function copyRoomId() {
  navigator.clipboard.writeText(roomId).then(() => {
    showToast('房间ID已复制到剪贴板');
  });
}

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
    
    if (currentTool === 'select') {
      canvas.classList.remove('drawing', 'eraser');
    } else if (currentTool === 'eraser') {
      canvas.classList.remove('drawing');
      canvas.classList.add('eraser');
    } else {
      canvas.classList.remove('eraser');
      canvas.classList.add('drawing');
    }
  });
});

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
  });
});

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function canvasToVideoRatio(canvasX, canvasY) {
  const { displayWidth, displayHeight, offsetX, offsetY } = getVideoDisplaySize();
  const videoX = canvasX - offsetX;
  const videoY = canvasY - offsetY;
  
  if (videoX < 0 || videoX > displayWidth || videoY < 0 || videoY > displayHeight) {
    return null;
  }
  
  return {
    ratioX: videoX / displayWidth,
    ratioY: videoY / displayHeight
  };
}

function videoRatioToCanvas(ratioX, ratioY) {
  const { displayWidth, displayHeight, offsetX, offsetY } = getVideoDisplaySize();
  return {
    x: offsetX + ratioX * displayWidth,
    y: offsetY + ratioY * displayHeight
  };
}

canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'select') return;
  
  const coords = getCanvasCoords(e);
  const ratio = canvasToVideoRatio(coords.x, coords.y);
  
  if (!ratio && currentTool !== 'eraser') return;
  
  startX = coords.x;
  startY = coords.y;
  startRatioX = ratio ? ratio.ratioX : 0;
  startRatioY = ratio ? ratio.ratioY : 0;
  isDrawing = true;
  
  if (currentTool === 'eraser') {
    deleteAnnotationAt(coords.x, coords.y);
  } else if (currentTool === 'text') {
    if (ratio) {
      pendingTextPosition = { ratioX: ratio.ratioX, ratioY: ratio.ratioY };
      openTextModal();
    }
    isDrawing = false;
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing || currentTool === 'select' || currentTool === 'eraser' || currentTool === 'text') return;
  
  const coords = getCanvasCoords(e);
  const endRatio = canvasToVideoRatio(coords.x, coords.y);
  
  if (!endRatio) return;
  
  const startPos = videoRatioToCanvas(startRatioX, startRatioY);
  const endPos = videoRatioToCanvas(endRatio.ratioX, endRatio.ratioY);
  
  renderAnnotations();
  drawPreview(startPos.x, startPos.y, endPos.x, endPos.y);
});

canvas.addEventListener('mouseup', (e) => {
  if (!isDrawing || currentTool === 'select' || currentTool === 'eraser' || currentTool === 'text') {
    isDrawing = false;
    return;
  }
  
  const coords = getCanvasCoords(e);
  const endRatio = canvasToVideoRatio(coords.x, coords.y);
  isDrawing = false;
  
  if (!endRatio) return;
  
  const data = {
    startX: startRatioX,
    startY: startRatioY,
    endX: endRatio.ratioX,
    endY: endRatio.ratioY,
    width: canvas.width,
    height: canvas.height
  };
  
  sendAnnotation(currentTool, data);
});

canvas.addEventListener('mouseleave', () => {
  if (isDrawing && currentTool !== 'select' && currentTool !== 'text') {
    isDrawing = false;
    renderAnnotations();
  }
});

function drawPreview(x1, y1, x2, y2) {
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.7;
  
  if (currentTool === 'arrow') {
    drawArrow(x1, y1, x2, y2);
  } else if (currentTool === 'rectangle') {
    drawRect(x1, y1, x2, y2);
  }
  
  ctx.globalAlpha = 1;
}

function drawArrow(x1, y1, x2, y2) {
  const headLen = 15;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawRect(x1, y1, x2, y2) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  
  ctx.strokeRect(x, y, w, h);
}

function drawText(x, y, text, color) {
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function renderAnnotations() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const currentTime = isPlaybackMode ? playbackCurrentTime : video.currentTime;
  const tolerance = isPlaybackMode ? 10 : 5;
  const fadeDuration = 1.5;
  const { displayWidth, displayHeight, offsetX, offsetY } = getVideoDisplaySize();
  
  annotations.forEach(a => {
    const timeDiff = currentTime - a.timestamp;
    if (timeDiff < -tolerance || timeDiff > tolerance * 2) return;
    
    let opacity = 1;
    if (isPlaybackMode) {
      if (timeDiff < 0) {
        opacity = 0;
      } else if (timeDiff < fadeDuration) {
        opacity = timeDiff / fadeDuration;
      } else if (timeDiff > tolerance * 2 - fadeDuration) {
        opacity = (tolerance * 2 - timeDiff) / fadeDuration;
      }
      opacity = Math.max(0, Math.min(1, opacity));
      
      const storedOpacity = annotationOpacities.get(a._id) || 0;
      opacity = storedOpacity * 0.9 + opacity * 0.1;
      annotationOpacities.set(a._id, opacity);
    }
    
    let x1, y1, x2, y2;
    
    if (a.data.width && a.data.height) {
      const scaleX = displayWidth / a.data.width;
      const scaleY = displayHeight / a.data.height;
      x1 = offsetX + a.data.startX * scaleX;
      y1 = offsetY + a.data.startY * scaleY;
      x2 = offsetX + a.data.endX * scaleX;
      y2 = offsetY + a.data.endY * scaleY;
    } else {
      x1 = offsetX + a.data.startX * displayWidth;
      y1 = offsetY + a.data.startY * displayHeight;
      x2 = offsetX + a.data.endX * displayWidth;
      y2 = offsetY + a.data.endY * displayHeight;
    }
    
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = opacity * 0.9;
    
    if (a.type === 'arrow') {
      drawArrow(x1, y1, x2, y2);
    } else if (a.type === 'rectangle') {
      drawRect(x1, y1, x2, y2);
    } else if (a.type === 'text') {
      drawText(x1, y1, a.data.text, a.color);
    }
    
    ctx.globalAlpha = 1;
  });
}

function sendAnnotation(type, data) {
  const timestamp = video.currentTime;
  
  const annotationData = {
    startX: data.startX,
    startY: data.startY,
    endX: data.endX,
    endY: data.endY,
    text: data.text
  };
  
  socket.emit('annotation', {
    roomId,
    userId,
    type,
    annotationData,
    timestamp,
    color: currentColor
  });
}

function deleteAnnotationAt(x, y) {
  const tolerance = 10;
  const currentTime = video.currentTime;
  const timeTolerance = 5;
  const { displayWidth, displayHeight, offsetX, offsetY } = getVideoDisplaySize();
  
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    if (Math.abs(a.timestamp - currentTime) > timeTolerance) continue;
    
    let x1, y1, x2, y2;
    
    if (a.data.width && a.data.height) {
      const scaleX = displayWidth / a.data.width;
      const scaleY = displayHeight / a.data.height;
      x1 = offsetX + a.data.startX * scaleX;
      y1 = offsetY + a.data.startY * scaleY;
      x2 = offsetX + a.data.endX * scaleX;
      y2 = offsetY + a.data.endY * scaleY;
    } else {
      x1 = offsetX + a.data.startX * displayWidth;
      y1 = offsetY + a.data.startY * displayHeight;
      x2 = offsetX + a.data.endX * displayWidth;
      y2 = offsetY + a.data.endY * displayHeight;
    }
    
    if (a.type === 'text') {
      if (Math.abs(x - x1) < tolerance * 3 && Math.abs(y - y1) < tolerance * 3) {
        if (a.userId === userId || isHost) {
          socket.emit('delete-annotation', { roomId, annotationId: a._id, userId });
        } else {
          showToast('只能删除自己的批注');
        }
        return;
      }
    } else {
      const minX = Math.min(x1, x2) - tolerance;
      const maxX = Math.max(x1, x2) + tolerance;
      const minY = Math.min(y1, y2) - tolerance;
      const maxY = Math.max(y1, y2) + tolerance;
      
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        if (a.userId === userId || isHost) {
          socket.emit('delete-annotation', { roomId, annotationId: a._id, userId });
        } else {
          showToast('只能删除自己的批注');
        }
        return;
      }
    }
  }
}

function clearAnnotations() {
  if (!isHost) {
    showToast('只有主持人可以清除所有批注');
    return;
  }
  if (confirm('确定要清除所有批注吗？')) {
    socket.emit('clear-annotations', { roomId, userId });
  }
}

function openTextModal() {
  document.getElementById('textInputModal').classList.add('show');
  document.getElementById('textInput').value = '';
  document.getElementById('textInput').focus();
}

function closeTextModal() {
  document.getElementById('textInputModal').classList.remove('show');
  pendingTextPosition = null;
}

function confirmText() {
  const text = document.getElementById('textInput').value.trim();
  if (!text || !pendingTextPosition) {
    closeTextModal();
    return;
  }
  
  const data = {
    startX: pendingTextPosition.ratioX,
    startY: pendingTextPosition.ratioY,
    endX: pendingTextPosition.ratioX,
    endY: pendingTextPosition.ratioY,
    text,
    width: canvas.width,
    height: canvas.height
  };
  
  sendAnnotation('text', data);
  closeTextModal();
}

document.getElementById('textInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmText();
  if (e.key === 'Escape') closeTextModal();
});

function togglePlay() {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

video.addEventListener('play', () => {
  document.getElementById('playPauseBtn').textContent = '⏸️ 暂停';
  if (!isHostControl) {
    socket.emit('video-control', {
      roomId,
      userId,
      action: 'play',
      currentTime: video.currentTime
    });
  }
});

video.addEventListener('pause', () => {
  document.getElementById('playPauseBtn').textContent = '▶️ 播放';
  if (!isHostControl) {
    socket.emit('video-control', {
      roomId,
      userId,
      action: 'pause',
      currentTime: video.currentTime
    });
  }
});

video.addEventListener('seeked', () => {
  if (!isHostControl) {
    socket.emit('video-control', {
      roomId,
      userId,
      action: 'seek',
      currentTime: video.currentTime
    });
  }
  renderAnnotations();
  updateAnnotationList();
});

video.addEventListener('timeupdate', () => {
  const duration = video.duration || 0;
  document.getElementById('timeDisplay').textContent = 
    `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
  
  socket.emit('sync-time', { roomId, currentTime: video.currentTime });
  
  updateAnnotationList();
  renderAnnotations();
});

setInterval(() => {
  if (!isPlaybackMode) {
    renderAnnotations();
  }
}, 100);

function initPlayback() {
  video.addEventListener('loadedmetadata', () => {
    const duration = video.duration || 0;
    document.getElementById('rangeEnd').value = formatTime(duration);
    playbackEndTime = duration;
    renderTimeline();
  });
  
  const timelineCanvas = document.getElementById('timelineCanvas');
  timelineCanvas.addEventListener('click', onTimelineClick);
}

function renderTimeline() {
  const timelineCanvas = document.getElementById('timelineCanvas');
  const ctx = timelineCanvas.getContext('2d');
  const width = timelineCanvas.width;
  const height = timelineCanvas.height;
  const duration = video.duration || 0;
  
  ctx.clearRect(0, 0, width, height);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(0, 0, width, height);
  
  if (duration > 0 && annotations.length > 0) {
    annotations.forEach(a => {
      const x = (a.timestamp / duration) * width;
      const color = a.color || '#ff4444';
      
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x - 2, 5, 4, height - 10);
      ctx.globalAlpha = 1;
    });
  }
  
  if (isPlaybackMode) {
    const progressX = duration > 0 ? (playbackCurrentTime / duration) * width : 0;
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, height);
    ctx.stroke();
    
    const rangeStartX = duration > 0 ? (playbackStartTime / duration) * width : 0;
    const rangeEndX = duration > 0 ? (playbackEndTime / duration) * width : width;
    
    ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
    ctx.fillRect(rangeStartX, 0, rangeEndX - rangeStartX, height);
    
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.strokeRect(rangeStartX, 0, rangeEndX - rangeStartX, height);
  }
}

function onTimelineClick(e) {
  const timelineCanvas = document.getElementById('timelineCanvas');
  const rect = timelineCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const duration = video.duration || 0;
  
  if (duration > 0) {
    const clickTime = (x / timelineCanvas.width) * duration;
    if (isPlaybackMode) {
      playbackCurrentTime = Math.max(playbackStartTime, Math.min(playbackEndTime, clickTime));
      video.currentTime = playbackCurrentTime;
      annotationOpacities.clear();
      renderAnnotations();
      renderTimeline();
    } else {
      video.currentTime = clickTime;
    }
  }
}

function togglePlayback() {
  if (isPlaybackPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (annotations.length === 0) {
    showToast('没有批注可供回放');
    return;
  }
  
  const duration = video.duration || 0;
  if (duration === 0) {
    showToast('请等待视频加载完成');
    return;
  }
  
  if (!isPlaybackMode) {
    playbackStartTime = 0;
    playbackEndTime = duration;
    playbackCurrentTime = playbackStartTime;
  }
  
  if (playbackCurrentTime >= playbackEndTime) {
    playbackCurrentTime = playbackStartTime;
  }
  
  isPlaybackMode = true;
  isPlaybackPlaying = true;
  video.pause();
  annotationOpacities.clear();
  
  document.getElementById('playbackPlayBtn').textContent = '⏸️ 暂停';
  document.getElementById('playbackStatus').textContent = '回放中...';
  document.getElementById('playbackStatus').classList.add('playing');
  
  playbackLastTimestamp = performance.now();
  playbackLoop();
  renderTimeline();
}

function pausePlayback() {
  isPlaybackPlaying = false;
  document.getElementById('playbackPlayBtn').textContent = '▶️ 回放';
  document.getElementById('playbackStatus').textContent = '已暂停';
  document.getElementById('playbackStatus').classList.remove('playing');
  
  if (playbackAnimationId) {
    cancelAnimationFrame(playbackAnimationId);
    playbackAnimationId = null;
  }
  
  renderTimeline();
}

function stopPlayback() {
  isPlaybackMode = false;
  isPlaybackPlaying = false;
  annotationOpacities.clear();
  
  document.getElementById('playbackPlayBtn').textContent = '▶️ 回放';
  document.getElementById('playbackStatus').textContent = '就绪';
  document.getElementById('playbackStatus').classList.remove('playing');
  
  if (playbackAnimationId) {
    cancelAnimationFrame(playbackAnimationId);
    playbackAnimationId = null;
  }
  
  renderAnnotations();
  renderTimeline();
}

function playbackLoop(timestamp) {
  if (!isPlaybackPlaying) return;
  
  const deltaTime = (timestamp - playbackLastTimestamp) / 1000;
  playbackLastTimestamp = timestamp;
  
  playbackCurrentTime += deltaTime * playbackSpeed;
  
  if (playbackCurrentTime >= playbackEndTime) {
    playbackCurrentTime = playbackEndTime;
    pausePlayback();
    document.getElementById('playbackStatus').textContent = '回放完成';
    renderAnnotations();
    renderTimeline();
    return;
  }
  
  video.currentTime = playbackCurrentTime;
  
  document.getElementById('playbackStatus').textContent = 
    `回放中: ${formatTime(playbackCurrentTime)} / ${formatTime(playbackEndTime)}`;
  
  renderAnnotations();
  renderTimeline();
  
  playbackAnimationId = requestAnimationFrame(playbackLoop);
}

function changePlaybackSpeed() {
  playbackSpeed = parseFloat(document.getElementById('playbackSpeed').value);
  showToast(`回放速度: ${playbackSpeed}x`);
}

function parseTime(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0]) || 0;
    const secs = parseInt(parts[1]) || 0;
    return mins * 60 + secs;
  }
  return 0;
}

function setPlaybackRange() {
  const startStr = document.getElementById('rangeStart').value;
  const endStr = document.getElementById('rangeEnd').value;
  const duration = video.duration || 0;
  
  if (duration === 0) {
    showToast('请等待视频加载完成');
    return;
  }
  
  const startTime = parseTime(startStr);
  const endTime = parseTime(endStr);
  
  if (startTime >= endTime) {
    showToast('开始时间必须小于结束时间');
    return;
  }
  
  if (endTime > duration) {
    showToast(`结束时间不能超过视频时长 ${formatTime(duration)}`);
    return;
  }
  
  playbackStartTime = startTime;
  playbackEndTime = endTime;
  playbackCurrentTime = startTime;
  annotationOpacities.clear();
  
  showToast(`回放范围: ${formatTime(startTime)} - ${formatTime(endTime)}`);
  renderTimeline();
}

video.addEventListener('loadedmetadata', () => {
  const duration = video.duration || 0;
  document.getElementById('rangeEnd').value = formatTime(duration);
  playbackEndTime = duration;
});

fetch(`/api/room/${roomId}/annotations`)
  .then(res => res.json())
  .then(data => {
    annotations = data;
    updateAnnotationList();
    renderAnnotations();
    setTimeout(renderTimeline, 100);
  });

initPlayback();
