class NetworkDebouncer {
  constructor(options = {}) {
    this.pendingUpdates = new Map();
    this.flushTimers = new Map();
    this.config = {
      defaultDebounceTime: options.defaultDebounceTime || 50,
      maxBatchSize: options.maxBatchSize || 50,
      maxWaitTime: options.maxWaitTime || 200,
      enabled: options.enabled !== false
    };
    this.stats = {
      totalUpdates: 0,
      batchedUpdates: 0,
      savedPackets: 0
    };
  }

  debounce(key, data, flushCallback, options = {}) {
    if (!this.config.enabled) {
      flushCallback([data]);
      return;
    }
    const debounceTime = options.debounceTime || this.config.defaultDebounceTime;
    const maxWaitTime = options.maxWaitTime || this.config.maxWaitTime;
    if (!this.pendingUpdates.has(key)) {
      this.pendingUpdates.set(key, {
        data: [],
        firstUpdateTime: Date.now(),
        flushCallback
      });
    }
    const pending = this.pendingUpdates.get(key);
    pending.data.push(data);
    this.stats.totalUpdates++;
    if (pending.data.length >= this.config.maxBatchSize) {
      this.flush(key);
      return;
    }
    const now = Date.now();
    if (now - pending.firstUpdateTime >= maxWaitTime) {
      this.flush(key);
      return;
    }
    if (this.flushTimers.has(key)) {
      clearTimeout(this.flushTimers.get(key));
    }
    const timer = setTimeout(() => {
      this.flush(key);
    }, debounceTime);
    this.flushTimers.set(key, timer);
  }

  flush(key) {
    const pending = this.pendingUpdates.get(key);
    const timer = this.flushTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(key);
    }
    if (!pending || pending.data.length === 0) {
      this.pendingUpdates.delete(key);
      return;
    }
    const batchSize = pending.data.length;
    pending.flushCallback(pending.data);
    this.stats.batchedUpdates += batchSize;
    this.stats.savedPackets += (batchSize - 1);
    this.pendingUpdates.delete(key);
  }

  flushAll() {
    this.pendingUpdates.forEach((_, key) => {
      this.flush(key);
    });
  }

  clear(key) {
    if (this.pendingUpdates.has(key)) {
      this.pendingUpdates.delete(key);
    }
    if (this.flushTimers.has(key)) {
      clearTimeout(this.flushTimers.get(key));
      this.flushTimers.delete(key);
    }
  }

  clearAll() {
    this.flushTimers.forEach(timer => clearTimeout(timer));
    this.pendingUpdates.clear();
    this.flushTimers.clear();
  }

  isPending(key) {
    return this.pendingUpdates.has(key) && this.pendingUpdates.get(key).data.length > 0;
  }

  getPendingCount(key) {
    const pending = this.pendingUpdates.get(key);
    return pending ? pending.data.length : 0;
  }

  getStats() {
    return {
      ...this.stats,
      pendingKeys: this.pendingUpdates.size,
      efficiency: this.stats.totalUpdates > 0 
        ? ((this.stats.savedPackets / this.stats.totalUpdates) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  resetStats() {
    this.stats = {
      totalUpdates: 0,
      batchedUpdates: 0,
      savedPackets: 0
    };
  }
}

class StateThrottler {
  constructor(options = {}) {
    this.lastSent = new Map();
    this.lastValues = new Map();
    this.config = {
      defaultThrottleTime: options.defaultThrottleTime || 100,
      enabled: options.enabled !== false
    };
  }

  throttle(key, value, sendCallback, options = {}) {
    if (!this.config.enabled) {
      sendCallback(value);
      return true;
    }
    const throttleTime = options.throttleTime || this.config.defaultThrottleTime;
    const now = Date.now();
    const lastSentTime = this.lastSent.get(key) || 0;
    if (now - lastSentTime < throttleTime) {
      this.lastValues.set(key, { value, sendCallback, options, scheduled: true });
      if (!this.scheduleTimer) {
        this.scheduleNextSend();
      }
      return false;
    }
    this.send(key, value, sendCallback);
    return true;
  }

  send(key, value, sendCallback) {
    sendCallback(value);
    this.lastSent.set(key, Date.now());
    this.lastValues.delete(key);
  }

  scheduleNextSend() {
    if (this.scheduleTimer) return;
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null;
      const now = Date.now();
      const toSend = [];
      this.lastValues.forEach((entry, key) => {
        const lastSent = this.lastSent.get(key) || 0;
        const throttleTime = entry.options?.throttleTime || this.config.defaultThrottleTime;
        if (now - lastSent >= throttleTime) {
          toSend.push({ key, ...entry });
        }
      });
      toSend.forEach(({ key, value, sendCallback }) => {
        this.send(key, value, sendCallback);
      });
      if (this.lastValues.size > 0) {
        this.scheduleNextSend();
      }
    }, 16);
  }

  forceSend(key, value, sendCallback) {
    this.send(key, value, sendCallback);
  }

  flushAll() {
    this.lastValues.forEach((entry, key) => {
      this.send(key, entry.value, entry.sendCallback);
    });
    this.lastValues.clear();
  }

  clear(key) {
    this.lastSent.delete(key);
    this.lastValues.delete(key);
  }

  clearAll() {
    this.lastSent.clear();
    this.lastValues.clear();
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  getLastSentTime(key) {
    return this.lastSent.get(key) || 0;
  }
}

class PacketMerger {
  constructor(options = {}) {
    this.packets = new Map();
    this.flushInterval = options.flushInterval || 16;
    this.maxPacketsPerFlush = options.maxPacketsPerFlush || 100;
    this.enabled = options.enabled !== false;
    this.flushTimer = null;
  }

  addPacket(roomId, type, data) {
    if (!this.enabled) {
      return { type, data };
    }
    if (!this.packets.has(roomId)) {
      this.packets.set(roomId, []);
    }
    const roomPackets = this.packets.get(roomId);
    roomPackets.push({ type, data, timestamp: Date.now() });
    if (!this.flushTimer) {
      this.startFlushTimer();
    }
    return null;
  }

  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushAll();
    }, this.flushInterval);
  }

  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  flush(roomId) {
    const packets = this.packets.get(roomId);
    if (!packets || packets.length === 0) {
      return null;
    }
    const merged = {
      type: 'batch',
      count: packets.length,
      packets: packets.slice(0, this.maxPacketsPerFlush)
    };
    if (packets.length > this.maxPacketsPerFlush) {
      this.packets.set(roomId, packets.slice(this.maxPacketsPerFlush));
    } else {
      this.packets.delete(roomId);
    }
    return merged;
  }

  flushAll() {
    const results = [];
    this.packets.forEach((_, roomId) => {
      const merged = this.flush(roomId);
      if (merged) {
        results.push({ roomId, merged });
      }
    });
    if (this.packets.size === 0) {
      this.stopFlushTimer();
    }
    return results;
  }

  clear(roomId) {
    this.packets.delete(roomId);
  }

  clearAll() {
    this.packets.clear();
    this.stopFlushTimer();
  }

  getPendingCount(roomId) {
    const packets = this.packets.get(roomId);
    return packets ? packets.length : 0;
  }

  getTotalPending() {
    let total = 0;
    this.packets.forEach(p => total += p.length);
    return total;
  }
}

module.exports = { NetworkDebouncer, StateThrottler, PacketMerger };
