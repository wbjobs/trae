import {
  ReliableSubtitleChunk,
  SubtitleChunk,
  buildSACK
} from './protocol';

const SACK_SEND_INTERVAL_MS = 100;
const MAX_REORDER_BUFFER_SIZE = 100;
const MAX_GAP_SIZE = 10;

export interface ReliableReceiverConfig {
  sendSACK: (data: Uint8Array) => void;
  onDeliverSubtitle: (chunk: SubtitleChunk) => void;
  onStats?: (stats: ReliableReceiverStats) => void;
}

export interface ReliableReceiverStats {
  packetsReceived: number;
  packetsOrdered: number;
  packetsOutOfOrder: number;
  duplicatePackets: number;
  gapsDetected: number;
  sacksSent: number;
  reorderBufferSize: number;
}

interface BufferedPacket {
  seq: number;
  chunk: ReliableSubtitleChunk;
  receivedAt: number;
}

export class ReliableSubtitleReceiver {
  private config: ReliableReceiverConfig;
  private received: Set<number> = new Set();
  private reorderBuffer: Map<number, BufferedPacket> = new Map();
  private nextExpectedSeq: number = 0;
  private sackTimer: number | null = null;
  private lastSackTime: number = 0;
  private closed: boolean = false;

  private stats: ReliableReceiverStats = {
    packetsReceived: 0,
    packetsOrdered: 0,
    packetsOutOfOrder: 0,
    duplicatePackets: 0,
    gapsDetected: 0,
    sacksSent: 0,
    reorderBufferSize: 0
  };

  constructor(config: ReliableReceiverConfig) {
    this.config = config;
    this.startSACKTimer();
  }

  receivePacket(chunk: ReliableSubtitleChunk): void {
    if (this.closed) return;

    const seq = chunk.seq;
    this.stats.packetsReceived++;

    if (this.received.has(seq)) {
      this.stats.duplicatePackets++;
      console.log(`[ReliableReceiver] Duplicate packet seq=${seq}`);
      return;
    }

    this.received.add(seq);

    if (seq === this.nextExpectedSeq) {
      this.stats.packetsOrdered++;
      this.deliverPacket(chunk);
      this.nextExpectedSeq++;
      this.processReorderBuffer();
    } else if (seq > this.nextExpectedSeq) {
      this.stats.packetsOutOfOrder++;
      this.stats.gapsDetected++;
      this.bufferPacket(chunk);
      console.log(
        `[ReliableReceiver] Out-of-order packet: seq=${seq}, expected=${this.nextExpectedSeq}, gap=${seq - this.nextExpectedSeq}`
      );
    }

    if (this.shouldSendSACK()) {
      this.sendSACK();
    }

    this.stats.reorderBufferSize = this.reorderBuffer.size;
    this.reportStats();
  }

  private bufferPacket(chunk: ReliableSubtitleChunk): void {
    this.reorderBuffer.set(chunk.seq, {
      seq: chunk.seq,
      chunk,
      receivedAt: performance.now()
    });

    while (this.reorderBuffer.size > MAX_REORDER_BUFFER_SIZE) {
      let minSeq = Infinity;
      for (const seq of this.reorderBuffer.keys()) {
        if (seq < minSeq) minSeq = seq;
      }

      if (minSeq !== Infinity && minSeq > this.nextExpectedSeq + MAX_GAP_SIZE) {
        console.warn(
          `[ReliableReceiver] Reorder buffer full, skipping gap from ${this.nextExpectedSeq} to ${minSeq - 1}`
        );
        this.nextExpectedSeq = minSeq;
      }

      this.reorderBuffer.delete(minSeq);
    }
  }

  private processReorderBuffer(): void {
    while (this.reorderBuffer.has(this.nextExpectedSeq)) {
      const packet = this.reorderBuffer.get(this.nextExpectedSeq)!;
      this.reorderBuffer.delete(this.nextExpectedSeq);

      this.stats.packetsOrdered++;
      this.deliverPacket(packet.chunk);
      this.nextExpectedSeq++;
    }
  }

  private deliverPacket(chunk: ReliableSubtitleChunk): void {
    const subtitleChunk: SubtitleChunk = {
      type: 'subtitle',
      data: chunk.data,
      pts: chunk.pts,
      duration: chunk.duration
    };

    this.config.onDeliverSubtitle(subtitleChunk);
  }

  private shouldSendSACK(): boolean {
    const now = performance.now();
    return now - this.lastSackTime > SACK_SEND_INTERVAL_MS;
  }

  private startSACKTimer(): void {
    this.sackTimer = window.setInterval(() => {
      if (this.shouldSendSACK()) {
        this.sendSACK();
      }
    }, SACK_SEND_INTERVAL_MS);
  }

  private sendSACK(): void {
    if (this.closed) return;

    const cumulativeAck = this.nextExpectedSeq - 1;

    const sackBlocks: Array<{ start: number; end: number }> = [];

    const receivedSorted = Array.from(this.received)
      .filter((seq) => seq >= this.nextExpectedSeq)
      .sort((a, b) => a - b);

    if (receivedSorted.length > 0) {
      let blockStart = receivedSorted[0];
      let blockEnd = receivedSorted[0];

      for (let i = 1; i < receivedSorted.length; i++) {
        if (receivedSorted[i] === blockEnd + 1) {
          blockEnd = receivedSorted[i];
        } else {
          sackBlocks.push({ start: blockStart, end: blockEnd });
          blockStart = receivedSorted[i];
          blockEnd = receivedSorted[i];
        }
      }

      sackBlocks.push({ start: blockStart, end: blockEnd });
    }

    const sack = buildSACK(cumulativeAck, sackBlocks.slice(0, 10));

    this.config.sendSACK(sack);
    this.stats.sacksSent++;
    this.lastSackTime = performance.now();

    console.log(
      `[ReliableReceiver] Sent SACK: cumulativeAck=${cumulativeAck}, blocks=${sackBlocks.length}`
    );
  }

  private reportStats(): void {
    if (this.config.onStats) {
      this.config.onStats({ ...this.stats });
    }
  }

  getStats(): ReliableReceiverStats {
    return { ...this.stats };
  }

  getNextExpectedSeq(): number {
    return this.nextExpectedSeq;
  }

  getReorderBufferSize(): number {
    return this.reorderBuffer.size;
  }

  reset(): void {
    this.received.clear();
    this.reorderBuffer.clear();
    this.nextExpectedSeq = 0;
    this.stats = {
      packetsReceived: 0,
      packetsOrdered: 0,
      packetsOutOfOrder: 0,
      duplicatePackets: 0,
      gapsDetected: 0,
      sacksSent: 0,
      reorderBufferSize: 0
    };
  }

  close(): void {
    this.closed = true;
    if (this.sackTimer !== null) {
      clearInterval(this.sackTimer);
      this.sackTimer = null;
    }
    console.log('[ReliableReceiver] Closed');
  }
}
