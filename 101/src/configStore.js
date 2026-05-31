const crypto = require('crypto');
const MerkleDAG = require('./merkleDAG');

const MERGE_LWW = 'LWW';
const MERGE_CRDT = 'CRDT';

class ConfigStore {
  constructor(options = {}) {
    this.mergeStrategy = options.mergeStrategy || MERGE_LWW;
    this.nodeId = options.nodeId || 'local';
    this.storePath = options.storePath || null;

    this.data = {};
    this.metadata = {};
    this.history = [];

    this.dag = new MerkleDAG();

    this.listeners = new Set();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event, payload) {
    for (const fn of this.listeners) {
      try {
        fn(event, payload);
      } catch (err) {
        console.error('[configStore] listener error:', err);
      }
    }
  }

  getSnapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  getHistory() {
    return JSON.parse(JSON.stringify(this.history));
  }

  getKeys() {
    return Object.keys(this.data);
  }

  getDAG() {
    return this.dag;
  }

  getDAGChain() {
    return this.dag.getChain();
  }

  getDAGHead() {
    return this.dag.getHead();
  }

  getDAGHeadHash() {
    return this.dag.getHeadHash();
  }

  verifyDAG() {
    return this.dag.verify();
  }

  set(key, value, opts = {}) {
    const timestamp = opts.timestamp || Date.now();
    const author = opts.author || this.nodeId;
    const version = opts.version || crypto.randomBytes(8).toString('hex');

    const existing = this.data[key];
    const existingMeta = this.metadata[key];

    const fieldEntry = {
      value: value,
      timestamp,
      author,
      version,
    };

    if (existingMeta && existingMeta.timestamp > timestamp) {
      return { applied: false, reason: 'stale' };
    }

    this.data[key] = value;
    this.metadata[key] = fieldEntry;

    const action = existing === undefined ? 'create' : 'update';

    const dagNode = this.dag.append({
      key,
      value,
      timestamp,
      author,
      version,
      action,
    });

    this.history.unshift({
      key,
      value,
      timestamp,
      author,
      version,
      action,
      hash: dagNode.hash,
      prevHash: dagNode.prevHash,
      dagIndex: dagNode.index,
    });
    if (this.history.length > 200) this.history.length = 200;

    this.emit('update', { key, value, timestamp, author, version, hash: dagNode.hash, dagIndex: dagNode.index });
    return { applied: true, entry: fieldEntry, dagNode };
  }

  delete(key, opts = {}) {
    const timestamp = opts.timestamp || Date.now();
    const author = opts.author || this.nodeId;

    if (!(key in this.data)) {
      return { applied: false };
    }

    const dagNode = this.dag.append({
      key,
      value: null,
      timestamp,
      author,
      version: 'delete',
      action: 'delete',
    });

    delete this.data[key];
    delete this.metadata[key];

    this.history.unshift({
      key,
      timestamp,
      author,
      action: 'delete',
      hash: dagNode.hash,
      prevHash: dagNode.prevHash,
      dagIndex: dagNode.index,
    });
    if (this.history.length > 200) this.history.length = 200;

    this.emit('delete', { key, timestamp, author, hash: dagNode.hash, dagIndex: dagNode.index });
    return { applied: true, dagNode };
  }

  applyRemote(entry) {
    if (!entry || typeof entry.key === 'undefined') return { applied: false, reason: 'invalid' };
    if (entry.action === 'delete') {
      return this.delete(entry.key, { timestamp: entry.timestamp, author: entry.author });
    }
    return this.set(entry.key, entry.value, {
      timestamp: entry.timestamp,
      author: entry.author,
      version: entry.version,
    });
  }

  mergeRemoteSnapshot(remoteData, remoteMeta, remoteAuthor) {
    let changed = 0;
    for (const key of Object.keys(remoteData)) {
      const remoteMetaEntry = (remoteMeta && remoteMeta[key]) || {
        timestamp: Date.now(),
        author: remoteAuthor,
        version: 'remote',
      };
      const localMeta = this.metadata[key];
      if (this.mergeStrategy === MERGE_LWW) {
        if (!localMeta || localMeta.timestamp <= remoteMetaEntry.timestamp) {
          const res = this.set(key, remoteData[key], remoteMetaEntry);
          if (res.applied) changed++;
        }
      } else {
        if (!localMeta || localMeta.timestamp < remoteMetaEntry.timestamp) {
          const res = this.set(key, remoteData[key], remoteMetaEntry);
          if (res.applied) changed++;
        }
      }
    }
    return { changed };
  }

  exportFull() {
    return {
      data: JSON.parse(JSON.stringify(this.data)),
      metadata: JSON.parse(JSON.stringify(this.metadata)),
      dagChain: this.dag.getChain(),
      dagHeadHash: this.dag.getHeadHash(),
      dagSize: this.dag.size(),
    };
  }

  importFull(snapshot, remoteAuthor) {
    if (snapshot.dagChain && snapshot.dagChain.length > 0) {
      const verifyResult = this.dag.verifyRemoteChain(snapshot.dagChain);
      if (!verifyResult.valid) {
        console.warn('[configStore] remote DAG verification failed:', verifyResult.error);
        return this.mergeRemoteSnapshot(snapshot.data, snapshot.metadata, remoteAuthor);
      }
      const importResult = this.dag.importChain(snapshot.dagChain);
      if (importResult.imported > 0) {
        console.log(`[configStore] imported ${importResult.imported} DAG nodes from remote`);
      }

      let changed = 0;
      for (const key of Object.keys(snapshot.data || {})) {
        const remoteMetaEntry = (snapshot.metadata && snapshot.metadata[key]) || {
          timestamp: Date.now(),
          author: remoteAuthor,
          version: 'remote',
        };
        const localMeta = this.metadata[key];
        if (this.mergeStrategy === MERGE_LWW) {
          if (!localMeta || localMeta.timestamp <= remoteMetaEntry.timestamp) {
            if (this._setDataInternal(key, snapshot.data[key], remoteMetaEntry)) {
              changed++;
            }
          }
        } else {
          if (!localMeta || localMeta.timestamp < remoteMetaEntry.timestamp) {
            if (this._setDataInternal(key, snapshot.data[key], remoteMetaEntry)) {
              changed++;
            }
          }
        }
      }
      return { changed, dagImported: importResult.imported };
    }
    return this.mergeRemoteSnapshot(snapshot.data, snapshot.metadata, remoteAuthor);
  }

  _setDataInternal(key, value, meta) {
    const timestamp = meta.timestamp || Date.now();
    const author = meta.author || this.nodeId;
    const version = meta.version || 'remote';
    const existing = this.data[key];
    const existingMeta = this.metadata[key];

    if (existingMeta && existingMeta.timestamp > timestamp) {
      return false;
    }

    this.data[key] = value;
    this.metadata[key] = {
      value,
      timestamp,
      author,
      version,
    };

    this.history.unshift({
      key,
      value,
      timestamp,
      author,
      version,
      action: existing === undefined ? 'create' : 'update',
    });
    if (this.history.length > 200) this.history.length = 200;

    return true;
  }

  verifyRemoteDAGChain(remoteChain) {
    return this.dag.verifyRemoteChain(remoteChain);
  }

  importDAGChain(remoteChain) {
    return this.dag.importChain(remoteChain);
  }
}

ConfigStore.MERGE_LWW = MERGE_LWW;
ConfigStore.MERGE_CRDT = MERGE_CRDT;

module.exports = ConfigStore;
