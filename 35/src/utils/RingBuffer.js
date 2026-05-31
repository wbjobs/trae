const EventEmitter = require('events');

class RingBuffer extends EventEmitter {
  constructor(capacity = 10000) {
    super();
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.droppedCount = 0;
    this.totalWritten = 0;
    this.totalRead = 0;
    this.maxLatency = 0;
    this.totalLatency = 0;
    this.latencyCount = 0;
  }

  write(item) {
    const writeTime = Date.now();
    const timestampedItem = {
      ...item,
      _writeTime: writeTime
    };

    if (this.size >= this.capacity) {
      this.droppedCount++;
      this.buffer[this.head] = timestampedItem;
      this.head = (this.head + 1) % this.capacity;
      this.tail = (this.tail + 1) % this.capacity;
      this.emit('overflow', item);
      return false;
    }

    this.buffer[this.tail] = timestampedItem;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
    this.totalWritten++;

    if (this.size === 1) {
      this.emit('data_available');
    }

    return true;
  }

  writeMany(items) {
    let successCount = 0;
    for (const item of items) {
      if (this.write(item)) {
        successCount++;
      }
    }
    return successCount;
  }

  read() {
    if (this.size === 0) {
      return null;
    }

    const item = this.buffer[this.head];
    this.buffer[this.head] = null;
    this.head = (this.head + 1) % this.capacity;
    this.size--;
    this.totalRead++;

    const latency = Date.now() - item._writeTime;
    this.totalLatency += latency;
    this.latencyCount++;
    if (latency > this.maxLatency) {
      this.maxLatency = latency;
    }

    delete item._writeTime;
    return item;
  }

  readMany(maxCount) {
    const count = Math.min(maxCount, this.size);
    if (count === 0) {
      return [];
    }

    const items = [];
    for (let i = 0; i < count; i++) {
      const item = this.read();
      if (item) {
        items.push(item);
      }
    }
    return items;
  }

  peek() {
    if (this.size === 0) {
      return null;
    }
    return this.buffer[this.head];
  }

  isEmpty() {
    return this.size === 0;
  }

  isFull() {
    return this.size >= this.capacity;
  }

  getUsage() {
    return (this.size / this.capacity) * 100;
  }

  getAverageLatency() {
    if (this.latencyCount === 0) return 0;
    return this.totalLatency / this.latencyCount;
  }

  getStats() {
    return {
      capacity: this.capacity,
      size: this.size,
      usage: this.getUsage().toFixed(2) + '%',
      totalWritten: this.totalWritten,
      totalRead: this.totalRead,
      droppedCount: this.droppedCount,
      averageLatencyMs: this.getAverageLatency().toFixed(2),
      maxLatencyMs: this.maxLatency,
      isEmpty: this.isEmpty(),
      isFull: this.isFull()
    };
  }

  resetStats() {
    this.droppedCount = 0;
    this.totalWritten = 0;
    this.totalRead = 0;
    this.maxLatency = 0;
    this.totalLatency = 0;
    this.latencyCount = 0;
  }

  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.buffer.fill(null);
    this.resetStats();
    this.emit('cleared');
  }

  drain() {
    const items = this.readMany(this.size);
    return items;
  }

  forEach(callback) {
    let index = this.head;
    for (let i = 0; i < this.size; i++) {
      callback(this.buffer[index], i);
      index = (index + 1) % this.capacity;
    }
  }

  toArray() {
    const result = [];
    this.forEach(item => result.push(item));
    return result;
  }
}

module.exports = RingBuffer;
