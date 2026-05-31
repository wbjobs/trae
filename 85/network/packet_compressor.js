const zlib = require('zlib');

class PacketCompressor {
  constructor(options = {}) {
    this.compressionThreshold = options.compressionThreshold || 1024;
    this.compressionLevel = options.compressionLevel || zlib.constants.Z_BEST_SPEED;
    this.compressionStrategy = options.compressionStrategy || zlib.constants.Z_DEFAULT_STRATEGY;
    this.useDictionary = options.useDictionary || false;
    this.dictionary = this.buildDictionary();
    this.compressionStats = {
      totalPackets: 0,
      compressedPackets: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0
    };
  }

  buildDictionary() {
    const commonStrings = [
      'player', 'enemy', 'position', 'x', 'y', 'id', 'name', 'health', 'stealth',
      'move', 'action', 'state', 'delta', 'sync', 'item', 'tile', 'type',
      'visible', 'explored', 'danger', 'event', 'weather', 'time', 'chat',
      'join', 'leave', 'ping', 'pong', 'error', 'success', 'data',
      'standing', 'crouching', 'prone', 'walking', 'running', 'crawling',
      'hidden', 'exposed', 'detected', 'suspicious', 'alert', 'combat',
      'ground', 'wall', 'rubble', 'fog_zone', 'trap', 'building', 'radiation',
      'medkit', 'ammo', 'key', 'gear', 'artifact', 'map_fragment',
      'north', 'south', 'east', 'west', 'up', 'down', 'left', 'right'
    ];
    return Buffer.from(commonStrings.join(','));
  }

  compress(packet) {
    this.compressionStats.totalPackets++;

    let data;
    if (typeof packet === 'string') {
      data = Buffer.from(packet);
    } else if (Buffer.isBuffer(packet)) {
      data = packet;
    } else {
      data = Buffer.from(JSON.stringify(packet));
    }

    this.compressionStats.totalOriginalSize += data.length;

    if (data.length < this.compressionThreshold) {
      return {
        data: data,
        compressed: false,
        originalSize: data.length,
        compressedSize: data.length,
        ratio: 1.0
      };
    }

    try {
      let compressed;
      if (this.useDictionary) {
        compressed = zlib.deflateSync(data, {
          level: this.compressionLevel,
          strategy: this.compressionStrategy,
          dictionary: this.dictionary
        });
      } else {
        compressed = zlib.deflateSync(data, {
          level: this.compressionLevel,
          strategy: this.compressionStrategy
        });
      }

      this.compressionStats.compressedPackets++;
      this.compressionStats.totalCompressedSize += compressed.length;

      const ratio = compressed.length / data.length;

      if (ratio < 0.9) {
        const header = Buffer.alloc(1);
        header.writeUInt8(1, 0);
        const result = Buffer.concat([header, compressed]);

        return {
          data: result,
          compressed: true,
          originalSize: data.length,
          compressedSize: result.length,
          ratio
        };
      }
    } catch (error) {
      console.warn('Compression failed, sending uncompressed:', error.message);
    }

    const header = Buffer.alloc(1);
    header.writeUInt8(0, 0);
    const result = Buffer.concat([header, data]);

    return {
      data: result,
      compressed: false,
      originalSize: data.length,
      compressedSize: result.length,
      ratio: 1.0
    };
  }

  decompress(compressedData) {
    if (!Buffer.isBuffer(compressedData)) {
      compressedData = Buffer.from(compressedData);
    }

    if (compressedData.length < 1) {
      throw new Error('Invalid packet: too short');
    }

    const isCompressed = compressedData.readUInt8(0) === 1;
    const data = compressedData.slice(1);

    if (!isCompressed) {
      return {
        data: data.toString(),
        decompressed: false,
        originalSize: data.length,
        decompressedSize: data.length
      };
    }

    try {
      let decompressed;
      if (this.useDictionary) {
        decompressed = zlib.inflateSync(data, { dictionary: this.dictionary });
      } else {
        decompressed = zlib.inflateSync(data);
      }

      return {
        data: decompressed.toString(),
        decompressed: true,
        originalSize: data.length,
        decompressedSize: decompressed.length
      };
    } catch (error) {
      throw new Error(`Decompression failed: ${error.message}`);
    }
  }

  compressJSON(object) {
    const jsonString = JSON.stringify(object);
    return this.compress(jsonString);
  }

  decompressJSON(compressedData) {
    const result = this.decompress(compressedData);
    return {
      ...result,
      object: JSON.parse(result.data)
    };
  }

  getCompressionStats() {
    const totalRatio = this.compressionStats.totalOriginalSize > 0
      ? this.compressionStats.totalCompressedSize / this.compressionStats.totalOriginalSize
      : 1.0;

    return {
      ...this.compressionStats,
      averageRatio: totalRatio,
      savedBytes: this.compressionStats.totalOriginalSize - this.compressionStats.totalCompressedSize,
      compressionPercentage: Math.round((1 - totalRatio) * 100)
    };
  }

  resetStats() {
    this.compressionStats = {
      totalPackets: 0,
      compressedPackets: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0
    };
  }

  getOptimalCompressionLevel(networkConditions = {}) {
    const { latency = 50, bandwidth = 1000000, packetLoss = 0 } = networkConditions;

    if (latency > 200 || packetLoss > 0.1) {
      return zlib.constants.Z_BEST_SPEED;
    } else if (bandwidth < 100000) {
      return zlib.constants.Z_BEST_COMPRESSION;
    } else if (latency < 50 && bandwidth > 10000000) {
      return zlib.constants.Z_NO_COMPRESSION;
    }
    return zlib.constants.Z_DEFAULT_COMPRESSION;
  }

  setCompressionLevel(level) {
    const validLevels = [
      zlib.constants.Z_NO_COMPRESSION,
      zlib.constants.Z_BEST_SPEED,
      zlib.constants.Z_BEST_COMPRESSION,
      zlib.constants.Z_DEFAULT_COMPRESSION
    ];
    if (validLevels.includes(level)) {
      this.compressionLevel = level;
      return true;
    }
    return false;
  }

  shouldCompress(data) {
    if (typeof data === 'string') {
      return data.length >= this.compressionThreshold;
    } else if (Buffer.isBuffer(data)) {
      return data.length >= this.compressionThreshold;
    }
    return false;
  }

  compressBatch(packets) {
    const results = [];
    for (const packet of packets) {
      results.push(this.compress(packet));
    }
    return results;
  }

  decompressBatch(compressedPackets) {
    const results = [];
    for (const packet of compressedPackets) {
      results.push(this.decompress(packet));
    }
    return results;
  }

  estimateCompressionGain(data) {
    let testData;
    if (typeof data === 'string') {
      testData = Buffer.from(data);
    } else if (Buffer.isBuffer(data)) {
      testData = data;
    } else {
      testData = Buffer.from(JSON.stringify(data));
    }

    if (testData.length < this.compressionThreshold) {
      return {
        shouldCompress: false,
        estimatedRatio: 1.0,
        estimatedSize: testData.length
      };
    }

    const sampleSize = Math.min(testData.length, 1024);
    const sample = testData.slice(0, sampleSize);
    const compressedSample = zlib.deflateSync(sample, { level: this.compressionLevel });
    const sampleRatio = compressedSample.length / sampleSize;

    const estimatedRatio = Math.min(sampleRatio * 1.1, 1.0);
    const estimatedSize = Math.floor(testData.length * estimatedRatio);

    return {
      shouldCompress: estimatedRatio < 0.9,
      estimatedRatio,
      estimatedSize
    };
  }

  createOptimizedPacket(type, payload, options = {}) {
    const packet = {
      t: type,
      ts: Date.now(),
      d: payload
    };

    if (options.sequenceId !== undefined) {
      packet.s = options.sequenceId;
    }
    if (options.ackId !== undefined) {
      packet.a = options.ackId;
    }
    if (options.reliable) {
      packet.r = 1;
    }

    return packet;
  }

  parseOptimizedPacket(packet) {
    return {
      type: packet.t,
      timestamp: packet.ts,
      data: packet.d,
      sequenceId: packet.s,
      ackId: packet.a,
      reliable: packet.r === 1
    };
  }
}

module.exports = PacketCompressor;
