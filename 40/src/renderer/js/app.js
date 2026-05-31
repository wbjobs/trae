import { MapManager } from './map.js';
import { WebRTCManager } from './webrtc.js';
import { GeofenceManager } from './geofence.js';
import { UIManager } from './ui.js';
import { HeatmapManager } from './heatmap.js';

class LocationShareApp {
  constructor() {
    this.peerId = `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.nickname = `用户${Math.floor(Math.random() * 1000)}`;
    this.roomCode = null;
    this.members = new Map();
    this.isSimulationRunning = false;
    this.locationUpdateInterval = null;
    
    // 中转模式
    this.relayModeActive = false; // 是否使用 Redis 中转
    this.lastPeerConnectedCount = 0;
    
    // 热力图相关
    this.heatmapManager = null;
    this.isAnimationPlaying = false;
    this.animationInterval = null;
    this.currentAnimationHour = 0;

    this.mapManager = null;
    this.webrtcManager = null;
    this.geofenceManager = null;
    this.uiManager = null;
  }

  async initialize() {
    console.log('Initializing LocationShare App...');

    this.mapManager = new MapManager('map');
    this.mapManager.initialize();

    this.uiManager = new UIManager();
    this.uiManager.initialize();

    this.webrtcManager = new WebRTCManager();
    this.webrtcManager.initialize(this.peerId, this.nickname, null);

    this.geofenceManager = new GeofenceManager(
      this.mapManager,
      (event) => this.handleGeofenceEvent(event)
    );

    this.heatmapManager = new HeatmapManager(this.mapManager);

    this.setupEventHandlers();
    this.setupMessageHandlers();
    this.setupHeatmapHandlers();

    if (window.electronAPI) {
      window.electronAPI.onGpsUpdate((data) => {
        this.handleGpsUpdate(data);
      });
      
      // 监听 Redis 中转的位置数据
      window.electronAPI.onRelayLocationUpdate((locationData) => {
        this.handleRelayLocationUpdate(locationData);
      });
    }

    console.log('App initialized with peerId:', this.peerId);
  }

  setupEventHandlers() {
    this.uiManager.bindEvents({
      btnCreateRoom: () => this.createRoom(),
      btnJoinRoom: () => this.joinRoom(),
      btnLeaveRoom: () => this.leaveRoom(),
      btnCopyCode: () => {
        if (this.roomCode) {
          this.uiManager.copyToClipboard(this.roomCode);
        }
      },
      btnAddCircle: () => this.addCircleGeofence(),
      btnAddPolygon: () => this.addPolygonGeofence(),
      btnToggleSimulation: () => this.toggleSimulation(),
      btnCenterLocation: () => this.centerOnMembers(),
    });

    this.uiManager.elements.inputRoomCode?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.joinRoom();
      }
    });
  }

  setupHeatmapHandlers() {
    const btnToggleHeatmap = document.getElementById('btn-toggle-heatmap');
    const btnPlayAnimation = document.getElementById('btn-play-animation');
    const btnShowHotspots = document.getElementById('btn-show-hotspots');
    const btnExportGeoJSON = document.getElementById('btn-export-geojson');
    const timeFilter = document.getElementById('heatmap-time-filter');
    const hourSelect = document.getElementById('heatmap-hour-select');

    btnToggleHeatmap?.addEventListener('click', () => this.toggleHeatmap());
    btnPlayAnimation?.addEventListener('click', () => this.toggleHeatmapAnimation());
    btnShowHotspots?.addEventListener('click', () => this.showHotspots());
    btnExportGeoJSON?.addEventListener('click', () => this.exportGeoJSON());

    timeFilter?.addEventListener('change', (e) => {
      const container = document.getElementById('hour-select-container');
      container.style.display = e.target.value === 'hour' ? 'block' : 'none';
      this.updateHeatmap();
    });

    hourSelect?.addEventListener('change', () => {
      this.updateHeatmap();
    });
  }

  setupMessageHandlers() {
    this.webrtcManager.onMessage((fromPeerId, type, data) => {
      switch (type) {
        case 'peer-info':
          this.handlePeerInfo(fromPeerId, data);
          break;
        case 'location':
          this.handleLocationUpdate(fromPeerId, data);
          break;
      }
    });

    this.webrtcManager.onPeerConnected((peerId) => {
      console.log('Peer connected:', peerId);
      const member = this.members.get(peerId);
      if (member) {
        this.uiManager.addMember(member);
      }
      this.updateMemberCount();
    });

    this.webrtcManager.onPeerDisconnected((peerId) => {
      console.log('Peer disconnected:', peerId);
      this.uiManager.removeMember(peerId);
      this.mapManager.removeMember(peerId);
      this.geofenceManager.removeMember(peerId);
      this.members.delete(peerId);
      this.updateMemberCount();

      if (window.electronAPI) {
        window.electronAPI.showNotification('成员离开', `${peerId} 断开了连接`);
      }
    });
  }

  async createRoom() {
    try {
      const result = await window.electronAPI?.createRoom(this.peerId, this.nickname);
      
      if (result?.success) {
        this.roomCode = result.roomCode;
        this.uiManager.showRoomActive(this.roomCode);
        
        this.members.set(this.peerId, {
          peerId: this.peerId,
          nickname: this.nickname,
          color: this.webrtcManager.color,
        });

        await this.webrtcManager.createRoom(this.roomCode);
        
        // 订阅房间位置中转
        window.electronAPI.subscribeRoomLocations(this.roomCode);
        
        // 获取历史位置数据，恢复状态
        await this.loadRoomLocations();
        
        this.uiManager.updateMemberList(
          Array.from(this.members.values()),
          this.peerId
        );
        this.updateMemberCount();

        this.uiManager.showToast(`房间已创建，邀请码: ${this.roomCode}`, 'success');
      } else {
        this.uiManager.showToast(result?.error || '创建房间失败', 'error');
      }
    } catch (error) {
      console.error('Failed to create room:', error);
      this.uiManager.showToast('创建房间失败: ' + error.message, 'error');
    }
  }

  async joinRoom() {
    const inputCode = this.uiManager.elements.inputRoomCode?.value?.trim();
    
    if (!inputCode || inputCode.length !== 6) {
      this.uiManager.showToast('请输入6位邀请码', 'error');
      return;
    }

    try {
      const result = await window.electronAPI?.joinRoom(inputCode, this.peerId, this.nickname);
      
      if (result?.success) {
        this.roomCode = inputCode;
        this.uiManager.showRoomActive(this.roomCode);

        this.members.set(this.peerId, {
          peerId: this.peerId,
          nickname: this.nickname,
          color: this.webrtcManager.color,
        });

        for (const member of result.members) {
          if (member.peerId !== this.peerId) {
            this.members.set(member.peerId, {
              ...member,
              color: member.color || '#64748B',
            });
          }
        }

        await this.webrtcManager.joinRoom(this.roomCode);
        
        // 订阅房间位置中转
        window.electronAPI.subscribeRoomLocations(this.roomCode);
        
        // 获取历史位置数据，恢复状态
        await this.loadRoomLocations();

        if (result.hostId) {
          setTimeout(() => {
            this.webrtcManager.connectToPeer(result.hostId, true);
          }, 500);
        }

        setTimeout(() => {
          const connectedPeers = this.webrtcManager.getConnectedPeers();
          console.log('Connected peers after join:', connectedPeers);
          
          // 检测连接质量，决定是否启用中转模式
          this.checkConnectionQualityAndToggleRelay();
        }, 3000);

        this.uiManager.updateMemberList(
          Array.from(this.members.values()),
          this.peerId
        );
        this.updateMemberCount();

        this.uiManager.showToast('成功加入房间', 'success');

        if (window.electronAPI) {
          window.electronAPI.showNotification('新成员加入', `${this.nickname} 加入了房间`);
        }
      } else {
        this.uiManager.showToast(result?.error || '加入房间失败', 'error');
      }
    } catch (error) {
      console.error('Failed to join room:', error);
      this.uiManager.showToast('加入房间失败: ' + error.message, 'error');
    }
  }

  async leaveRoom() {
    if (!this.roomCode) return;

    try {
      await window.electronAPI?.leaveRoom(this.roomCode, this.peerId);
      
      // 取消位置中转订阅
      await window.electronAPI.unsubscribeRoomLocations(this.roomCode);
      this.relayModeActive = false;
      
      this.webrtcManager.disconnect();
      
      for (const [peerId] of this.members) {
        if (peerId !== this.peerId) {
          this.mapManager.removeMember(peerId);
        }
      }

      this.members.clear();
      this.members.set(this.peerId, {
        peerId: this.peerId,
        nickname: this.nickname,
        color: this.webrtcManager.color,
      });

      this.roomCode = null;
      this.uiManager.showRoomInit();
      this.uiManager.updateMemberList([]);
      this.uiManager.updateMemberCount(0);

      this.uiManager.showToast('已离开房间', 'info');
    } catch (error) {
      console.error('Failed to leave room:', error);
      this.uiManager.showToast('离开房间失败', 'error');
    }
  }
  
  // 加载房间历史位置数据
  async loadRoomLocations() {
    try {
      const result = await window.electronAPI.getRoomLocations(this.roomCode);
      
      if (result?.success && result.locations?.length > 0) {
        console.log('Loading historical locations:', result.locations.length);
        
        for (const locationData of result.locations) {
          // 只处理其他成员的位置
          if (locationData.peerId !== this.peerId) {
            this.handleRelayLocationUpdate(locationData);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load room locations:', error);
    }
  }
  
  // 检测连接质量，自动切换中转模式
  checkConnectionQualityAndToggleRelay() {
    const currentConnectedCount = this.webrtcManager.getConnectedPeers().length;
    
    if (currentConnectedCount === 0 && this.lastPeerConnectedCount > 0) {
      // 连接断开
      this.relayModeActive = true;
      console.warn('P2P connections lost, switching to relay mode');
      this.uiManager.showToast('P2P连接不稳定，已启用Redis中转', 'warning');
    } else if (currentConnectedCount > 0 && this.relayModeActive) {
      // 重新连接，保持同时支持两种模式
      console.log('P2P connection restored, using both relay and P2P');
    }
    
    this.lastPeerConnectedCount = currentConnectedCount;
    
    // 定期检查
    setTimeout(() => {
      if (this.roomCode) {
        this.checkConnectionQualityAndToggleRelay();
      }
    }, 30000); // 30秒检查一次
  }
  
  // 处理中转过来的位置数据
  handleRelayLocationUpdate(locationData) {
    if (locationData.peerId === this.peerId) {
      return; // 忽略自己的位置
    }
    
    console.log('Received location via relay:', locationData.peerId);
    
    const position = [locationData.latitude, locationData.longitude];
    const memberInfo = this.members.get(locationData.peerId);
    
    // 更新或创建成员信息
    if (locationData.nickname || locationData.color) {
      this.members.set(locationData.peerId, {
        peerId: locationData.peerId,
        nickname: locationData.nickname || memberInfo?.nickname || `成员${locationData.peerId.slice(0, 4)}`,
        color: locationData.color || memberInfo?.color || '#64748B',
      });
    }
    
    // 更新地图显示
    const member = this.members.get(locationData.peerId);
    this.mapManager.updateMemberPosition(locationData.peerId, position, {
      nickname: member?.nickname,
      color: member?.color,
    });
    
    // 更新成员列表
    this.uiManager.addMember(member);
    
    // 检测地理围栏
    this.geofenceManager.checkMemberPosition(
      locationData.peerId,
      position,
      member
    );
  }

  handlePeerInfo(fromPeerId, data) {
    if (this.members.has(fromPeerId)) {
      const member = this.members.get(fromPeerId);
      member.nickname = data.nickname;
      member.color = data.avatar_color;
    } else {
      this.members.set(fromPeerId, {
        peerId: fromPeerId,
        nickname: data.nickname,
        color: data.avatar_color,
      });
      this.uiManager.addMember({
        peerId: fromPeerId,
        nickname: data.nickname,
        color: data.avatar_color,
      });
    }
    this.updateMemberCount();
  }

  handleLocationUpdate(fromPeerId, data) {
    const position = [data.latitude, data.longitude];
    const member = this.members.get(fromPeerId);

    this.mapManager.updateMemberPosition(fromPeerId, position, {
      nickname: member?.nickname,
      color: member?.color,
    });

    this.geofenceManager.checkMemberPosition(
      fromPeerId,
      position,
      member
    );
  }

  handleGpsUpdate(data) {
    const position = [data.latitude, data.longitude];
    const memberInfo = {
      nickname: data.nickname,
      color: data.color
    };

    this.mapManager.updateMemberPosition(data.deviceId, position, memberInfo);

    this.geofenceManager.checkMemberPosition(
      data.deviceId,
      position,
      memberInfo
    );
    
    // 记录位置历史用于热力图分析
    if (this.heatmapManager) {
      this.heatmapManager.addLocation(
        data.deviceId,
        data.latitude,
        data.longitude,
        Date.now()
      );
    }
    
    // 更新热力图统计
    this.updateHeatmapStats();
    
    // 构建位置数据
    const locationData = {
      peerId: data.deviceId,
      nickname: data.nickname,
      color: data.color,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      speed: data.speed,
      heading: data.heading,
      timestamp: Date.now()
    };
    
    // 1. 通过 P2P 发送
    this.webrtcManager.sendLocationUpdate({
      type: 'location',
      ...locationData
    });
    
    // 2. 同时通过 Redis 中转发送（确保即使 P2P 断开也能接收）
    if (this.roomCode) {
      window.electronAPI.publishLocation(this.roomCode, locationData)
        .catch(err => console.error('Failed to publish location to relay:', err));
    }
  }

  async handleGeofenceEvent(event) {
    console.log('Geofence event:', event);

    if (window.electronAPI) {
      const title = event.entered ? '进入地理围栏' : '离开地理围栏';
      const body = `${event.memberInfo?.nickname || event.peerId} ${event.entered ? '进入了' : '离开了'} ${event.geofenceName}`;
      await window.electronAPI.showNotification(title, body);
    }

    const geofence = this.geofenceManager.getGeofence(event.geofenceId);
    if (geofence) {
      const color = event.entered ? '#10B981' : '#EF4444';
      if (geofence.layer.setStyle) {
        geofence.layer.setStyle({
          color: color,
          fillColor: color,
        });
        
        setTimeout(() => {
          geofence.layer.setStyle({
            color: geofence.color,
            fillColor: geofence.color,
          });
        }, 2000);
      }
    }
  }

  // 热力图相关方法
  toggleHeatmap() {
    if (!this.heatmapManager) return;
    
    const isVisible = this.heatmapManager.toggleHeatmap();
    const btn = document.getElementById('btn-toggle-heatmap');
    
    if (btn) {
      btn.textContent = isVisible ? '❌ 关闭' : '🔥 显示';
    }
    
    if (!isVisible) {
      this.stopHeatmapAnimation();
    }
  }

  updateHeatmap() {
    if (!this.heatmapManager || !this.heatmapManager.isVisible) return;

    const filterOptions = this.getHeatmapFilterOptions();
    this.heatmapManager.showHeatmap(filterOptions);
  }

  getHeatmapFilterOptions() {
    const timeFilter = document.getElementById('heatmap-time-filter');
    const hourSelect = document.getElementById('heatmap-hour-select');
    
    const filterOptions = {};
    
    if (timeFilter?.value === 'hour') {
      filterOptions.hour = parseInt(hourSelect?.value) || 0;
    }
    
    return filterOptions;
  }

  updateHeatmapStats() {
    if (!this.heatmapManager) return;

    const stats = this.heatmapManager.getStatistics();
    const statsContainer = document.getElementById('heatmap-stats');
    
    if (!statsContainer) return;

    statsContainer.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">总点数:</span>
        <span class="stat-value">${stats.totalPoints}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">成员数:</span>
        <span class="stat-value">${stats.uniquePeers}</span>
      </div>
    `;
  }

  toggleHeatmapAnimation() {
    if (this.isAnimationPlaying) {
      this.stopHeatmapAnimation();
    } else {
      this.startHeatmapAnimation();
    }
  }

  startHeatmapAnimation() {
    if (!this.heatmapManager) return;

    this.isAnimationPlaying = true;
    this.currentAnimationHour = 0;
    
    const btn = document.getElementById('btn-play-animation');
    if (btn) {
      btn.textContent = '⏸️ 暂停动画';
    }

    // 确保热力图可见
    if (!this.heatmapManager.isVisible) {
      this.heatmapManager.showHeatmap();
      const toggleBtn = document.getElementById('btn-toggle-heatmap');
      if (toggleBtn) {
        toggleBtn.textContent = '❌ 关闭';
      }
    }

    this.animationInterval = setInterval(() => {
      this.heatmapManager.showHeatmap({ hour: this.currentAnimationHour });
      
      const progress = (this.currentAnimationHour / 23) * 100;
      this.updateAnimationProgress(progress);
      
      const hourDisplay = document.getElementById('heatmap-hour-select');
      if (hourDisplay) {
        hourDisplay.value = this.currentAnimationHour;
      }
      
      this.currentAnimationHour++;
      if (this.currentAnimationHour >= 24) {
        this.currentAnimationHour = 0;
      }
    }, 800);
  }

  stopHeatmapAnimation() {
    this.isAnimationPlaying = false;
    
    const btn = document.getElementById('btn-play-animation');
    if (btn) {
      btn.textContent = '▶️ 播放动画';
    }
    
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    
    this.updateAnimationProgress(0);
  }

  updateAnimationProgress(percent) {
    const container = document.getElementById('heatmap-controls');
    let progressBar = container?.querySelector('.animation-progress');
    
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = 'animation-progress';
      progressBar.innerHTML = `
        <div class="animation-bar">
          <div class="animation-fill" style="width: ${percent}%"></div>
        </div>
      `;
      container?.appendChild(progressBar);
    } else {
      const fill = progressBar.querySelector('.animation-fill');
      if (fill) {
        fill.style.width = `${percent}%`;
      }
    }
  }

  showHotspots() {
    if (!this.heatmapManager) return;

    const hotspots = this.heatmapManager.getHotspots(0.6);
    
    if (hotspots.length === 0) {
      this.uiManager.showToast('暂无热点数据', 'info');
      return;
    }

    const hotspotList = hotspots.map(h => `
      <div class="hotspot-item">
        <div class="hotspot-rank">${h.rank}</div>
        <div class="hotspot-info">
          <div style="font-size: 13px; font-weight: 500;">
            ${h.latitude.toFixed(6)}, ${h.longitude.toFixed(6)}
          </div>
          <div class="hotspot-intensity">
            <div class="hotspot-bar">
              <div class="hotspot-fill" style="width: ${h.intensity}%"></div>
            </div>
            <span style="font-size: 11px; color: var(--text-muted);">${h.intensity}%</span>
          </div>
        </div>
      </div>
    `).join('');

    this.uiManager.showModal(
      '🏆 高频活动区域',
      `<div class="hotspot-list">${hotspotList}</div>`,
      '<button id="btn-close-hotspots" class="btn btn-primary">关闭</button>'
    );

    setTimeout(() => {
      document.getElementById('btn-close-hotspots')?.addEventListener('click', () => {
        this.uiManager.hideModal();
      });
    }, 100);
  }

  exportGeoJSON() {
    if (!this.heatmapManager) return;

    const filterOptions = this.getHeatmapFilterOptions();
    const geojson = this.heatmapManager.exportGeoJSON(filterOptions);

    const blob = new Blob([geojson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.href = url;
    a.download = `heatmap_${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.uiManager.showToast('GeoJSON 导出成功', 'success');
  }

  async addCircleGeofence() {
    const result = await this.uiManager.showCircleModal();
    
    if (!result) return;

    const { name, radius, center } = result;
    
    if (!center) {
      const mapCenter = this.mapManager.getCenter();
      center = [mapCenter.lat, mapCenter.lng];
    }

    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const id = this.geofenceManager.addCircle(name, center, radius, color);
    
    this.uiManager.addGeofence({
      id,
      name,
      type: 'circle',
      color,
    });

    this.uiManager.showToast(`已添加圆形围栏: ${name}`, 'success');
  }

  async addPolygonGeofence() {
    const result = await this.uiManager.showPolygonModal();
    
    if (!result) return;

    const { name, vertices } = result;

    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const id = this.geofenceManager.addPolygon(name, vertices, color);

    this.uiManager.addGeofence({
      id,
      name,
      type: 'polygon',
      color,
    });

    this.uiManager.showToast(`已添加多边形围栏: ${name}`, 'success');
  }

  async toggleSimulation() {
    if (this.isSimulationRunning) {
      await window.electronAPI?.stopGpsSimulation();
      this.isSimulationRunning = false;
      this.uiManager.updateSimulationButton(false);
      this.uiManager.showToast('GPS模拟已停止', 'info');
    } else {
      await window.electronAPI?.startGpsSimulation();
      this.isSimulationRunning = true;
      this.uiManager.updateSimulationButton(true);
      this.uiManager.showToast('GPS模拟已启动', 'success');
    }
  }

  centerOnMembers() {
    const positions = [];
    
    this.mapManager.memberMarkers.forEach((markerData, peerId) => {
      const latLng = markerData.marker.getLatLng();
      positions.push([latLng.lat, latLng.lng]);
    });

    if (positions.length > 0) {
      this.mapManager.fitBounds(positions);
    } else {
      this.mapManager.setView([39.9042, 116.4074], 15);
    }
  }

  updateMemberCount() {
    this.uiManager.updateMemberCount(this.members.size);
  }

  cleanup() {
    this.webrtcManager?.disconnect();
    this.geofenceManager?.cleanup();
    this.heatmapManager?.clearHistory();
    this.mapManager?.cleanup();
    this.uiManager?.cleanup();

    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
    }
    
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  window.app = new LocationShareApp();
  await window.app.initialize();
});

window.addEventListener('beforeunload', () => {
  window.app?.cleanup();
});
