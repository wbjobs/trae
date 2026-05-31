import { SubtitleChunk } from './streamer';

const TYPE_SUBTITLE_RELIABLE = 0x03;
const TYPE_SACK = 0x04;

const RETRANSMIT_TIMEOUT_MS = 200;
const MAX_RETRANSMIT_ATTEMPTS = 5;
const SACK_INTERVAL_MS = 50;

interface InFlightPacket {
  seq: number;
  chunk: SubtitleChunk;
  serialized: Buffer;
  sentAt: number;
  retransmitCount: number;
}

interface SACKInfo {
  cumulativeAck: number;
  sackBlocks: Array<{ start: number; end: number }>;
}

export interface ReliableTransportConfig {
  sessionId: string;
  sendRaw: (data: Buffer) => void;
  onDeliverSubtitle: (chunk: SubtitleChunk) => void;
  onStats?: (stats: ReliableTransportStats) => void;
}

export interface ReliableTransportStats {
  packetsSent: number;
  packetsRetransmitted: number;
  packetsLost: number;
  sacksReceived: number;
  inFlightCount: number;
  retransmitQueueSize: number;
}

export class ReliableSubtitleTransport {
  private config: ReliableTransportConfig;
  private nextSeq: number = 0;
  private inFlight: Map<number, InFlightPacket> = new Map();
  private retransmitTimer: NodeJS.Timeout | null = null;
  private closed: boolean = false;

  private stats: ReliableTransportStats = {
    packetsSent: 0,
    packetsRetransmitted: 0,
    packetsLost: 0,
    sacksReceived: 0,
    inFlightCount: 0,
    retransmitQueueSize: 0
  };

  constructor(config: ReliableTransportConfig) {
    this.config = config;
    this.startRetransmitTimer();
  }

  sendSubtitle(chunk: SubtitleChunk): void {
    if (this.closed) return;

    const seq = this.nextSeq++;
    const serialized = this.serializeReliableSubtitle(seq, chunk);

    const packet: InFlightPacket = {
      seq,
      chunk,
      serialized,
      sentAt: Date.now(),
      retransmitCount: 0
    };

    this.inFlight.set(seq, packet);
    this.stats.packetsSent++;
    this.stats.inFlightCount = this.inFlight.size;

    console.log(
      `[ReliableTransport] Sending subtitle seq=${seq}, pts=${chunk.pts.toFixed(2)}s`
    );

    this.config.sendRaw(serialized);
    this.reportStats();
  }

  private serializeReliableSubtitle(seq: number, chunk: SubtitleChunk): Buffer {
    const textBuffer = Buffer.from(chunk.data, 'utf8');
    const header = Buffer.alloc(32);
    header.writeUInt32BE(seq, 0);
    header.writeBigUint64BE(BigInt(textBuffer.length), 4);
    header.writeDoubleBE(chunk.pts, 12);
    header.writeDoubleBE(chunk.duration, 20);

    return Buffer.concat([Buffer.from([TYPE_SUBTITLE_RELIABLE]), header, textBuffer]);
  }

  processSACK(data: Buffer): void {
    if (this.closed) return;

    const sack = this.parseSACK(data);
    if (!sack) {
      console.warn('[ReliableTransport] Failed to parse SACK');
      return;
    }

    this.stats.sacksReceived++;

    console.log(
      `[ReliableTransport] Received SACK: cumulativeAck=${sack.cumulativeAck}, blocks=${sack.sackBlocks.length}`
    );

    const ackedSeqs = new Set<number>();

    for (let seq = 0; seq <= sack.cumulativeAck; seq++) {
      ackedSeqs.add(seq);
    }

    for (const block of sack.sackBlocks) {
      for (let seq = block.start; seq <= block.end; seq++) {
        ackedSeqs.add(seq);
      }
    }

    for (const seq of ackedSeqs) {
      if (this.inFlight.has(seq)) {
        this.inFlight.delete(seq);
      }
    }

    this.stats.inFlightCount = this.inFlight.size;
    this.reportStats();
  }

  private parseSACK(data: Buffer): SACKInfo | null {
    if (data.length < 8) return null;

    const cumulativeAck = data.readUInt32BE(0);
    const numBlocks = data.readUInt32BE(4);

    if (data.length < 8 + numBlocks * 8) return null;

    const sackBlocks: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < numBlocks; i++) {
      const offset = 8 + i * 8;
      const start = data.readUInt32BE(offset);
      const end = data.readUInt32BE(offset + 4);
      sackBlocks.push({ start, end });
    }

    return { cumulativeAck, sackBlocks };
  }

  private startRetransmitTimer(): void {
    this.retransmitTimer = setInterval(() => {
      this.checkRetransmit();
    }, SACK_INTERVAL_MS);
  }

  private checkRetransmit(): void {
    if (this.closed) return;

    const now = Date.now();
    const toRetransmit: InFlightPacket[] = [];

    for (const packet of this.inFlight.values()) {
      const timeSinceSent = now - packet.sentAt;
      const timeout = RETRANSMIT_TIMEOUT_MS * Math.pow(1.5, packet.retransmitCount);

      if (timeSinceSent > timeout) {
        if (packet.retransmitCount >= MAX_RETRANSMIT_ATTEMPTS) {
          console.warn(
            `[ReliableTransport] Packet seq=${packet.seq} exceeded max retransmit attempts, dropping`
          );
          this.inFlight.delete(packet.seq);
          this.stats.packetsLost++;
          continue;
        }

        toRetransmit.push(packet);
      }
    }

    for (const packet of toRetransmit) {
      packet.retransmitCount++;
      packet.sentAt = now;

      console.log(
        `[ReliableTransport] Retransmitting seq=${packet.seq}, attempt=${packet.retransmitCount}`
      );

      this.stats.packetsRetransmitted++;
      this.config.sendRaw(packet.serialized);
    }

    if (toRetransmit.length > 0) {
      this.stats.retransmitQueueSize = toRetransmit.length;
      this.reportStats();
    }
  }

  private reportStats(): void {
    if (this.config.onStats) {
      this.config.onStats({ ...this.stats });
    }
  }

  getStats(): ReliableTransportStats {
    return { ...this.stats };
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }

  close(): void {
    this.closed = true;
    if (this.retransmitTimer) {
      clearInterval(this.retransmitTimer);
      this.retransmitTimer = null;
    }
    this.inFlight.clear();
    console.log('[ReliableTransport] Closed');
  }

  static parseIncomingSACK(data: Buffer): Buffer | null {
    if (data.length < 1) return null;
    const type = data[0];
    if (type === TYPE_SACK) {
      return data.subarray(1);
    }
    return null;
  }
}
