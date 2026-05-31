import { useState, useRef, useCallback, useEffect } from 'react';
import { encryptData, decryptData } from '../utils/crypto';

const SIGNALING_SERVER_URL = 'ws://localhost:3001';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useWebRTC() {
  const [wsConnected, setWsConnected] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [error, setError] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(false);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const onMessageRef = useRef(null);
  const remoteUserIdRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isInitiatorRef = useRef(false);
  const onReconnectSuccessRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioTrackRef = useRef(null);

  const connectSignaling = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setWsConnected(false);
      setConnected(false);
    };

    ws.onerror = (e) => {
      console.error('WebSocket error:', e);
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      await handleSignalingMessage(data);
    };
  }, []);

  const handleSignalingMessage = async (data) => {
    switch (data.type) {
      case 'room-created':
        setRoomId(data.roomId);
        setUserId(data.userId);
        isInitiatorRef.current = true;
        break;
      case 'room-joined':
        setRoomId(data.roomId);
        setUserId(data.userId);
        isInitiatorRef.current = false;
        const otherUser = data.users.find(u => u !== data.userId);
        if (otherUser) {
          remoteUserIdRef.current = otherUser;
          setRemoteUserId(otherUser);
          await createOffer(otherUser);
        }
        break;
      case 'user-joined':
        remoteUserIdRef.current = data.userId;
        setRemoteUserId(data.userId);
        if (isInitiatorRef.current) {
          await createOffer(data.userId);
        }
        break;
      case 'user-left':
        setConnected(false);
        setRemoteUserId(null);
        setRemoteAudioEnabled(false);
        remoteUserIdRef.current = null;
        break;
      case 'offer':
        await handleOffer(data);
        break;
      case 'answer':
        await handleAnswer(data);
        break;
      case 'ice-candidate':
        await handleIceCandidate(data);
        break;
      case 'error':
        setError(data.message);
        break;
      default:
        break;
    }
  };

  const cleanupPeerConnection = useCallback(() => {
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch (e) {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }
  }, []);

  const addAudioTracks = useCallback((pc) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        if (audioTrackRef.current !== track) {
          pc.addTrack(track, localStreamRef.current);
          audioTrackRef.current = track;
        }
      });
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    cleanupPeerConnection();

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    addAudioTracks(pc);

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        setRemoteAudioEnabled(true);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserIdRef.current) {
        sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          to: remoteUserIdRef.current,
          from: userId,
          roomId,
        });
      }
    };

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      setupDataChannel(dc);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setConnected(true);
        setIsReconnecting(false);
        setReconnectAttempts(0);
        reconnectAttemptsRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        if (onReconnectSuccessRef.current) {
          onReconnectSuccessRef.current();
        }
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setConnected(false);
        setRemoteAudioEnabled(false);
        if (remoteUserIdRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          scheduleReconnect();
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'failed' || iceState === 'disconnected') {
        if (remoteUserIdRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          scheduleReconnect();
        }
      }
    };

    return pc;
  }, [userId, roomId, cleanupPeerConnection, addAudioTracks]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      return;
    }

    setIsReconnecting(true);
    reconnectAttemptsRef.current += 1;
    setReconnectAttempts(reconnectAttemptsRef.current);

    console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);

    reconnectTimeoutRef.current = setTimeout(async () => {
      reconnectTimeoutRef.current = null;
      
      if (remoteUserIdRef.current) {
        try {
          if (isInitiatorRef.current) {
            await createOffer(remoteUserIdRef.current);
          } else {
            const pc = createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer' }));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
          }
        } catch (e) {
          console.error('Reconnect attempt failed:', e);
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            scheduleReconnect();
          } else {
            setIsReconnecting(false);
            setError('重连失败，请刷新页面');
          }
        }
      }
    }, RECONNECT_DELAY);
  }, [createPeerConnection]);

  const setupDataChannel = (dc) => {
    dcRef.current = dc;

    dc.onopen = () => {
      setConnected(true);
      setIsReconnecting(false);
      setReconnectAttempts(0);
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (onReconnectSuccessRef.current) {
        onReconnectSuccessRef.current();
      }
    };

    dc.onclose = () => {
      setConnected(false);
      if (remoteUserIdRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        scheduleReconnect();
      }
    };

    dc.onerror = (e) => {
      console.error('DataChannel error:', e);
    };

    dc.onmessage = (event) => {
      if (onMessageRef.current) {
        const decrypted = decryptData(event.data);
        if (decrypted) {
          onMessageRef.current(decrypted);
        }
      }
    };
  };

  const createOffer = async (targetUserId) => {
    const pc = createPeerConnection();
    const dc = pc.createDataChannel('whiteboard');
    setupDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendSignalingMessage({
      type: 'offer',
      offer,
      to: targetUserId,
      from: userId,
      roomId,
    });
  };

  const handleOffer = async (data) => {
    const pc = createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    sendSignalingMessage({
      type: 'answer',
      answer,
      to: data.from,
      from: userId,
      roomId,
    });
  };

  const handleAnswer = async (data) => {
    if (pcRef.current) {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  };

  const handleIceCandidate = async (data) => {
    if (pcRef.current && data.candidate) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    }
  };

  const sendSignalingMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const createRoom = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectSignaling();
      setTimeout(() => createRoom(), 500);
      return;
    }
    const uid = Math.random().toString(36).substring(2, 10);
    setUserId(uid);
    sendSignalingMessage({
      type: 'create-room',
      userId: uid,
    });
  }, [connectSignaling]);

  const joinRoom = useCallback((roomIdToJoin) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectSignaling();
      setTimeout(() => joinRoom(roomIdToJoin), 500);
      return;
    }
    const uid = Math.random().toString(36).substring(2, 10);
    setUserId(uid);
    sendSignalingMessage({
      type: 'join-room',
      roomId: roomIdToJoin,
      userId: uid,
    });
  }, [connectSignaling]);

  const sendMessage = useCallback((data) => {
    if (dcRef.current && dcRef.current.readyState === 'open') {
      const encrypted = encryptData(data);
      dcRef.current.send(encrypted);
      return true;
    }
    return false;
  }, []);

  const setOnMessage = useCallback((callback) => {
    onMessageRef.current = callback;
  }, []);

  const setOnReconnectSuccess = useCallback((callback) => {
    onReconnectSuccessRef.current = callback;
  }, []);

  const toggleAudio = useCallback(async () => {
    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        localStreamRef.current = stream;
        
        if (pcRef.current && pcRef.current.connectionState === 'connected') {
          stream.getAudioTracks().forEach(track => {
            pcRef.current.addTrack(track, stream);
            audioTrackRef.current = track;
          });
        }
        
        setAudioEnabled(true);
      } else {
        localStreamRef.current.getAudioTracks().forEach(track => {
          track.enabled = !track.enabled;
        });
        const newState = !audioEnabled;
        setAudioEnabled(newState);
        
        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) {
            sender.track.enabled = newState;
          }
        }
      }
    } catch (e) {
      console.error('Audio toggle error:', e);
      setError('无法访问麦克风，请检查权限设置');
    }
  }, [audioEnabled]);

  const stopAudio = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (audioTrackRef.current) {
      audioTrackRef.current = null;
    }
    setAudioEnabled(false);
  }, []);

  const setRemoteAudioElement = useCallback((element) => {
    remoteAudioRef.current = element;
  }, []);

  useEffect(() => {
    connectSignaling();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopAudio();
      cleanupPeerConnection();
    };
  }, [connectSignaling, cleanupPeerConnection, stopAudio]);

  return {
    wsConnected,
    roomId,
    userId,
    connected,
    remoteUserId,
    error,
    isReconnecting,
    reconnectAttempts,
    audioEnabled,
    remoteAudioEnabled,
    createRoom,
    joinRoom,
    sendMessage,
    setOnMessage,
    setOnReconnectSuccess,
    toggleAudio,
    stopAudio,
    setRemoteAudioElement,
  };
}
