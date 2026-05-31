import { socketManager } from './socket';

class WebRTCManager {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private localStream: MediaStream | null = null;
  private onMessageCallback: ((from: string, data: any) => void) | null = null;
  private onStreamCallback: ((userId: string, stream: MediaStream) => void) | null = null;

  constructor() {
    socketManager.on('webrtc-signal', this.handleSignal.bind(this));
  }

  async initLocalStream(audio: boolean = false, video: boolean = false): Promise<MediaStream | null> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio, video });
      return this.localStream;
    } catch (e) {
      console.warn('Failed to get media stream:', e);
      return null;
    }
  }

  async createConnection(userId: string, isInitiator: boolean) {
    if (this.connections.has(userId)) return;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      this.onStreamCallback?.(userId, stream);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketManager.sendSignal({
          type: 'ice-candidate',
          to: userId,
          data: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removeConnection(userId);
      }
    };

    const dataChannel = pc.createDataChannel('sheet-music-data');
    this.setupDataChannel(dataChannel, userId);

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, userId);
    };

    this.connections.set(userId, pc);

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketManager.sendSignal({
          type: 'offer',
          to: userId,
          data: offer,
        });
      } catch (e) {
        console.error('Failed to create offer:', e);
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel, userId: string) {
    channel.onopen = () => {
      console.log(`Data channel open with ${userId}`);
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessageCallback?.(userId, data);
      } catch (e) {
        console.error('Failed to parse data channel message:', e);
      }
    };

    channel.onclose = () => {
      this.dataChannels.delete(userId);
    };

    this.dataChannels.set(userId, channel);
  }

  private async handleSignal(signal: { type: string; from: string; to: string; data: any }) {
    const { type, from, data } = signal;
    let pc = this.connections.get(from);

    if (!pc && type === 'offer') {
      await this.createConnection(from, false);
      pc = this.connections.get(from);
    }

    if (!pc) return;

    try {
      switch (type) {
        case 'offer':
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketManager.sendSignal({
            type: 'answer',
            to: from,
            data: answer,
          });
          break;

        case 'answer':
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          break;

        case 'ice-candidate':
          await pc.addIceCandidate(new RTCIceCandidate(data));
          break;
      }
    } catch (e) {
      console.error('Failed to handle signal:', e);
    }
  }

  sendToAll(data: any) {
    const message = JSON.stringify(data);
    this.dataChannels.forEach(channel => {
      if (channel.readyState === 'open') {
        channel.send(message);
      }
    });
  }

  sendTo(userId: string, data: any) {
    const channel = this.dataChannels.get(userId);
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify(data));
    }
  }

  removeConnection(userId: string) {
    const pc = this.connections.get(userId);
    if (pc) {
      pc.close();
      this.connections.delete(userId);
    }
    this.dataChannels.delete(userId);
  }

  setOnMessageCallback(callback: (from: string, data: any) => void) {
    this.onMessageCallback = callback;
  }

  setOnStreamCallback(callback: (userId: string, stream: MediaStream) => void) {
    this.onStreamCallback = callback;
  }

  getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  destroy() {
    this.connections.forEach(pc => pc.close());
    this.connections.clear();
    this.dataChannels.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
  }
}

export const webRTCManager = new WebRTCManager();
