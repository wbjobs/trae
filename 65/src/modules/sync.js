const { v4: uuidv4 } = require('uuid');

class StateSynchronizer {
  constructor(options = {}) {
    this.state = new Map();
    this.subscribers = new Map();
    this.history = [];
    this.config = {
      maxHistorySize: options.maxHistorySize || 1000,
      syncInterval: options.syncInterval || 100,
      compressionEnabled: options.compressionEnabled !== false
    };
    this.syncTimer = null;
    this.lastSyncTime = 0;
  }

  setState(key, value, options = {}) {
    const oldValue = this.state.get(key);
    const change = {
      id: uuidv4(),
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now(),
      version: options.version || this.generateVersion(),
      source: options.source || 'server',
      priority: options.priority || 'normal'
    };

    this.state.set(key, value);
    this.addToHistory(change);
    this.notifySubscribers(key, change);

    return change;
  }

  getState(key) {
    return this.state.get(key);
  }

  deleteState(key) {
    const oldValue = this.state.get(key);
    if (oldValue === undefined) return false;

    const change = {
      id: uuidv4(),
      key,
      oldValue,
      newValue: null,
      timestamp: Date.now(),
      version: this.generateVersion(),
      action: 'delete'
    };

    this.state.delete(key);
    this.addToHistory(change);
    this.notifySubscribers(key, change);

    return true;
  }

  updateState(key, updates, options = {}) {
    const currentValue = this.state.get(key);
    if (!currentValue) {
      return this.setState(key, updates, options);
    }

    const newValue = { ...currentValue, ...updates };
    return this.setState(key, newValue, options);
  }

  batchState(changes, options = {}) {
    const results = [];
    changes.forEach(change => {
      if (change.action === 'delete') {
        this.deleteState(change.key);
      } else if (change.action === 'update') {
        results.push(this.updateState(change.key, change.value, options));
      } else {
        results.push(this.setState(change.key, change.value, options));
      }
    });
    return results;
  }

  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);

    return () => {
      const subscribers = this.subscribers.get(key);
      if (subscribers) {
        subscribers.delete(callback);
      }
    };
  }

  notifySubscribers(key, change) {
    const subscribers = this.subscribers.get(key);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(change);
        } catch (error) {
          console.error('Subscriber error:', error);
        }
      });
    }

    const wildcardSubscribers = this.subscribers.get('*');
    if (wildcardSubscribers) {
      wildcardSubscribers.forEach(callback => {
        try {
          callback(change);
        } catch (error) {
          console.error('Wildcard subscriber error:', error);
        }
      });
    }
  }

  addToHistory(change) {
    this.history.push(change);
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  getHistory(since = 0, limit = 100) {
    const filtered = this.history.filter(h => h.timestamp >= since);
    return filtered.slice(-limit);
  }

  getChangesSince(version) {
    const index = this.history.findIndex(h => h.version === version);
    return index >= 0 ? this.history.slice(index + 1) : this.history;
  }

  generateVersion() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getFullState() {
    const stateObj = {};
    this.state.forEach((value, key) => {
      stateObj[key] = value;
    });
    return stateObj;
  }

  setFullState(stateObj) {
    this.state.clear();
    Object.keys(stateObj).forEach(key => {
      this.state.set(key, stateObj[key]);
    });
  }

  mergeState(remoteState, options = {}) {
    const conflicts = [];
    const merged = [];

    Object.keys(remoteState).forEach(key => {
      const localValue = this.state.get(key);
      const remoteValue = remoteState[key];

      if (localValue === undefined) {
        this.state.set(key, remoteValue);
        merged.push({ key, value: remoteValue });
      } else if (options.conflictStrategy === 'remote' || 
                 (options.conflictStrategy !== 'local' && 
                  this.compareVersions(remoteValue.version, localValue.version) > 0)) {
        this.state.set(key, remoteValue);
        merged.push({ key, value: remoteValue, replaced: localValue });
      } else if (localValue !== remoteValue) {
        conflicts.push({ key, local: localValue, remote: remoteValue });
      }
    });

    return { merged, conflicts };
  }

  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const t1 = parseInt(v1.split('-')[0], 10);
    const t2 = parseInt(v2.split('-')[0], 10);
    return t1 - t2;
  }

  createSnapshot() {
    return {
      timestamp: Date.now(),
      version: this.generateVersion(),
      state: this.getFullState(),
      checksum: this.calculateChecksum()
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || !snapshot.state) return false;
    this.setFullState(snapshot.state);
    return true;
  }

  calculateChecksum() {
    const stateStr = JSON.stringify(this.getFullState());
    let hash = 0;
    for (let i = 0; i < stateStr.length; i++) {
      const char = stateStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  compressState(state) {
    if (!this.config.compressionEnabled) return state;
    const json = JSON.stringify(state);
    return Buffer.from(json).toString('base64');
  }

  decompressState(compressed) {
    if (!this.config.compressionEnabled) return compressed;
    const json = Buffer.from(compressed, 'base64').toString();
    return JSON.parse(json);
  }

  startAutoSync(callback) {
    this.stopAutoSync();
    this.syncTimer = setInterval(() => {
      const now = Date.now();
      if (now - this.lastSyncTime >= this.config.syncInterval) {
        const delta = this.getHistory(this.lastSyncTime);
        if (delta.length > 0) {
          callback({
            type: 'delta',
            changes: delta,
            timestamp: now
          });
        }
        this.lastSyncTime = now;
      }
    }, this.config.syncInterval);
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  clear() {
    this.state.clear();
    this.subscribers.clear();
    this.history = [];
  }

  hasKey(key) {
    return this.state.has(key);
  }

  getKeys() {
    return Array.from(this.state.keys());
  }

  getSize() {
    return this.state.size;
  }
}

module.exports = StateSynchronizer;
