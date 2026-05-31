import { useState, useRef, useCallback, useEffect } from 'react';
import { SIGNALING_URL } from '../utils/constants';

export function useSignaling() {
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const wsRef = useRef(null);
  const messageHandlersRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef([]);

  const connect = useCallback(() => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(SIGNALING_URL);
      
      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        resolve(ws);
      };
      
      ws.onerror = (err) => {
        setError('无法连接到信令服务器');
        reject(err);
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const handler = messageHandlersRef.current.get(message.type);
        if (handler) {
          handler(message);
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        setPeerConnected(false);
      };
      
      wsRef.current = ws;
    });
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      if (roomId) {
        sendMessage({ type: 'LEAVE_ROOM', roomId });
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoomId(null);
    setPeerConnected(false);
    messageHandlersRef.current.clear();
    pendingIceCandidatesRef.current = [];
  }, [roomId]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const createRoom = useCallback(async (userId = 'sender') => {
    try {
      if (!wsRef.current) {
        await connect();
      }
      
      return new Promise((resolve) => {
        const handler = (message) => {
          if (message.type === 'ROOM_CREATED') {
            setRoomId(message.roomId);
            messageHandlersRef.current.delete('ROOM_CREATED');
            resolve(message.roomId);
          }
        };
        messageHandlersRef.current.set('ROOM_CREATED', handler);
        sendMessage({ type: 'CREATE_ROOM', userId });
      });
    } catch (err) {
      setError('创建房间失败');
      throw err;
    }
  }, [connect, sendMessage]);

  const joinRoom = useCallback(async (roomIdToJoin, userId = 'receiver') => {
    try {
      if (!wsRef.current) {
        await connect();
      }
      
      return new Promise((resolve, reject) => {
        const errorHandler = (message) => {
          if (message.type === 'ERROR') {
            setError(message.message);
            messageHandlersRef.current.delete('ERROR');
            messageHandlersRef.current.delete('JOINED_ROOM');
            reject(new Error(message.message));
          }
        };
        
        const joinHandler = (message) => {
          if (message.type === 'JOINED_ROOM') {
            setRoomId(message.roomId);
            messageHandlersRef.current.delete('JOINED_ROOM');
            messageHandlersRef.current.delete('ERROR');
            resolve(message.roomId);
          }
        };
        
        messageHandlersRef.current.set('JOINED_ROOM', joinHandler);
        messageHandlersRef.current.set('ERROR', errorHandler);
        sendMessage({ type: 'JOIN_ROOM', roomId: roomIdToJoin, userId });
      });
    } catch (err) {
      throw err;
    }
  }, [connect, sendMessage]);

  const sendSignal = useCallback((data) => {
    if (roomId) {
      sendMessage({ type: 'SIGNAL', roomId, data });
    }
  }, [roomId, sendMessage]);

  const onSignal = useCallback((callback) => {
    const handler = (message) => {
      if (message.type === 'SIGNAL') {
        callback(message.data);
      }
    };
    messageHandlersRef.current.set('SIGNAL', handler);
    
    return () => {
      messageHandlersRef.current.delete('SIGNAL');
    };
  }, []);

  const onPeerConnected = useCallback((callback) => {
    const handler = (message) => {
      if (message.type === 'PEER_CONNECTED') {
        setPeerConnected(true);
        callback && callback();
      }
    };
    messageHandlersRef.current.set('PEER_CONNECTED', handler);
    
    return () => {
      messageHandlersRef.current.delete('PEER_CONNECTED');
    };
  }, []);

  const onPeerDisconnected = useCallback((callback) => {
    const handler = (message) => {
      if (message.type === 'PEER_DISCONNECTED') {
        setPeerConnected(false);
        callback && callback();
      }
    };
    messageHandlersRef.current.set('PEER_DISCONNECTED', handler);
    
    return () => {
      messageHandlersRef.current.delete('PEER_DISCONNECTED');
    };
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    roomId,
    peerConnected,
    error,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    sendSignal,
    onSignal,
    onPeerConnected,
    onPeerDisconnected
  };
}
