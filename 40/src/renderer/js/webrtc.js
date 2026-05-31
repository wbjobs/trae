import SimplePeer from 'simple-peer';
import { encodeJSON, decodeJSON } from './protobuf.js';

export class WebRTCManager {
  constructor() {
    this.peerId = null;
    this.nickname = null;
    this.color = null;
    this.roomCode = null;
    this.isHost = false;
    this.peers = new Map();
    this.pendingOffers = new Map();
    this.localStream = null;
    this.onMessageCallback = null;
    this.onPeerConnectedCallback = null;
    this.onPeerDisconnectedCallback = null;
    
    // 断线恢复相关
    this.retryAttempts = new Map();
    this.retryTimers = new Map();
    this.MAX_RETRIES = 10;
    this.BASE_DELAY = 1000;
    this.MAX_DELAY = 30000;
    
    // 中转模式状态
    this.relayMode = false;
    this.lastRelayUpdate = Date.now();
  }

  // STUN 服务器配置（RFC 7675 连通性检查）
  getIceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.stunprotocol.org:3478' }
    ];
  }

  initialize(peerId, nickname, color) {
    this.peerId = peerId;
    this.nickname = nickname;
    this.color = color;
    this.generateColor();
  }

  generateColor() {
    const colors = [
      '#EF4444', '#F59E0B', '#10B981', '#3B82F6', 
      '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
    ];
    if (!this.color) {
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }
  }

  subscribeToSignaling() {
    if (window.electronAPI) {
      window.electronAPI.subscribeSignaling(this.peerId);
      window.electronAPI.onSignalMessage((data) => {
        this.handleSignalingMessage(data);
      });
    }
  }

  unsubscribeFromSignaling() {
    if (window.electronAPI) {
      window.electronAPI.unsubscribeSignaling(this.peerId);
    }
  }

  async handleSignalingMessage({ channel, message }) {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'offer':
        await this.handleOffer(message);
        break;
      case 'answer':
        await this.handleAnswer(message);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(message);
        break;
    }
  }

  async createRoom(roomCode) {
    this.roomCode = roomCode;
    this.isHost = true;
    this.subscribeToSignaling();
    return { success: true };
  }

  async joinRoom(roomCode) {
    this.roomCode = roomCode;
    this.isHost = false;
    this.subscribeToSignaling();
    return { success: true };
  }

  async connectToPeer(peerId, isInitiator) {
    if (this.peers.has(peerId)) {
      const peerData = this.peers.get(peerId);
      if (peerData.peer.connected) {
        console.log(`Already connected to peer: ${peerId}`);
        return;
      }
    }

    const config = {
      initiator: isInitiator,
      trickle: true,
      stream: false,
      config: {
        iceServers: this.getIceServers(),
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all', // 允许所有 ICE 类型
        rtcpMuxPolicy: 'require'
      }
    };

    const peer = new SimplePeer(config);
    
    // 连接质量监控
    let lastActivity = Date.now();
    const heartbeatInterval = setInterval(() => {
      if (peer.connected) {
        // 发送心跳
        try {
          peer.send(encodeJSON({ type: 'heartbeat', timestamp: Date.now() }));
        } catch (err) {
          console.warn(`Failed to send heartbeat to ${peerId}:`, err);
        }
      } else if (Date.now() - lastActivity > 30000) {
        // 30秒无活动，触发重连
        console.warn(`Connection idle for ${peerId}, triggering reconnect...`);
        clearInterval(heartbeatInterval);
        this.handlePeerDisconnect(peerId, isInitiator);
      }
    }, 5000);

    peer.on('signal', (data) => {
      console.log(`Signaling data from ${peerId}:`, data.type || 'candidate');
      this.sendSignalData(peerId, data);
    });

    peer.on('connect', () => {
      console.log(`✅ Connected to peer: ${peerId}`);
      lastActivity = Date.now();
      this.retryAttempts.delete(peerId);
      this.onPeerConnectedCallback?.(peerId);
      this.sendPeerInfo(peerId);
    });

    peer.on('data', (data) => {
      lastActivity = Date.now();
      this.handlePeerData(peerId, data);
    });

    peer.on('close', () => {
      console.log(`❌ Disconnected from peer: ${peerId}`);
      clearInterval(heartbeatInterval);
      this.handlePeerDisconnect(peerId, isInitiator);
    });

    peer.on('error', (err) => {
      console.error(`❌ Peer error (${peerId}):`, err);
      clearInterval(heartbeatInterval);
      // 对于某些类型的错误，尝试自动重连
      if (!err.message?.includes('Already connected')) {
        this.handlePeerDisconnect(peerId, isInitiator);
      }
    });

    this.peers.set(peerId, { 
      peer, 
      isInitiator, 
      heartbeatInterval,
      lastActivity 
    });
  }
  
  // 处理断线和指数退避重连
  handlePeerDisconnect(peerId, isInitiator) {
    const existingPeer = this.peers.get(peerId);
    if (existingPeer?.heartbeatInterval) {
      clearInterval(existingPeer.heartbeatInterval);
    }
    this.peers.delete(peerId);
    
    this.onPeerDisconnectedCallback?.(peerId);
    
    // 检查是否在重试中
    if (this.retryTimers.has(peerId)) {
      console.log(`Retry already in progress for ${peerId}`);
      return;
    }
    
    // 指数退避重连
    this.scheduleRetry(peerId, isInitiator);
  }
  
  // 指数退避重试调度
  scheduleRetry(peerId, isInitiator) {
    const attempts = this.retryAttempts.get(peerId) || 0;
    
    if (attempts >= this.MAX_RETRIES) {
      console.error(`Max retries (${this.MAX_RETRIES}) reached for peer ${peerId}`);
      this.retryAttempts.delete(peerId);
      return;
    }
    
    const delay = Math.min(
      this.BASE_DELAY * Math.pow(2, attempts),
      this.MAX_DELAY
    );
    
    const jitter = Math.random() * 1000; // 添加随机抖动
    const totalDelay = delay + jitter;
    
    console.log(`Scheduling retry ${attempts + 1}/${this.MAX_RETRIES} for peer ${peerId} in ${Math.round(totalDelay/1000)}s`);
    
    const timer = setTimeout(async () => {
      this.retryTimers.delete(peerId);
      await this.reconnectToPeer(peerId, isInitiator);
    }, totalDelay);
    
    this.retryTimers.set(peerId, timer);
    this.retryAttempts.set(peerId, attempts + 1);
  }
  
  // 重连逻辑
  async reconnectToPeer(peerId, isInitiator) {
    console.log(`Reconnecting to peer: ${peerId}`);
    
    try {
      await this.connectToPeer(peerId, isInitiator);
      // 重连成功后重置重试计数
      this.retryAttempts.delete(peerId);
    } catch (err) {
      console.error(`Failed to reconnect to ${peerId}:`, err);
    }
  }

  async sendSignalData(toPeerId, signalData) {
    if (!window.electronAPI) return;

    if (signalData.type === 'offer') {
      await window.electronAPI.sendSignalOffer(
        this.peerId,
        toPeerId,
        this.roomCode,
        JSON.stringify(signalData)
      );
    } else if (signalData.type === 'answer') {
      await window.electronAPI.sendSignalAnswer(
        this.peerId,
        toPeerId,
        this.roomCode,
        JSON.stringify(signalData)
      );
    } else {
      await window.electronAPI.sendIceCandidate(
        this.peerId,
        toPeerId,
        this.roomCode,
        JSON.stringify(signalData),
        signalData.sdpMid || null,
        signalData.sdpMLineIndex || 0
      );
    }
  }

  async handleOffer(message) {
    const { fromPeerId, sdp } = message;

    if (this.peers.has(fromPeerId)) {
      return;
    }

    this.pendingOffers.set(fromPeerId, JSON.parse(sdp));

    if (!this.isHost) {
      await this.connectToPeer(fromPeerId, false);
    }
  }

  async handleAnswer(message) {
    const { fromPeerId, sdp } = message;
    const peerData = this.peers.get(fromPeerId);

    if (peerData && peerData.peer) {
      peerData.peer.signal(JSON.parse(sdp));
    }
  }

  async handleIceCandidate(message) {
    const { fromPeerId, candidate } = message;
    const peerData = this.peers.get(fromPeerId);

    if (peerData && peerData.peer) {
      try {
        peerData.peer.signal(JSON.parse(candidate));
      } catch (err) {
        console.error('Failed to handle ICE candidate:', err);
      }
    }
  }

  sendPeerInfo(toPeerId) {
    const peerInfo = {
      type: 'peer-info',
      peer_id: this.peerId,
      nickname: this.nickname,
      avatar_color: this.color,
    };

    this.sendToPeer(toPeerId, encodeJSON(peerInfo));
  }

  handlePeerData(fromPeerId, data) {
    try {
      const uint8Array = new Uint8Array(data);
      const jsonData = decodeJSON(uint8Array);
      
      if (jsonData.type === 'heartbeat') {
        // 心跳消息，忽略但记录时间
        return;
      } else if (jsonData.type === 'peer-info') {
        this.onMessageCallback?.(fromPeerId, 'peer-info', jsonData);
      } else if (jsonData.type === 'location') {
        this.onMessageCallback?.(fromPeerId, 'location', { peerId: fromPeerId, data: jsonData });
      } else if (jsonData.type) {
        this.onMessageCallback?.(fromPeerId, jsonData.type, jsonData);
      }
    } catch (err) {
      // 如果 JSON 解析失败，检查是否是 Protobuf
      try {
        this.onMessageCallback?.(fromPeerId, 'location', { peerId: fromPeerId, data: decodeJSON(new Uint8Array(data)) });
      } catch (e) {
        console.error('Failed to handle peer data:', err);
      }
    }
  }

  sendToPeer(peerId, data) {
    const peerData = this.peers.get(peerId);
    if (peerData && peerData.peer && peerData.peer.connected) {
      peerData.peer.send(data);
      return true;
    }
    return false;
  }

  broadcast(data) {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    
    for (const [peerId, peerData] of this.peers) {
      if (peerData.peer && peerData.peer.connected) {
        try {
          peerData.peer.send(buffer);
        } catch (err) {
          console.error(`Failed to send to peer ${peerId}:`, err);
        }
      }
    }
  }

  sendLocationUpdate(location) {
    const message = {
      type: 'location',
      peer_id: this.peerId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy || 0,
      speed: location.speed || 0,
      heading: location.heading || 0,
      timestamp: Date.now(),
    };

    this.broadcast(encodeJSON(message));
  }

  removePeer(peerId) {
    // 清理重试计时器
    if (this.retryTimers.has(peerId)) {
      clearTimeout(this.retryTimers.get(peerId));
      this.retryTimers.delete(peerId);
    }
    this.retryAttempts.delete(peerId);
    
    const peerData = this.peers.get(peerId);
    if (peerData) {
      if (peerData.heartbeatInterval) {
        clearInterval(peerData.heartbeatInterval);
      }
      try {
        peerData.peer.destroy();
      } catch (e) {
        console.warn('Error destroying peer:', e);
      }
      this.peers.delete(peerId);
    }
  }

  disconnect() {
    this.unsubscribeFromSignaling();

    // 清理所有计时器和连接
    for (const [peerId] of this.retryTimers) {
      clearTimeout(this.retryTimers.get(peerId));
    }
    this.retryTimers.clear();
    this.retryAttempts.clear();

    for (const [peerId] of this.peers) {
      this.removePeer(peerId);
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onPeerConnected(callback) {
    this.onPeerConnectedCallback = callback;
  }

  onPeerDisconnected(callback) {
    this.onPeerDisconnectedCallback = callback;
  }

  getConnectedPeers() {
    return Array.from(this.peers.keys());
  }

  isConnected() {
    return this.peers.size > 0;
  }
}
