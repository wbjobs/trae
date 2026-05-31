export interface VideoChunk {
  type: 'video';
  data: Uint8Array;
  pts: number;
  dts: number;
  isKeyFrame: boolean;
}

export interface SubtitleChunk {
  type: 'subtitle';
  data: string;
  pts: number;
  duration: number;
}

export interface ReliableSubtitleChunk extends SubtitleChunk {
  seq: number;
}

export type StreamChunk = VideoChunk | SubtitleChunk | ReliableSubtitleChunk;

export interface SessionInfo {
  sessionId: string;
  videoId: string;
  supportedTransports: string[];
  wsEndpoint?: string;
  wtEndpoint?: string;
}

export const TYPE_VIDEO = 0x01;
export const TYPE_SUBTITLE = 0x02;
export const TYPE_SUBTITLE_RELIABLE = 0x03;
export const TYPE_SACK = 0x04;
export const TYPE_DRIFT = 0x05;

export interface DriftDetectionResult {
  driftMs: number;
  confidence: number;
  audioStartPts: number;
  subtitleStartPts: number;
  sampleCount: number;
  timestamp: number;
}

function readFloat64BE(buffer: Uint8Array, offset: number): number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getFloat64(offset, false);
}

function readBigUint64BE(buffer: Uint8Array, offset: number): bigint {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getBigUint64(offset, false);
}

function readUInt32BE(buffer: Uint8Array, offset: number): number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getUint32(offset, false);
}

export interface ParsedReliableSubtitle {
  seq: number;
  data: string;
  pts: number;
  duration: number;
}

export function parseChunk(buffer: ArrayBuffer | Uint8Array): StreamChunk | null {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (data.length < 1) return null;

  const type = data[0];

  if (type === TYPE_VIDEO) {
    if (data.length < 26) return null;
    const header = data.subarray(1, 25);
    const payload = data.subarray(25);
    const dataLength = Number(readBigUint64BE(header, 0));
    const pts = readFloat64BE(header, 8);
    const dts = readFloat64BE(header, 16);
    if (payload.length < dataLength + 1) return null;
    const flags = payload[0];
    const videoData = payload.subarray(1, 1 + dataLength);
    return {
      type: 'video',
      data: videoData,
      pts,
      dts,
      isKeyFrame: flags === 1
    };
  }

  if (type === TYPE_SUBTITLE) {
    if (data.length < 26) return null;
    const header = data.subarray(1, 25);
    const payload = data.subarray(25);
    const dataLength = Number(readBigUint64BE(header, 0));
    const pts = readFloat64BE(header, 8);
    const duration = readFloat64BE(header, 16);
    if (payload.length < dataLength) return null;
    const textData = payload.subarray(0, dataLength);
    const decoder = new TextDecoder('utf8');
    return {
      type: 'subtitle',
      data: decoder.decode(textData),
      pts,
      duration
    };
  }

  if (type === TYPE_SUBTITLE_RELIABLE) {
    return parseReliableSubtitle(data);
  }

  return null;
}

export function parseReliableSubtitle(data: Uint8Array): ReliableSubtitleChunk | null {
  if (data.length < 33) return null;

  const header = data.subarray(1, 33);
  const payload = data.subarray(33);

  const seq = readUInt32BE(header, 0);
  const dataLength = Number(readBigUint64BE(header, 4));
  const pts = readFloat64BE(header, 12);
  const duration = readFloat64BE(header, 20);

  if (payload.length < dataLength) return null;

  const textData = payload.subarray(0, dataLength);
  const decoder = new TextDecoder('utf8');

  return {
    type: 'subtitle',
    seq,
    data: decoder.decode(textData),
    pts,
    duration
  };
}

export function buildSACK(
  cumulativeAck: number,
  sackBlocks: Array<{ start: number; end: number }>
): Uint8Array {
  const numBlocks = sackBlocks.length;
  const buffer = new ArrayBuffer(1 + 8 + numBlocks * 8);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes[0] = TYPE_SACK;
  view.setUint32(1, cumulativeAck, false);
  view.setUint32(5, numBlocks, false);

  for (let i = 0; i < numBlocks; i++) {
    const offset = 9 + i * 8;
    view.setUint32(offset, sackBlocks[i].start, false);
    view.setUint32(offset + 4, sackBlocks[i].end, false);
  }

  return bytes;
}

export function parseSessionResponse(data: any): SessionInfo {
  return {
    sessionId: data.sessionId,
    videoId: data.videoId,
    supportedTransports: data.supportedTransports || [],
    wsEndpoint: data.wsEndpoint,
    wtEndpoint: data.wtEndpoint
  };
}

export function parseDriftEvent(data: Uint8Array): DriftDetectionResult | null {
  if (data.length < 10) return null;

  const type = data[0];
  if (type !== TYPE_DRIFT) return null;

  const header = data.subarray(1, 9);
  const payload = data.subarray(9);

  const payloadLength = Number(readBigUint64BE(header, 0));
  if (payload.length < payloadLength) return null;

  const jsonData = payload.subarray(0, payloadLength);
  const decoder = new TextDecoder('utf8');

  try {
    const result = JSON.parse(decoder.decode(jsonData));
    return {
      driftMs: result.driftMs,
      confidence: result.confidence,
      audioStartPts: result.audioStartPts,
      subtitleStartPts: result.subtitleStartPts,
      sampleCount: result.sampleCount,
      timestamp: result.timestamp
    };
  } catch (e) {
    console.error('Failed to parse drift event:', e);
    return null;
  }
}
