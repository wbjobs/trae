const { createLibp2p } = require('libp2p');
const { tcp } = require('@libp2p/tcp');
const { webSockets } = require('@libp2p/websockets');
const { noise } = require('@chainsafe/libp2p-noise');
const { yamux } = require('@chainsafe/libp2p-yamux');
const { identify } = require('@libp2p/identify');
const { kadDHT } = require('@libp2p/kad-dht');
const { gossipsub } = require('@chainsafe/libp2p-gossipsub');
const { fromString: uint8FromString, toString: uint8ToString } = require('uint8arrays');
const { lpStream } = require('it-length-prefixed-stream');
const crypto = require('crypto');
const ConfigStore = require('./configStore');

const CONFIG_PROTOCOL = '/dconfig-sync/config/1.0.0';
const CONFIG_TOPIC = 'dconfig-sync-config';
const CONFIG_NAMESPACE = 'dconfig-sync:config';

const DHT_REFRESH_INTERVAL = 30000;
const CONTENT_REPUBLISH_INTERVAL = 60000;
const PEER_DISCOVERY_INTERVAL = 45000;
const MIN_PEER_COUNT = 3;
const FALLBACK_QUERY_TIMEOUT = 8000;

function toDHTKey(key) {
  return `${CONFIG_NAMESPACE}:${key}`;
}

function randomKey() {
  return `${CONFIG_NAMESPACE}:_refresh_${crypto.randomBytes(8).toString('hex')}`;
}

class P2PNode {
  constructor(options = {}) {
    this.options = options;
    this.node = null;
    this.configStore = options.configStore || new ConfigStore({
      mergeStrategy: options.mergeStrategy || ConfigStore.MERGE_LWW,
    });
    this.bootstraps = options.bootstraps || [];
    this.listenAddresses = options.listenAddresses || [
      '/ip4/0.0.0.0/tcp/0',
    ];
    this.eventListeners = new Set();
    this._started = false;
    this._attachedConfigListeners = [];

    this._timers = [];
    this._dhtHealth = {
      routingTableSize: 0,
      contentKeys: 0,
      lastRefresh: 0,
      lastRepublish: 0,
      putSuccessCount: 0,
      putFailCount: 0,
      getSuccessCount: 0,
      getFailCount: 0,
      replicationCount: 0,
    };
    this._fallbackRequests = new Map();
    this._lastRepublishMap = new Map();
  }

  on(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  emit(event, payload) {
    const msg = { event, payload, ts: Date.now() };
    for (const fn of this.eventListeners) {
      try { fn(msg); } catch (e) { console.error(e); }
    }
  }

  async start() {
    if (this._started) return;

    const node = await createLibp2p({
      addresses: {
        listen: this.listenAddresses,
      },
      transports: [tcp(), webSockets()],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),
        dht: kadDHT({
          protocol: '/ipfs/kad/1.0.0',
          clientMode: false,
          kBucketSize: 20,
        }),
        pubsub: gossipsub({
          emitSelf: false,
          gossipIncoming: true,
        }),
      },
      peerDiscovery: [],
    });

    this.node = node;
    this.configStore.nodeId = node.peerId.toString();

    await node.start();

    node.services.pubsub.addEventListener('message', (evt) => {
      const msg = evt.detail;
      if (msg.topic !== CONFIG_TOPIC) return;
      try {
        const text = uint8ToString(msg.data, 'utf8');
        const entry = JSON.parse(text);

        if (entry && entry.type === 'config-change') {
          this._handleRemoteConfigChange(entry.payload);
        } else if (entry && entry.type === 'fallback-request') {
          this._handleFallbackRequest(entry.payload);
        } else if (entry && entry.type === 'fallback-response') {
          this._handleFallbackResponse(entry.payload);
        }
      } catch (e) {
        console.error('[p2p] pubsub parse error:', e);
      }
    });
    await node.services.pubsub.subscribe(CONFIG_TOPIC);

    node.handle(CONFIG_PROTOCOL, async ({ stream }) => {
      try {
        const lp = lpStream(stream);
        const req = await lp.read();
        if (!req) return;
        const text = uint8ToString(req.subarray(), 'utf8');
        const parsed = JSON.parse(text);
        if (parsed.type === 'get-config') {
          const snapshot = this.configStore.exportFull();
          const resp = { type: 'config-snapshot', payload: snapshot };
          await lp.write(uint8FromString(JSON.stringify(resp), 'utf8'));
        } else if (parsed.type === 'get-dag') {
          const fromIndex = parsed.fromIndex || 0;
          const chain = this.configStore.dag.getChainSlice(fromIndex);
          const resp = {
            type: 'dag-chain',
            payload: {
              chain,
              headHash: this.configStore.getDAGHeadHash(),
              genesisHash: this.configStore.dag.genesisHash,
              size: this.configStore.dag.size(),
            },
          };
          await lp.write(uint8FromString(JSON.stringify(resp), 'utf8'));
        } else if (parsed.type === 'verify-dag') {
          const remoteChain = parsed.chain || [];
          const result = this.configStore.verifyRemoteDAGChain(remoteChain);
          const resp = { type: 'verify-result', payload: result };
          await lp.write(uint8FromString(JSON.stringify(resp), 'utf8'));
        }
      } catch (err) {
        console.error('[p2p] protocol handler error:', err);
      }
    });

    node.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.toString();
      this.emit('peer-connect', { peerId });
      this.requestSnapshotFrom(peerId).catch((e) => console.warn('[p2p] snapshot pull failed:', e));
    });

    node.addEventListener('peer:disconnect', (evt) => {
      this.emit('peer-disconnect', { peerId: evt.detail.toString() });
      this._maybeTriggerPeerDiscovery();
    });

    const changeHandler = (event, payload) => {
      if (event === 'update' || event === 'delete') {
        this.publishConfigChange(event, payload).catch((e) =>
          console.warn('[p2p] publish error:', e)
        );
      }
    };
    this._attachedConfigListeners.push(changeHandler);
    this.configStore.onChange(changeHandler);

    await this._connectBootstraps();

    this._startPeriodicTasks();

    this._started = true;
    this.emit('started', {
      peerId: node.peerId.toString(),
      addresses: node.getMultiaddrs().map((m) => m.toString()),
    });
  }

  _startPeriodicTasks() {
    const refreshTimer = setInterval(() => {
      this._refreshDHT().catch((e) => console.warn('[p2p] DHT refresh error:', e));
    }, DHT_REFRESH_INTERVAL);
    this._timers.push(refreshTimer);

    const republishTimer = setInterval(() => {
      this._republishAllConfigs().catch((e) => console.warn('[p2p] content republish error:', e));
    }, CONTENT_REPUBLISH_INTERVAL);
    this._timers.push(republishTimer);

    const discoveryTimer = setInterval(() => {
      this._maybeTriggerPeerDiscovery();
    }, PEER_DISCOVERY_INTERVAL);
    this._timers.push(discoveryTimer);

    this._refreshDHT().catch((e) => console.warn('[p2p] initial DHT refresh error:', e));
  }

  _stopPeriodicTasks() {
    for (const t of this._timers) clearInterval(t);
    this._timers = [];
  }

  async _refreshDHT() {
    if (!this.node) return;
    try {
      const key = randomKey();
      for await (const _ of this.node.services.dht.get(uint8FromString(key, 'utf8'))) {
        break;
      }
      this._dhtHealth.lastRefresh = Date.now();
      this.emit('dht-refresh', { key });
    } catch (err) {
      console.warn('[p2p] DHT refresh failed:', err.message);
    }
  }

  async _republishAllConfigs() {
    if (!this.node) return;
    const snapshot = this.configStore.exportFull();
    const keys = Object.keys(snapshot.data);
    this._dhtHealth.contentKeys = keys.length;

    for (const key of keys) {
      const meta = snapshot.metadata[key] || {};
      const lastPub = this._lastRepublishMap.get(key) || 0;
      const age = Date.now() - lastPub;
      if (age < CONTENT_REPUBLISH_INTERVAL * 0.8) continue;

      try {
        const dhtKey = toDHTKey(key);
        const payload = {
          key,
          value: snapshot.data[key],
          timestamp: meta.timestamp || Date.now(),
          author: meta.author || this.configStore.nodeId,
          version: meta.version || 'republish',
          action: 'update',
        };
        await this.node.services.dht.put(
          uint8FromString(dhtKey, 'utf8'),
          uint8FromString(JSON.stringify(payload), 'utf8')
        );
        this._lastRepublishMap.set(key, Date.now());
        this._dhtHealth.putSuccessCount++;
        this._dhtHealth.lastRepublish = Date.now();
      } catch (err) {
        this._dhtHealth.putFailCount++;
        console.warn(`[p2p] republish key=${key} failed:`, err.message);
      }
    }

    this.emit('dht-republish', { keys: keys.length });
  }

  async _maybeTriggerPeerDiscovery() {
    if (!this.node) return;
    const peers = this.getConnectedPeers();
    this._dhtHealth.routingTableSize = peers.length;

    if (peers.length < MIN_PEER_COUNT) {
      try {
        const key = randomKey();
        for await (const event of this.node.services.dht.get(uint8FromString(key, 'utf8'))) {
          if (event.name === 'PEER_RESPONSE' || event.name === 'CLOSER_PEERS') {
            break;
          }
        }
        this.emit('peer-discovery', { peers: this.getConnectedPeers().length });
      } catch (err) {
        console.warn('[p2p] peer discovery failed:', err.message);
      }
    }
  }

  async _connectBootstraps() {
    const { multiaddr } = require('@multiformats/multiaddr');
    for (const addr of this.bootstraps) {
      try {
        const ma = multiaddr(addr);
        await this.node.dial(ma);
      } catch (e) {
        console.warn('[p2p] bootstrap dial failed:', addr, e.message);
      }
    }
  }

  _handleRemoteConfigChange(payload) {
    const authorBefore = this.configStore.nodeId;
    const result = this.configStore.applyRemote(payload);

    this.emit('config-change', { remote: true, applied: result.applied, ...payload });

    if (result.applied && payload.action !== 'delete') {
      this._replicateToDHT(payload).catch((e) =>
        console.warn('[p2p] replication to DHT failed:', e)
      );
    }
  }

  async _replicateToDHT(payload) {
    if (!this.node) return;
    try {
      const dhtKey = toDHTKey(payload.key);
      await this.node.services.dht.put(
        uint8FromString(dhtKey, 'utf8'),
        uint8FromString(JSON.stringify({
          key: payload.key,
          value: payload.value,
          timestamp: payload.timestamp,
          author: payload.author,
          version: payload.version,
          action: payload.action || 'update',
        }), 'utf8')
      );
      this._dhtHealth.replicationCount++;
      this._dhtHealth.putSuccessCount++;
      this._lastRepublishMap.set(payload.key, Date.now());
    } catch (err) {
      this._dhtHealth.putFailCount++;
    }
  }

  async stop() {
    if (!this.node) return;
    this._stopPeriodicTasks();
    this._fallbackRequests.clear();
    await this.node.stop();
    this._started = false;
    this.emit('stopped', {});
  }

  getPeerId() {
    return this.node ? this.node.peerId.toString() : null;
  }

  getAddresses() {
    return this.node ? this.node.getMultiaddrs().map((m) => m.toString()) : [];
  }

  getConnectedPeers() {
    if (!this.node) return [];
    return this.node.getPeers().map((p) => p.toString());
  }

  getDHTHealth() {
    return { ...this._dhtHealth, routingTableSize: this.getConnectedPeers().length };
  }

  async publishConfigChange(action, payload) {
    if (!this.node) return;
    const entry = {
      type: 'config-change',
      payload: { action, ...payload },
    };
    const buf = uint8FromString(JSON.stringify(entry), 'utf8');

    try {
      await this.node.services.pubsub.publish(CONFIG_TOPIC, buf);
    } catch (err) {
      console.warn('[p2p] pubsub publish error:', err);
    }

    try {
      const dhtKey = toDHTKey(payload.key);
      await this.node.services.dht.put(
        uint8FromString(dhtKey, 'utf8'),
        uint8FromString(JSON.stringify(entry.payload), 'utf8')
      );
      this._dhtHealth.putSuccessCount++;
      this._lastRepublishMap.set(payload.key, Date.now());
    } catch (err) {
      this._dhtHealth.putFailCount++;
      console.warn('[p2p] DHT put error:', err);
    }
  }

  async fetchFromDHT(key) {
    if (!this.node) return null;
    const dhtKey = toDHTKey(key);
    try {
      for await (const event of this.node.services.dht.get(
        uint8FromString(dhtKey, 'utf8')
      )) {
        if (event.name === 'VALUE') {
          const text = uint8ToString(event.value, 'utf8');
          const entry = JSON.parse(text);
          this._dhtHealth.getSuccessCount++;
          this.configStore.applyRemote(entry);
          return entry;
        }
      }
      this._dhtHealth.getFailCount++;
    } catch (err) {
      this._dhtHealth.getFailCount++;
      console.warn('[p2p] DHT get error:', err);
    }

    return this._fallbackQuery(key);
  }

  async _fallbackQuery(key) {
    if (!this.node) return null;

    const requestId = crypto.randomBytes(8).toString('hex');
    const requestEntry = {
      type: 'fallback-request',
      payload: { requestId, key, requester: this.configStore.nodeId },
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._fallbackRequests.delete(requestId);
        resolve(null);
      }, FALLBACK_QUERY_TIMEOUT);

      this._fallbackRequests.set(requestId, {
        resolve: (entry) => {
          clearTimeout(timeout);
          this._fallbackRequests.delete(requestId);
          this.configStore.applyRemote(entry);
          resolve(entry);
        },
        key,
      });

      try {
        this.node.services.pubsub.publish(
          CONFIG_TOPIC,
          uint8FromString(JSON.stringify(requestEntry), 'utf8')
        ).catch((e) => console.warn('[p2p] fallback request publish error:', e));
      } catch (err) {
        console.warn('[p2p] fallback request failed:', err);
        clearTimeout(timeout);
        this._fallbackRequests.delete(requestId);
        resolve(null);
      }
    });
  }

  async _handleFallbackRequest(payload) {
    if (!this.node || !payload || !payload.key) return;
    if (payload.requester === this.configStore.nodeId) return;

    const value = this.configStore.data[payload.key];
    const meta = this.configStore.metadata[payload.key];
    if (value === undefined) return;

    const responseEntry = {
      type: 'fallback-response',
      payload: {
        requestId: payload.requestId,
        key: payload.key,
        value,
        timestamp: meta.timestamp,
        author: meta.author,
        version: meta.version,
        action: 'update',
      },
    };

    try {
      await this.node.services.pubsub.publish(
        CONFIG_TOPIC,
        uint8FromString(JSON.stringify(responseEntry), 'utf8')
      );
    } catch (err) {
      console.warn('[p2p] fallback response error:', err);
    }
  }

  _handleFallbackResponse(payload) {
    if (!payload || !payload.requestId) return;
    const pending = this._fallbackRequests.get(payload.requestId);
    if (pending) {
      pending.resolve(payload);
    }
  }

  async requestSnapshotFrom(peerId) {
    if (!this.node) return null;
    const { peerIdFromString } = require('@libp2p/peer-id');
    try {
      const pid = peerIdFromString(peerId);
      const stream = await this.node.dialProtocol(pid, CONFIG_PROTOCOL);
      const lp = lpStream(stream);
      await lp.write(uint8FromString(JSON.stringify({ type: 'get-config' }), 'utf8'));
      const resp = await lp.read();
      if (!resp) return null;
      const text = uint8ToString(resp.subarray(), 'utf8');
      const parsed = JSON.parse(text);
      if (parsed.type === 'config-snapshot') {
        const res = this.configStore.importFull(parsed.payload, peerId);
        this.emit('snapshot-imported', { peerId, changed: res.changed, dagImported: res.dagImported || 0 });
        return parsed.payload;
      }
    } catch (err) {
      console.warn('[p2p] snapshot request failed:', err);
    }
    return null;
  }

  async requestDAGFrom(peerId, fromIndex) {
    if (!this.node) return null;
    const { peerIdFromString } = require('@libp2p/peer-id');
    try {
      const pid = peerIdFromString(peerId);
      const stream = await this.node.dialProtocol(pid, CONFIG_PROTOCOL);
      const lp = lpStream(stream);
      await lp.write(uint8FromString(JSON.stringify({ type: 'get-dag', fromIndex: fromIndex || 0 }), 'utf8'));
      const resp = await lp.read();
      if (!resp) return null;
      const text = uint8ToString(resp.subarray(), 'utf8');
      const parsed = JSON.parse(text);
      if (parsed.type === 'dag-chain') {
        const verifyResult = this.configStore.verifyRemoteDAGChain(parsed.payload.chain);
        if (verifyResult.valid) {
          const importResult = this.configStore.importDAGChain(parsed.payload.chain);
          this.emit('dag-imported', { peerId, imported: importResult.imported, headHash: parsed.payload.headHash });
        } else {
          this.emit('dag-verify-failed', { peerId, error: verifyResult.error, failedIndex: verifyResult.failedIndex });
        }
        return parsed.payload;
      }
    } catch (err) {
      console.warn('[p2p] DAG request failed:', err);
    }
    return null;
  }

  async verifyRemoteDAG(peerId) {
    if (!this.node) return null;
    const { peerIdFromString } = require('@libp2p/peer-id');
    try {
      const pid = peerIdFromString(peerId);
      const stream = await this.node.dialProtocol(pid, CONFIG_PROTOCOL);
      const lp = lpStream(stream);
      const localChain = this.configStore.getDAGChain();
      await lp.write(uint8FromString(JSON.stringify({ type: 'verify-dag', chain: localChain }), 'utf8'));
      const resp = await lp.read();
      if (!resp) return null;
      const text = uint8ToString(resp.subarray(), 'utf8');
      const parsed = JSON.parse(text);
      if (parsed.type === 'verify-result') {
        this.emit('dag-verify-result', { peerId, ...parsed.payload });
        return parsed.payload;
      }
    } catch (err) {
      console.warn('[p2p] DAG verify failed:', err);
    }
    return null;
  }
}

P2PNode.CONFIG_TOPIC = CONFIG_TOPIC;
P2PNode.CONFIG_PROTOCOL = CONFIG_PROTOCOL;
P2PNode.CONFIG_NAMESPACE = CONFIG_NAMESPACE;

module.exports = P2PNode;
