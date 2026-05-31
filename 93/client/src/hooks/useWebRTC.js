import { useState, useRef, useCallback } from 'react';
import { RTC_CONFIG, MESSAGE_TYPES, CHUNK_SIZE } from '../utils/constants';
import { calculateSHA256 } from '../utils/hash';
import {
  generateECDHKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  encryptChunk,
  decryptChunk
} from '../utils/crypto';

export function useWebRTC(sendSignal, onSignal) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const fileChunksRef = useRef(new Map());
  const receivedChunksRef = useRef(new Map());
  const chunkStatusRef = useRef(new Map());
  const fileMetadataRef = useRef(null);
  const retransmitQueueRef = useRef(new Set());
  const messageHandlersRef = useRef(new Map());
  const onChunkAckRef = useRef(null);
  const onChunkReceivedRef = useRef(null);
  const onFileCompleteRef = useRef(null);
  const onFileMetadataRef = useRef(null);
  
  const RETRANSMIT_COOLDOWN = 1000;
  const retransmitCooldownRef = useRef(new Map());
  const inFlightChunksRef = useRef(new Map());
  
  const ecdhKeyPairRef = useRef(null);
  const sharedKeyRef = useRef(null);
  const encryptionReadyRef = useRef(false);
  const onEncryptionReadyRef = useRef(null);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: 'ICE_CANDIDATE', candidate: event.candidate });
      }
    };
    
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      setConnectionStatus(state);
      if (state === 'connected') {
        setIsConnected(true);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setIsConnected(false);
      }
    };
    
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };
    
    peerConnectionRef.current = pc;
    return pc;
  }, [sendSignal]);

  const setupDataChannel = useCallback((channel) => {
    dataChannelRef.current = channel;
    
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
    };
    
    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } else {
        handleBinaryMessage(event.data);
      }
    };
    
    channel.onclose = () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };
    
    channel.onerror = (error) => {
      console.error('Data channel error:', error);
    };
  }, []);

  const initiateKeyExchange = useCallback(async () => {
    try {
      const keyPair = await generateECDHKeyPair();
      ecdhKeyPairRef.current = keyPair;
      
      const publicKeyBase64 = await exportPublicKey(keyPair);
      
      sendData(JSON.stringify({
        type: MESSAGE_TYPES.KEY_EXCHANGE,
        publicKey: publicKeyBase64
      }));
    } catch (error) {
      console.error('密钥交换初始化失败:', error);
    }
  }, [sendData]);

  const handleKeyExchange = useCallback(async (message) => {
    try {
      const peerPublicKey = await importPublicKey(message.publicKey);
      
      if (!ecdhKeyPairRef.current) {
        ecdhKeyPairRef.current = await generateECDHKeyPair();
        const publicKeyBase64 = await exportPublicKey(ecdhKeyPairRef.current);
        sendData(JSON.stringify({
          type: MESSAGE_TYPES.KEY_EXCHANGE_ACK,
          publicKey: publicKeyBase64
        }));
      }
      
      const sharedKey = await deriveSharedSecret(
        ecdhKeyPairRef.current.privateKey,
        peerPublicKey
      );
      
      sharedKeyRef.current = sharedKey;
      encryptionReadyRef.current = true;
      
      if (onEncryptionReadyRef.current) {
        onEncryptionReadyRef.current();
      }
    } catch (error) {
      console.error('密钥交换处理失败:', error);
    }
  }, [sendData]);

  const handleKeyExchangeAck = useCallback(async (message) => {
    try {
      const peerPublicKey = await importPublicKey(message.publicKey);
      
      const sharedKey = await deriveSharedSecret(
        ecdhKeyPairRef.current.privateKey,
        peerPublicKey
      );
      
      sharedKeyRef.current = sharedKey;
      encryptionReadyRef.current = true;
      
      if (onEncryptionReadyRef.current) {
        onEncryptionReadyRef.current();
      }
    } catch (error) {
      console.error('密钥确认处理失败:', error);
    }
  }, []);

  const isEncryptionReady = useCallback(() => {
    return encryptionReadyRef.current;
  }, []);

  const setEncryptionReadyHandler = useCallback((handler) => {
    onEncryptionReadyRef.current = handler;
  }, []);

  const handleMessage = useCallback(async (message) => {
    switch (message.type) {
      case MESSAGE_TYPES.KEY_EXCHANGE:
        await handleKeyExchange(message);
        break;
        
      case MESSAGE_TYPES.KEY_EXCHANGE_ACK:
        await handleKeyExchangeAck(message);
        break;
        
      case MESSAGE_TYPES.FILE_METADATA:
        fileMetadataRef.current = message.metadata;
        receivedChunksRef.current = new Map();
        chunkStatusRef.current = new Map();
        retransmitQueueRef.current.clear();
        if (onFileMetadataRef.current) {
          onFileMetadataRef.current(message.metadata);
        }
        break;
        
      case MESSAGE_TYPES.CHUNK_ACK:
        if (onChunkAckRef.current) {
          onChunkAckRef.current(message.index, message.hash, message.isValid, message.duplicate);
        }
        break;
        
      case MESSAGE_TYPES.CHUNK_RETRANSMIT: {
        const now = Date.now();
        const lastRequest = retransmitCooldownRef.current.get(message.index);
        if (!lastRequest || (now - lastRequest) > 500) {
          retransmitCooldownRef.current.set(message.index, now);
          retransmitQueueRef.current.add(message.index);
        }
        break;
      }
        
      case MESSAGE_TYPES.FILE_COMPLETE:
        if (onFileCompleteRef.current) {
          const allChunks = [];
          for (let i = 0; i < receivedChunksRef.current.size; i++) {
            allChunks.push(receivedChunksRef.current.get(i));
          }
          const fileBlob = new Blob(allChunks);
          onFileCompleteRef.current(fileBlob, fileMetadataRef.current);
        }
        break;
        
      case MESSAGE_TYPES.TRANSFER_CANCEL:
        cleanupTransfer();
        break;
    }
  }, []);

  const handleBinaryMessage = useCallback(async (data) => {
    if (!fileMetadataRef.current) return;
    
    const uint8 = new Uint8Array(data);
    const indexView = new DataView(uint8.buffer, 0, 4);
    const index = indexView.getUint32(0, true);
    
    const existingChunk = receivedChunksRef.current.get(index);
    if (existingChunk) {
      sendData(JSON.stringify({
        type: MESSAGE_TYPES.CHUNK_ACK,
        index,
        duplicate: true,
        isValid: true
      }));
      return;
    }
    
    let chunkData;
    
    if (encryptionReadyRef.current && sharedKeyRef.current) {
      try {
        const encryptedData = uint8.slice(4);
        chunkData = await decryptChunk(sharedKeyRef.current, encryptedData.buffer, index);
      } catch (decryptError) {
        console.error(`分片 ${index} 解密失败:`, decryptError);
        sendData(JSON.stringify({
          type: MESSAGE_TYPES.CHUNK_ACK,
          index,
          isValid: false
        }));
        
        const now = Date.now();
        const lastRequest = retransmitCooldownRef.current.get(index);
        
        if (!lastRequest || (now - lastRequest) > RETRANSMIT_COOLDOWN) {
          retransmitCooldownRef.current.set(index, now);
          retransmitQueueRef.current.add(index);
          sendData(JSON.stringify({
            type: MESSAGE_TYPES.CHUNK_RETRANSMIT,
            index
          }));
        }
        return;
      }
    } else {
      chunkData = uint8.slice(4);
    }
    
    const computedHash = await calculateSHA256(chunkData);
    const expectedHash = fileMetadataRef.current.chunkHashes[index];
    const isValid = computedHash === expectedHash;
    
    if (isValid) {
      receivedChunksRef.current.set(index, chunkData);
    }
    
    chunkStatusRef.current.set(index, {
      status: isValid ? 'success' : 'invalid',
      retransmitted: chunkStatusRef.current.has(index)
    });
    
    if (onChunkReceivedRef.current) {
      onChunkReceivedRef.current(index, isValid, computedHash);
    }
    
    sendData(JSON.stringify({
      type: MESSAGE_TYPES.CHUNK_ACK,
      index,
      hash: computedHash,
      isValid
    }));
    
    if (!isValid) {
      const now = Date.now();
      const lastRequest = retransmitCooldownRef.current.get(index);
      
      if (!lastRequest || (now - lastRequest) > RETRANSMIT_COOLDOWN) {
        retransmitCooldownRef.current.set(index, now);
        retransmitQueueRef.current.add(index);
        sendData(JSON.stringify({
          type: MESSAGE_TYPES.CHUNK_RETRANSMIT,
          index
        }));
      }
    }
  }, []);

  const createOffer = useCallback(async () => {
    const pc = createPeerConnection();
    const dataChannel = pc.createDataChannel('file-transfer');
    setupDataChannel(dataChannel);
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    sendSignal({ type: 'OFFER', sdp: offer });
  }, [createPeerConnection, setupDataChannel, sendSignal]);

  const handleOffer = useCallback(async (sdp) => {
    const pc = createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    sendSignal({ type: 'ANSWER', sdp: answer });
  }, [createPeerConnection, sendSignal]);

  const handleAnswer = useCallback(async (sdp) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const setupSignalHandlers = useCallback(() => {
    return onSignal((data) => {
      switch (data.type) {
        case 'OFFER':
          handleOffer(data.sdp);
          break;
        case 'ANSWER':
          handleAnswer(data.sdp);
          break;
        case 'ICE_CANDIDATE':
          handleIceCandidate(data.candidate);
          break;
      }
    });
  }, [onSignal, handleOffer, handleAnswer, handleIceCandidate]);

  const sendData = useCallback((data) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(data);
      return true;
    }
    return false;
  }, []);

  const prepareFileChunks = useCallback(async (file, onProgress) => {
    const chunks = [];
    const chunkHashes = [];
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const buffer = await chunk.arrayBuffer();
      const hash = await calculateSHA256(buffer);
      
      chunks.push(buffer);
      chunkHashes.push(hash);
      
      if (onProgress) {
        onProgress(i + 1, totalChunks);
      }
    }
    
    fileChunksRef.current = new Map(chunks.map((c, i) => [i, c]));
    chunkStatusRef.current = new Map();
    
    return { chunks, chunkHashes, totalChunks };
  }, []);

  const sendFileMetadata = useCallback((file, chunkHashes, totalChunks) => {
    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type,
      chunkCount: totalChunks,
      chunkSize: CHUNK_SIZE,
      chunkHashes
    };
    
    fileMetadataRef.current = metadata;
    sendData(JSON.stringify({
      type: MESSAGE_TYPES.FILE_METADATA,
      metadata
    }));
  }, [sendData]);

  const sendChunk = useCallback(async (index, isRetransmit = false) => {
    const chunk = fileChunksRef.current.get(index);
    if (!chunk) return false;
    
    const inFlight = inFlightChunksRef.current.get(index);
    if (inFlight && !isRetransmit) return false;
    
    let payloadData;
    
    if (encryptionReadyRef.current && sharedKeyRef.current) {
      try {
        const encrypted = await encryptChunk(sharedKeyRef.current, chunk, index);
        payloadData = encrypted;
      } catch (encryptError) {
        console.error(`分片 ${index} 加密失败:`, encryptError);
        return false;
      }
    } else {
      payloadData = chunk;
    }
    
    const buffer = new ArrayBuffer(4 + payloadData.byteLength);
    const view = new DataView(buffer);
    view.setUint32(0, index, true);
    new Uint8Array(buffer, 4).set(new Uint8Array(payloadData));
    
    const sent = sendData(buffer);
    if (sent) {
      inFlightChunksRef.current.set(index, {
        sentAt: Date.now(),
        isRetransmit,
        attempts: (inFlight?.attempts || 0) + 1
      });
    }
    
    return sent;
  }, [sendData]);

  const markChunkAcked = useCallback((index) => {
    inFlightChunksRef.current.delete(index);
  }, []);

  const getInFlightChunks = useCallback(() => {
    return inFlightChunksRef.current;
  }, []);

  const getStaleChunks = useCallback((timeoutMs = 3000) => {
    const now = Date.now();
    const stale = [];
    inFlightChunksRef.current.forEach((info, index) => {
      if (now - info.sentAt > timeoutMs && info.attempts < 5) {
        stale.push(index);
      }
    });
    return stale;
  }, []);

  const cleanupTransfer = useCallback(() => {
    fileChunksRef.current.clear();
    receivedChunksRef.current.clear();
    chunkStatusRef.current.clear();
    fileMetadataRef.current = null;
    retransmitQueueRef.current.clear();
    retransmitCooldownRef.current.clear();
    inFlightChunksRef.current.clear();
    ecdhKeyPairRef.current = null;
    sharedKeyRef.current = null;
    encryptionReadyRef.current = false;
  }, []);

  const closeConnection = useCallback(() => {
    cleanupTransfer();
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, [cleanupTransfer]);

  const setChunkAckHandler = useCallback((handler) => {
    onChunkAckRef.current = handler;
  }, []);

  const setChunkReceivedHandler = useCallback((handler) => {
    onChunkReceivedRef.current = handler;
  }, []);

  const setFileCompleteHandler = useCallback((handler) => {
    onFileCompleteRef.current = handler;
  }, []);

  const setFileMetadataHandler = useCallback((handler) => {
    onFileMetadataRef.current = handler;
  }, []);

  const sendFileComplete = useCallback(() => {
    sendData(JSON.stringify({
      type: MESSAGE_TYPES.FILE_COMPLETE
    }));
  }, [sendData]);

  return {
    isConnected,
    connectionStatus,
    createOffer,
    setupSignalHandlers,
    sendData,
    prepareFileChunks,
    sendFileMetadata,
    sendChunk,
    sendFileComplete,
    closeConnection,
    cleanupTransfer,
    setChunkAckHandler,
    setChunkReceivedHandler,
    setFileCompleteHandler,
    setFileMetadataHandler,
    getRetransmitQueue: () => retransmitQueueRef.current,
    getReceivedChunks: () => receivedChunksRef.current,
    getChunkStatus: () => chunkStatusRef.current,
    getFileMetadata: () => fileMetadataRef.current,
    markChunkAcked,
    getInFlightChunks,
    getStaleChunks,
    initiateKeyExchange,
    isEncryptionReady,
    setEncryptionReadyHandler
  };
}
