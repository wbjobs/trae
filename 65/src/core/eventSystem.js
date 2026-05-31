const { v4: uuidv4 } = require('uuid');

class EventSystem {
  constructor(options = {}) {
    this.events = [];
    this.listeners = new Map();
    this.maxHistorySize = options.maxHistorySize || 10000;
    this.enabled = options.enabled !== false;
  }

  emit(type, data = {}) {
    if (!this.enabled) return null;
    const event = {
      id: uuidv4(),
      type,
      data,
      timestamp: Date.now()
    };
    this.events.push(event);
    if (this.events.length > this.maxHistorySize) {
      this.events.shift();
    }
    this.notifyListeners(event);
    return event;
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.off(type, callback);
  }

  off(type, callback) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  once(type, callback) {
    const wrapper = (event) => {
      callback(event);
      this.off(type, wrapper);
    };
    return this.on(type, wrapper);
  }

  notifyListeners(event) {
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('事件监听器错误:', error);
        }
      });
    }
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('通配符监听器错误:', error);
        }
      });
    }
  }

  getEvents(filter = {}) {
    let filtered = [...this.events];
    if (filter.type) {
      filtered = filtered.filter(e => e.type === filter.type);
    }
    if (filter.since) {
      filtered = filtered.filter(e => e.timestamp >= filter.since);
    }
    if (filter.until) {
      filtered = filtered.filter(e => e.timestamp <= filter.until);
    }
    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }
    return filtered;
  }

  getRecentEvents(limit = 50) {
    return this.events.slice(-limit);
  }

  getEventsByType(type, limit = 100) {
    return this.getEvents({ type, limit });
  }

  clearEvents() {
    this.events = [];
  }

  removeListener(type, callback) {
    this.off(type, callback);
  }

  removeAllListeners(type) {
    if (type) {
      this.listeners.delete(type);
    } else {
      this.listeners.clear();
    }
  }

  getEventCount() {
    return this.events.length;
  }

  getListenerCount(type) {
    if (type) {
      const listeners = this.listeners.get(type);
      return listeners ? listeners.size : 0;
    }
    let count = 0;
    this.listeners.forEach(set => count += set.size);
    return count;
  }

  getStats() {
    const typeCounts = {};
    this.events.forEach(e => {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    });
    return {
      totalEvents: this.events.length,
      totalListeners: this.getListenerCount(),
      typeCounts,
      uniqueTypes: Object.keys(typeCounts).length
    };
  }

  exportEvents(filter = {}) {
    return this.getEvents(filter);
  }

  importEvents(events) {
    this.events = [...this.events, ...events];
    if (this.events.length > this.maxHistorySize) {
      this.events = this.events.slice(-this.maxHistorySize);
    }
  }

  pipeTo(targetSystem) {
    return this.on('*', (event) => {
      targetSystem.emit(event.type, { ...event.data, forwarded: true });
    });
  }
}

module.exports = EventSystem;
