import { trackerApi } from './api';
import type { BandwidthInfo, GeoLocation, ChunkHeld, ChokeStatus } from '../types';
import {
  getOptimizedIceConfig,
  parseCandidate,
  sortCandidatesByPriority,
  formatIceCandidateStats,
  type IceCandidateStats,
  type ConnectionStats,
  type IceServerConfig,
} from './iceConfig';

export interface P2PMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'request-chunk' | 'chunk-data' | 'chunk-complete';
  payload: any;
}

export interface PeerConnection {
  id: string;
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  remoteNodeId: string;
  isInitiator: boolean;
  localCandidates: IceCandidateStats[];
  remoteCandidates: IceCandidateStats[];
  connectionStartTime?: number;
  connectionEstablishedTime?: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type NatType = 'open_internet' | 'full_cone' | 'restricted_cone' | 'port_restricted_cone' | 'symmetric' | 'unknown';

export interface P2PConfig {
  enableTurn?: boolean;
  forceRelay?: boolean;
  customStunServers?: IceServerConfig[];
  customTurnServers?: IceServerConfig[];
  iceGatheringTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export class P2PManager {
  private nodeId: string | null = null;
  private location: GeoLocation = { lat: 0, lon: 0 };
  private bandwidth: BandwidthInfo = { upload_speed: 0, download_speed: 0, latency_ms: 0 };
  private heldChunks: ChunkHeld[] = [];
  private connections: Map<string, PeerConnection> = new Map();
  private heartbeatInterval: number | null = null;
  private chokeCheckInterval: number | null = null;
  private status: ConnectionStatus = 'disconnected';
  private chokeStatus: ChokeStatus | null = null;
  private config: P2PConfig = {
    enableTurn: true,
    forceRelay: false,
    iceGatheringTimeoutMs: 5000,
    connectionTimeoutMs: 15000,
  };
  private natType: NatType = 'unknown';
  private onMessageCallbacks: Map<string, ((msg: P2PMessage, peerId: string) => void)[]> = new Map();
  private onConnectionChangeCallbacks: ((status: ConnectionStatus) => void)[] = [];
  private onChokeStatusChangeCallbacks: ((status: ChokeStatus | null) => void)[] = [];
  private onPeerConnectionChangeCallbacks: ((peerId: string, status: ConnectionStatus) => void)[] = [];

  constructor(config?: Partial<P2PConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  getNodeId(): string | null {
    return this.nodeId;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getNatType(): NatType {
    return this.natType;
  }

  setConfig(config: Partial<P2PConfig>) {
    this.config = { ...this.config, ...config };
  }

  setLocation(location: GeoLocation) {
    this.location = location;
  }

  setBandwidth(bandwidth: BandwidthInfo) {
    this.bandwidth = bandwidth;
  }

  addHeldChunk(fileId: string, chunkIndex: number) {
    const exists = this.heldChunks.some(
      (c) => c.file_id === fileId && c.chunk_index === chunkIndex
    );
    if (!exists) {
      this.heldChunks.push({ file_id: fileId, chunk_index: chunkIndex });
    }
  }

  async connect(): Promise<string> {
    try {
      this.status = 'connecting';
      this.notifyConnectionChange();

      const address = `${window.location.protocol}//${window.location.host}`;
      const publicIp = await this.getPublicIp();

      const response = await trackerApi.registerNode({
        address,
        public_ip: publicIp,
        location: this.location,
        bandwidth: this.bandwidth,
      });

      this.nodeId = response.node_id;
      this.status = 'connected';
      this.notifyConnectionChange();

      this.startHeartbeat();
      this.startChokeCheck();
      this.checkChokeStatus();

      this.detectNatType().catch((e) => {
        console.warn('NAT type detection failed:', e);
      });

      return this.nodeId;
    } catch (error) {
      this.status = 'error';
      this.notifyConnectionChange();
      throw error;
    }
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.chokeCheckInterval) {
      clearInterval(this.chokeCheckInterval);
      this.chokeCheckInterval = null;
    }

    this.connections.forEach((conn) => {
      conn.dataChannel?.close();
      conn.connection.close();
    });
    this.connections.clear();
    this.nodeId = null;
    this.chokeStatus = null;
    this.status = 'disconnected';
    this.notifyConnectionChange();
    this.notifyChokeStatusChange();
  }

  async createConnection(remoteNodeId: string): Promise<PeerConnection> {
    if (this.connections.has(remoteNodeId)) {
      return this.connections.get(remoteNodeId)!;
    }

    const iceConfig = getOptimizedIceConfig({
      enableTurn: this.config.enableTurn,
      forceRelay: this.config.forceRelay,
      customStunServers: this.config.customStunServers,
      customTurnServers: this.config.customTurnServers,
    });

    const pc = new RTCPeerConnection(iceConfig);
    const connectionId = this.generateId();

    const peerConn: PeerConnection = {
      id: connectionId,
      connection: pc,
      remoteNodeId,
      isInitiator: true,
      localCandidates: [],
      remoteCandidates: [],
      connectionStartTime: Date.now(),
    };

    this.connections.set(remoteNodeId, peerConn);

    const dataChannel = pc.createDataChannel('file-transfer', {
      ordered: true,
      maxRetransmits: 3,
    });

    peerConn.dataChannel = dataChannel;
    this.setupDataChannelHandlers(dataChannel, remoteNodeId);

    pc.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate) {
        const candidateStats = parseCandidate(event.candidate.candidate);
        peerConn.localCandidates.push(candidateStats);

        console.debug(
          `[ICE] Local candidate for ${remoteNodeId}: ${formatIceCandidateStats(candidateStats)}`
        );

        this.sendMessage(remoteNodeId, {
          type: 'ice-candidate',
          payload: event.candidate,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.debug(`[ICE] Connection state with ${remoteNodeId}: ${pc.iceConnectionState}`);
      this.handleIceConnectionStateChange(remoteNodeId, pc.iceConnectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.debug(`[ICE] Gathering state with ${remoteNodeId}: ${pc.iceGatheringState}`);
      if (pc.iceGatheringState === 'complete') {
        const sorted = sortCandidatesByPriority(peerConn.localCandidates);
        console.log(`[ICE] ICE gathering complete for ${remoteNodeId}, gathered ${peerConn.localCandidates.length} candidates`);
        console.log(`[ICE] Top 3 candidates:`);
        sorted.slice(0, 3).forEach((c, i) => {
          console.log(`  ${i + 1}. ${formatIceCandidateStats(c)}`);
        });
      }
    };

    setTimeout(() => {
      if (pc.iceGatheringState !== 'complete' && peerConn.localCandidates.length === 0) {
        console.warn(`[ICE] ICE gathering timeout for ${remoteNodeId}, forcing end of candidates`);
        this.sendMessage(remoteNodeId, {
          type: 'ice-candidate',
          payload: { candidate: '' },
        });
      }
    }, this.config.iceGatheringTimeoutMs);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendMessage(remoteNodeId, {
      type: 'offer',
      payload: offer,
    });

    return peerConn;
  }

  async handleOffer(remoteNodeId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let peerConn = this.connections.get(remoteNodeId);

    if (!peerConn) {
      const iceConfig = getOptimizedIceConfig({
        enableTurn: this.config.enableTurn,
        forceRelay: this.config.forceRelay,
        customStunServers: this.config.customStunServers,
        customTurnServers: this.config.customTurnServers,
      });

      const pc = new RTCPeerConnection(iceConfig);
      const connectionId = this.generateId();

      peerConn = {
        id: connectionId,
        connection: pc,
        remoteNodeId,
        isInitiator: false,
        localCandidates: [],
        remoteCandidates: [],
        connectionStartTime: Date.now(),
      };

      this.connections.set(remoteNodeId, peerConn);

      pc.ondatachannel = (event) => {
        peerConn!.dataChannel = event.channel;
        this.setupDataChannelHandlers(event.channel, remoteNodeId);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && event.candidate.candidate) {
          const candidateStats = parseCandidate(event.candidate.candidate);
          peerConn!.localCandidates.push(candidateStats);

          console.debug(
            `[ICE] Local candidate for ${remoteNodeId}: ${formatIceCandidateStats(candidateStats)}`
          );

          this.sendMessage(remoteNodeId, {
            type: 'ice-candidate',
            payload: event.candidate,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.debug(`[ICE] Connection state with ${remoteNodeId}: ${pc.iceConnectionState}`);
        this.handleIceConnectionStateChange(remoteNodeId, pc.iceConnectionState);
      };

      pc.onicegatheringstatechange = () => {
        console.debug(`[ICE] Gathering state with ${remoteNodeId}: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'complete') {
          const sorted = sortCandidatesByPriority(peerConn!.localCandidates);
          console.log(`[ICE] ICE gathering complete for ${remoteNodeId}, gathered ${peerConn!.localCandidates.length} candidates`);
          console.log(`[ICE] Top 3 candidates:`);
          sorted.slice(0, 3).forEach((c, i) => {
            console.log(`  ${i + 1}. ${formatIceCandidateStats(c)}`);
          });
        }
      };

      setTimeout(() => {
        if (pc.iceGatheringState !== 'complete' && peerConn!.localCandidates.length === 0) {
          console.warn(`[ICE] ICE gathering timeout for ${remoteNodeId}, forcing end of candidates`);
          this.sendMessage(remoteNodeId, {
            type: 'ice-candidate',
            payload: { candidate: '' },
          });
        }
      }, this.config.iceGatheringTimeoutMs);
    }

    await peerConn.connection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConn.connection.createAnswer();
    await peerConn.connection.setLocalDescription(answer);

    this.sendMessage(remoteNodeId, {
      type: 'answer',
      payload: answer,
    });
  }

  async handleAnswer(remoteNodeId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerConn = this.connections.get(remoteNodeId);
    if (peerConn) {
      await peerConn.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleIceCandidate(remoteNodeId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peerConn = this.connections.get(remoteNodeId);
    if (peerConn && candidate?.candidate) {
      try {
        const candidateStats = parseCandidate(candidate.candidate);
        peerConn.remoteCandidates.push(candidateStats);

        console.debug(
          `[ICE] Remote candidate from ${remoteNodeId}: ${formatIceCandidateStats(candidateStats)}`
        );

        await peerConn.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('[ICE] Error adding ICE candidate:', e);
      }
    }
  }

  private handleIceConnectionStateChange(remoteNodeId: string, state: RTCIceConnectionState) {
    const peerConn = this.connections.get(remoteNodeId);
    if (!peerConn) return;

    switch (state) {
      case 'connected':
      case 'completed':
        peerConn.connectionEstablishedTime = Date.now();
        const connectTime = peerConn.connectionStartTime
          ? peerConn.connectionEstablishedTime - peerConn.connectionStartTime
          : 0;
        console.log(
          `[ICE] Connection established with ${remoteNodeId} in ${connectTime}ms`
        );
        this.notifyPeerConnectionChange(remoteNodeId, 'connected');
        this.logConnectionStats(remoteNodeId);
        break;
      case 'disconnected':
        console.warn(`[ICE] Connection disconnected with ${remoteNodeId}`);
        this.notifyPeerConnectionChange(remoteNodeId, 'disconnected');
        break;
      case 'failed':
        console.error(`[ICE] Connection failed with ${remoteNodeId}`);
        this.notifyPeerConnectionChange(remoteNodeId, 'error');
        this.attemptReconnect(remoteNodeId);
        break;
      case 'checking':
        this.notifyPeerConnectionChange(remoteNodeId, 'connecting');
        break;
    }
  }

  private async attemptReconnect(remoteNodeId: string) {
    console.log(`[ICE] Attempting to reconnect to ${remoteNodeId}...`);

    const peerConn = this.connections.get(remoteNodeId);
    if (!peerConn) return;

    try {
      peerConn.connection.restartIce();
      if (peerConn.isInitiator) {
        const offer = await peerConn.connection.createOffer({ iceRestart: true });
        await peerConn.connection.setLocalDescription(offer);
        this.sendMessage(remoteNodeId, {
          type: 'offer',
          payload: offer,
        });
      }
    } catch (e) {
      console.error('[ICE] Reconnection attempt failed:', e);
    }
  }

  private async detectNatType(): Promise<NatType> {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      pc.createDataChannel('nat-detect');

      const candidates: RTCIceCandidate[] = [];
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidates.push(e.candidate);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          pc.close();
          resolve();
        }, 3000);

        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            pc.close();
            resolve();
          }
        };
      });

      const candidateTypes = candidates.map((c) =>
        c.candidate?.includes('typ host')
          ? 'host'
          : c.candidate?.includes('typ srflx')
          ? 'srflx'
          : c.candidate?.includes('typ relay')
          ? 'relay'
          : 'unknown'
      );

      if (candidateTypes.includes('host') && candidateTypes.includes('srflx')) {
        this.natType = 'full_cone';
      } else if (candidateTypes.includes('srflx') && !candidateTypes.includes('host')) {
        this.natType = 'symmetric';
      } else if (candidateTypes.includes('host')) {
        this.natType = 'open_internet';
      } else {
        this.natType = 'unknown';
      }

      console.log(`[NAT] Detected NAT type: ${this.natType}`);
      return this.natType;
    } catch (e) {
      console.warn('[NAT] Detection failed:', e);
      this.natType = 'unknown';
      return this.natType;
    }
  }

  getConnectionStats(remoteNodeId: string): ConnectionStats | null {
    const peerConn = this.connections.get(remoteNodeId);
    if (!peerConn) return null;

    return {
      localCandidates: peerConn.localCandidates,
      remoteCandidates: peerConn.remoteCandidates,
      connectionTimeMs: peerConn.connectionEstablishedTime && peerConn.connectionStartTime
        ? peerConn.connectionEstablishedTime - peerConn.connectionStartTime
        : undefined,
      bytesSent: 0,
      bytesReceived: 0,
    };
  }

  getAllConnectionStats(): Map<string, ConnectionStats> {
    const stats = new Map<string, ConnectionStats>();
    for (const [peerId] of this.connections) {
      const connStats = this.getConnectionStats(peerId);
      if (connStats) {
        stats.set(peerId, connStats);
      }
    }
    return stats;
  }

  private async logConnectionStats(remoteNodeId: string) {
    const stats = this.getConnectionStats(remoteNodeId);
    if (!stats) return;

    console.log(`[Connection] Stats for ${remoteNodeId}:`);
    console.log(`  Connection time: ${stats.connectionTimeMs}ms`);
    console.log(`  Local candidates (${stats.localCandidates.length}):`);
    sortCandidatesByPriority(stats.localCandidates).slice(0, 3).forEach((c, i) => {
      console.log(`    ${i + 1}. ${formatIceCandidateStats(c)}`);
    });
    console.log(`  Remote candidates (${stats.remoteCandidates.length}):`);
    sortCandidatesByPriority(stats.remoteCandidates).slice(0, 3).forEach((c, i) => {
      console.log(`    ${i + 1}. ${formatIceCandidateStats(c)}`);
    });
  }

  sendMessage(remoteNodeId: string, message: P2PMessage) {
    const peerConn = this.connections.get(remoteNodeId);
    if (peerConn?.dataChannel?.readyState === 'open') {
      peerConn.dataChannel.send(JSON.stringify(message));
    }
  }

  sendChunkData(remoteNodeId: string, fileId: string, chunkIndex: number, data: ArrayBuffer) {
    const peerConn = this.connections.get(remoteNodeId);
    if (peerConn?.dataChannel?.readyState === 'open') {
      const header = JSON.stringify({
        type: 'chunk-data',
        payload: {
          fileId,
          chunkIndex,
          size: data.byteLength,
        },
      });

      const headerBytes = new TextEncoder().encode(header);
      const headerLength = new Uint32Array([headerBytes.length]);

      const buffer = new ArrayBuffer(4 + headerBytes.length + data.byteLength);
      const view = new DataView(buffer);

      view.setUint32(0, headerBytes.length, true);
      new Uint8Array(buffer, 4, headerBytes.length).set(headerBytes);
      new Uint8Array(buffer, 4 + headerBytes.length, data.byteLength).set(new Uint8Array(data));

      peerConn.dataChannel.send(buffer);
    }
  }

  onMessage(type: string, callback: (msg: P2PMessage, peerId: string) => void) {
    if (!this.onMessageCallbacks.has(type)) {
      this.onMessageCallbacks.set(type, []);
    }
    this.onMessageCallbacks.get(type)!.push(callback);
  }

  offMessage(type: string, callback: (msg: P2PMessage, peerId: string) => void) {
    const callbacks = this.onMessageCallbacks.get(type);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void) {
    this.onConnectionChangeCallbacks.push(callback);
  }

  offConnectionChange(callback: (status: ConnectionStatus) => void) {
    const index = this.onConnectionChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.onConnectionChangeCallbacks.splice(index, 1);
    }
  }

  onPeerConnectionChange(callback: (peerId: string, status: ConnectionStatus) => void) {
    this.onPeerConnectionChangeCallbacks.push(callback);
  }

  offPeerConnectionChange(callback: (peerId: string, status: ConnectionStatus) => void) {
    const index = this.onPeerConnectionChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.onPeerConnectionChangeCallbacks.splice(index, 1);
    }
  }

  private notifyPeerConnectionChange(peerId: string, status: ConnectionStatus) {
    this.onPeerConnectionChangeCallbacks.forEach((cb) => cb(peerId, status));
  }

  private setupDataChannelHandlers(dataChannel: RTCDataChannel, remoteNodeId: string) {
    dataChannel.onopen = () => {
      console.log(`[DataChannel] Connected to ${remoteNodeId}`);
    };

    dataChannel.onclose = () => {
      console.log(`[DataChannel] Closed with ${remoteNodeId}`);
    };

    dataChannel.onerror = (error) => {
      console.error(`[DataChannel] Error with ${remoteNodeId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data, remoteNodeId);
    };
  }

  private handleDataChannelMessage(data: any, remoteNodeId: string) {
    if (typeof data === 'string') {
      try {
        const message: P2PMessage = JSON.parse(data);
        this.dispatchMessage(message, remoteNodeId);
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    } else if (data instanceof ArrayBuffer) {
      this.handleBinaryMessage(data, remoteNodeId);
    }
  }

  private handleBinaryMessage(buffer: ArrayBuffer, remoteNodeId: string) {
    const view = new DataView(buffer);
    const headerLength = view.getUint32(0, true);
    const headerBytes = new Uint8Array(buffer, 4, headerLength);
    const header = JSON.parse(new TextDecoder().decode(headerBytes));
    const dataStart = 4 + headerLength;
    const chunkData = buffer.slice(dataStart);

    if (header.type === 'chunk-data') {
      this.dispatchMessage(
        {
          type: 'chunk-data',
          payload: {
            ...header.payload,
            data: chunkData,
          },
        },
        remoteNodeId
      );
    }
  }

  private dispatchMessage(message: P2PMessage, remoteNodeId: string) {
    const callbacks = this.onMessageCallbacks.get(message.type);
    if (callbacks) {
      callbacks.forEach((cb) => cb(message, remoteNodeId));
    }

    const allCallbacks = this.onMessageCallbacks.get('*');
    if (allCallbacks) {
      allCallbacks.forEach((cb) => cb(message, remoteNodeId));
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(async () => {
      if (this.nodeId) {
        try {
          await trackerApi.heartbeat({
            node_id: this.nodeId,
            bandwidth: this.bandwidth,
            held_chunks: this.heldChunks,
          });
        } catch (e) {
          console.error('Heartbeat error:', e);
        }
      }
    }, 15000);
  }

  private async getPublicIp(): Promise<string | undefined> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (e) {
      return undefined;
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async measureBandwidth(): Promise<BandwidthInfo> {
    const startTime = performance.now();
    const testData = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(testData);

    const uploadStart = performance.now();
    const uploadPromise = new Blob([testData]).arrayBuffer();
    await uploadPromise;
    const uploadTime = performance.now() - uploadStart;
    const uploadSpeed = Math.floor((testData.length / uploadTime) * 1000 * 8);

    const latency = Math.floor(performance.now() - startTime);

    this.bandwidth = {
      upload_speed: uploadSpeed,
      download_speed: uploadSpeed,
      latency_ms: latency,
    };

    return this.bandwidth;
  }

  async detectLocation(): Promise<GeoLocation> {
    return new Promise((resolve) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.location = {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            };
            resolve(this.location);
          },
          () => {
            this.location = { lat: 39.9042, lon: 116.4074, city: 'Beijing', country: 'CN' };
            resolve(this.location);
          },
          { timeout: 5000 }
        );
      } else {
        this.location = { lat: 39.9042, lon: 116.4074, city: 'Beijing', country: 'CN' };
        resolve(this.location);
      }
    });
  }

  getChokeStatus(): ChokeStatus | null {
    return this.chokeStatus;
  }

  isChoked(): boolean {
    return this.chokeStatus?.is_choked ?? false;
  }

  getDownloadSpeedLimit(): number | null {
    return this.chokeStatus?.download_speed_limit ?? null;
  }

  async reportTransfer(
    peerId: string,
    bytesTransferred: number,
    direction: 'Upload' | 'Download',
    chunkIndex: number,
    fileId: string
  ): Promise<void> {
    if (!this.nodeId) return;

    try {
      await trackerApi.reportTransfer({
        node_id: this.nodeId,
        peer_id: peerId,
        bytes_transferred: bytesTransferred,
        direction,
        chunk_index: chunkIndex,
        file_id: fileId,
      });
    } catch (e) {
      console.error('Failed to report transfer:', e);
    }
  }

  async checkChokeStatus(): Promise<void> {
    if (!this.nodeId) return;

    try {
      const status = await trackerApi.getChokeStatus(this.nodeId);
      if (status) {
        const wasChoked = this.chokeStatus?.is_choked ?? false;
        this.chokeStatus = status;

        if (wasChoked !== status.is_choked) {
          if (status.is_choked) {
            console.warn(
              `Node choked! Contribution ratio: ${status.contribution_ratio.toFixed(2)}, ` +
              `download speed limited to ${status.download_speed_limit ? (status.download_speed_limit / 1000000).toFixed(1) + ' Mbps' : 'unknown'}`
            );
          } else {
            console.log('Node unchoked!');
          }
          this.notifyChokeStatusChange();
        }
      }
    } catch (e) {
      console.error('Failed to check choke status:', e);
    }
  }

  private startChokeCheck() {
    this.chokeCheckInterval = window.setInterval(async () => {
      if (this.nodeId) {
        await this.checkChokeStatus();
      }
    }, 30000);
  }

  onChokeStatusChange(callback: (status: ChokeStatus | null) => void) {
    this.onChokeStatusChangeCallbacks.push(callback);
  }

  offChokeStatusChange(callback: (status: ChokeStatus | null) => void) {
    const index = this.onChokeStatusChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.onChokeStatusChangeCallbacks.splice(index, 1);
    }
  }

  private notifyChokeStatusChange() {
    this.onChokeStatusChangeCallbacks.forEach((cb) => cb(this.chokeStatus));
  }

  private notifyConnectionChange() {
    this.onConnectionChangeCallbacks.forEach((cb) => cb(this.status));
  }
}

export const p2pManager = new P2PManager();
