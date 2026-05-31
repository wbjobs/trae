const EventEmitter = require('events');
const RingBuffer = require('./RingBuffer');

class BatchProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.bufferCapacity = options.bufferCapacity || 50000;
    this.batchSize = options.batchSize || 500;
    this.flushIntervalMs = options.flushIntervalMs || 100;
    this.maxBatchDelayMs = options.maxBatchDelayMs || 500;
    this.backpressureThreshold = options.backpressureThreshold || 0.8;
    this.stalenessThresholdMs = options.stalenessThresholdMs || 5000;
    
    this.dataBuffer = new RingBuffer(this.bufferCapacity);
    this.alertBuffer = new RingBuffer(10000);
    this.wsBuffer = new RingBuffer(20000);
    
    this.flushTimer = null;
    this.isProcessing = false;
    this.isRunning = false;
    this.lastFlushTime = 0;
    this.isBackpressured = false;
    
    this.stats = {
      totalProcessed: 0,
      totalBatches: 0,
      totalDropped: 0,
      totalStaleDropped: 0,
      avgBatchSize: 0,
      avgProcessingTimeMs: 0,
      totalProcessingTimeMs: 0,
      backpressureEvents: 0
    };
    
    this.dataBuffer.on('overflow', (item) => {
      this.stats.totalDropped++;
      this.emit('data_dropped', item);
    });
    
    this.dataBuffer.on('data_available', () => {
      if (!this.isProcessing && this.isRunning) {
        this.scheduleFlush();
      }
    });
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.scheduleFlush();
    console.log(`[BatchProcessor] Started - buffer: ${this.bufferCapacity}, batchSize: ${this.batchSize}, flushInterval: ${this.flushIntervalMs}ms`);
  }

  stop() {
    this.isRunning = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushAll();
    console.log('[BatchProcessor] Stopped');
  }

  write(data) {
    const result = this.dataBuffer.write(data);
    
    const usage = this.dataBuffer.getUsage() / 100;
    if (usage >= this.backpressureThreshold && !this.isBackpressured) {
      this.isBackpressured = true;
      this.stats.backpressureEvents++;
      this.emit('backpressure_start', { usage, capacity: this.bufferCapacity });
      console.warn(`[BatchProcessor] Backpressure started - buffer usage: ${(usage * 100).toFixed(1)}%`);
    } else if (usage < this.backpressureThreshold * 0.5 && this.isBackpressured) {
      this.isBackpressured = false;
      this.emit('backpressure_end', { usage });
      console.log(`[BatchProcessor] Backpressure ended - buffer usage: ${(usage * 100).toFixed(1)}%`);
    }
    
    return result;
  }

  scheduleFlush() {
    if (!this.isRunning || this.isProcessing || this.flushTimer) return;
    
    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    
    if (this.dataBuffer.size >= this.batchSize || timeSinceLastFlush >= this.maxBatchDelayMs) {
      setImmediate(() => this.processBatch());
    } else {
      const delay = Math.min(this.flushIntervalMs, this.maxBatchDelayMs - timeSinceLastFlush);
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.processBatch();
      }, Math.max(0, delay));
    }
  }

  async processBatch() {
    if (this.isProcessing || !this.isRunning || this.dataBuffer.isEmpty()) {
      this.scheduleFlush();
      return;
    }
    
    this.isProcessing = true;
    const startTime = Date.now();
    
    try {
      const batch = this.dataBuffer.readMany(this.batchSize);
      
      if (batch.length === 0) {
        this.isProcessing = false;
        this.scheduleFlush();
        return;
      }
      
      const validBatch = this.filterStaleData(batch);
      
      if (validBatch.length > 0) {
        await this.processDataBatch(validBatch);
        this.processAlertBatch(validBatch);
        this.processWebSocketBatch(validBatch);
        
        this.stats.totalProcessed += validBatch.length;
        this.stats.totalBatches++;
        this.stats.avgBatchSize = (this.stats.avgBatchSize * (this.stats.totalBatches - 1) + validBatch.length) / this.stats.totalBatches;
        
        this.emit('batch_processed', {
          size: validBatch.length,
          staleDropped: batch.length - validBatch.length,
          processingTimeMs: Date.now() - startTime
        });
      }
      
      const processingTime = Date.now() - startTime;
      this.stats.totalProcessingTimeMs += processingTime;
      this.stats.avgProcessingTimeMs = this.stats.totalProcessingTimeMs / this.stats.totalBatches;
      
    } catch (error) {
      console.error('[BatchProcessor] Batch processing error:', error);
      this.emit('error', error);
    } finally {
      this.lastFlushTime = Date.now();
      this.isProcessing = false;
      this.scheduleFlush();
    }
  }

  filterStaleData(batch) {
    const now = Date.now();
    const valid = [];
    
    for (const item of batch) {
      const dataAge = now - new Date(item.timestamp).getTime();
      if (dataAge <= this.stalenessThresholdMs) {
        valid.push(item);
      } else {
        this.stats.totalStaleDropped++;
      }
    }
    
    if (valid.length !== batch.length) {
      this.emit('stale_data_dropped', {
        total: batch.length,
        dropped: batch.length - valid.length,
        thresholdMs: this.stalenessThresholdMs
      });
    }
    
    return valid;
  }

  async processDataBatch(batch) {
    this.emit('data_batch', batch);
  }

  processAlertBatch(batch) {
    this.emit('alert_batch', batch);
  }

  processWebSocketBatch(batch) {
    const latestByKey = new Map();
    
    for (const item of batch) {
      const key = `${item.plcId}:${item.tagName}`;
      const existing = latestByKey.get(key);
      if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
        latestByKey.set(key, item);
      }
    }
    
    const latestValues = Array.from(latestByKey.values());
    if (latestValues.length > 0) {
      this.emit('websocket_batch', latestValues);
    }
  }

  async flushAll() {
    if (this.dataBuffer.isEmpty()) return;
    
    console.log(`[BatchProcessor] Flushing remaining ${this.dataBuffer.size} items...`);
    
    while (!this.dataBuffer.isEmpty()) {
      const batch = this.dataBuffer.readMany(this.batchSize);
      if (batch.length > 0) {
        const validBatch = this.filterStaleData(batch);
        if (validBatch.length > 0) {
          await this.processDataBatch(validBatch);
        }
      }
    }
    
    console.log('[BatchProcessor] Flush complete');
  }

  getStats() {
    return {
      ...this.stats,
      buffer: this.dataBuffer.getStats(),
      isBackpressured: this.isBackpressured,
      isRunning: this.isRunning,
      isProcessing: this.isProcessing
    };
  }

  resetStats() {
    this.stats = {
      totalProcessed: 0,
      totalBatches: 0,
      totalDropped: 0,
      totalStaleDropped: 0,
      avgBatchSize: 0,
      avgProcessingTimeMs: 0,
      totalProcessingTimeMs: 0,
      backpressureEvents: 0
    };
    this.dataBuffer.resetStats();
  }

  getBufferSize() {
    return this.dataBuffer.size;
  }

  getBufferUsage() {
    return this.dataBuffer.getUsage();
  }
}

module.exports = BatchProcessor;
