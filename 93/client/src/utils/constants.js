export const CHUNK_SIZE = 64 * 1024;

export const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export const MESSAGE_TYPES = {
  FILE_METADATA: 'FILE_METADATA',
  CHUNK: 'CHUNK',
  CHUNK_ACK: 'CHUNK_ACK',
  CHUNK_RETRANSMIT: 'CHUNK_RETRANSMIT',
  FILE_COMPLETE: 'FILE_COMPLETE',
  TRANSFER_CANCEL: 'TRANSFER_CANCEL',
  KEY_EXCHANGE: 'KEY_EXCHANGE',
  KEY_EXCHANGE_ACK: 'KEY_EXCHANGE_ACK'
};

export const SIGNALING_URL = 'ws://localhost:8080';
