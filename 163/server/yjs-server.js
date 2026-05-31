import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync.js';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import { encoding, decoding } from 'lib0';
import AWS from 'aws-sdk';
import { config } from './config.js';
import { createSnapshot } from './api-server.js';

const s3 = new AWS.S3({
  accessKeyId: config.awsAccessKeyId,
  secretAccessKey: config.awsSecretAccessKey,
  region: config.awsRegion
});

export const docs = new Map();
const BATCH_INTERVAL_MS = 50;
const SNAPSHOT_INTERVAL_MS = 30000;

const messageSync = 0;
const messageAwareness = 1;

const saveToS3 = async (docId, ydoc) => {
  if (!config.s3Bucket || config.s3Bucket === 'whiteboard-history') {
    return;
  }
  try {
    const state = Y.encodeStateAsUpdate(ydoc);
    const params = {
      Bucket: config.s3Bucket,
      Key: `whiteboards/${docId}.bin`,
      Body: Buffer.from(state),
      ContentType: 'application/octet-stream'
    };
    await s3.putObject(params).promise();
    console.log(`[S3] Saved whiteboard: ${docId}`);
  } catch (err) {
    console.error('[S3] Save error:', err.message);
  }
};

const loadFromS3 = async (docId, ydoc) => {
  if (!config.s3Bucket || config.s3Bucket === 'whiteboard-history') {
    return;
  }
  try {
    const params = {
      Bucket: config.s3Bucket,
      Key: `whiteboards/${docId}.bin`
    };
    const data = await s3.getObject(params).promise();
    if (data.Body) {
      Y.applyUpdate(ydoc, new Uint8Array(data.Body));
      console.log(`[S3] Loaded whiteboard: ${docId}`);
    }
  } catch (err) {
    if (err.code !== 'NoSuchKey') {
      console.error('[S3] Load error:', err.message);
    }
  }
};

const getDoc = (docId) => {
  if (docs.has(docId)) {
    return docs.get(docId);
  }

  const ydoc = new Y.Doc();
  ydoc.gc = true;

  loadFromS3(docId, ydoc);

  let saveTimeout = null;
  let snapshotTimer = null;

  ydoc.on('update', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveToS3(docId, ydoc);
    }, 5000);
  });

  snapshotTimer = setInterval(() => {
    createSnapshot(docId, ydoc);
  }, SNAPSHOT_INTERVAL_MS);

  createSnapshot(docId, ydoc);

  const clientBuffers = new Map();
  const batchTimers = new Map();

  const flushBatch = (conn) => {
    const buffer = clientBuffers.get(conn);
    if (!buffer || buffer.length === 0) return;

    const merged = Y.mergeUpdates(buffer);
    clientBuffers.set(conn, []);

    const encoder = encoding.createEncoder();
    syncProtocol.writeUpdate(encoder, merged);
    if (conn.readyState === 1) {
      conn.send(encoding.toUint8Array(encoder));
    }
  };

  const broadcastUpdate = (update, origin, wss) => {
    for (const client of wss.clients) {
      if (client === origin || client.readyState !== 1) continue;

      let buffer = clientBuffers.get(client);
      if (!buffer) {
        buffer = [];
        clientBuffers.set(client, buffer);
      }
      buffer.push(update);

      if (!batchTimers.has(client)) {
        const timer = setTimeout(() => {
          batchTimers.delete(client);
          flushBatch(client);
        }, BATCH_INTERVAL_MS);
        batchTimers.set(client, timer);
      }
    }
  };

  const docState = {
    ydoc,
    clientBuffers,
    batchTimers,
    snapshotTimer,
    broadcastUpdate,
    cleanupClient: (conn) => {
      clientBuffers.delete(conn);
      const timer = batchTimers.get(conn);
      if (timer) {
        clearTimeout(timer);
        batchTimers.delete(conn);
      }
      flushBatch(conn);
    }
  };

  docs.set(docId, docState);
  return docState;
};

export const wss = new WebSocketServer({ port: config.yjsPort });

wss.on('connection', (conn, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const docId = url.searchParams.get('room') || 'default';
  const isReadOnly = url.searchParams.get('readonly') === 'true';

  const docState = getDoc(docId);
  const { ydoc, broadcastUpdate, cleanupClient } = docState;
  const awareness = new awarenessProtocol.Awareness(ydoc);

  const syncEncoder = encoding.createEncoder();
  syncProtocol.writeSyncStep1(syncEncoder, ydoc);
  conn.send(encoding.toUint8Array(syncEncoder));

  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
    );
    conn.send(encoding.toUint8Array(encoder));
  }

  const updateHandler = (update, origin) => {
    if (origin !== conn) {
      broadcastUpdate(update, conn, wss);
    }
  };
  ydoc.on('update', updateHandler);

  const awarenessHandler = ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated).concat(removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
    );
    const data = encoding.toUint8Array(encoder);
    wss.clients.forEach((client) => {
      if (client !== origin && client.readyState === 1) {
        client.send(data);
      }
    });
  };
  awareness.on('update', awarenessHandler);

  conn.on('message', (message) => {
    try {
      const uint8Msg = new Uint8Array(message);
      const decoder = decoding.createDecoder(uint8Msg);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync:
          if (isReadOnly) return;
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, ydoc, conn);
          if (encoding.length(encoder) > 1) {
            conn.send(encoding.toUint8Array(encoder));
          }
          break;

        case messageAwareness:
          if (isReadOnly) return;
          awarenessProtocol.applyAwarenessUpdate(
            awareness,
            decoding.readVarUint8Array(decoder),
            conn
          );
          break;
      }
    } catch (err) {
      console.error('[Yjs] Message error:', err.message);
    }
  });

  conn.on('close', () => {
    ydoc.off('update', updateHandler);
    awareness.off('update', awarenessHandler);
    cleanupClient(conn);

    const hasOtherClients = Array.from(wss.clients).some(
      (c) => c !== conn && c.readyState === 1
    );

    if (!hasOtherClients) {
      saveToS3(docId, ydoc);
      clearInterval(docState.snapshotTimer);
      setTimeout(() => {
        const stillEmpty = Array.from(wss.clients).every(
          (c) => c.readyState !== 1
        );
        if (stillEmpty && docs.has(docId)) {
          const state = docs.get(docId);
          state.ydoc.destroy();
          docs.delete(docId);
          console.log(`[Yjs] Cleaned up doc: ${docId}`);
        }
      }, 60000);
    }

    awareness.destroy();
  });

  console.log(`[Yjs] Client connected to room: ${docId} (readonly=${isReadOnly})`);
});

console.log(`[Yjs] WebSocket server running on ws://localhost:${config.yjsPort}`);
