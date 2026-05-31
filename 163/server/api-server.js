import http from 'http';
import * as Y from 'yjs';
import { config } from './config.js';

let docsRef = null;
let wssRef = null;

export const setDocsRef = (docs, wss) => {
  docsRef = docs;
  wssRef = wss;
};

const MAX_HISTORY_PER_DOC = 100;

export const historyStore = new Map();

export const createSnapshot = (docId, ydoc) => {
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const timestamp = Date.now();

    if (!historyStore.has(docId)) {
      historyStore.set(docId, []);
    }

    const history = historyStore.get(docId);
    history.push({ timestamp, state });

    if (history.length > MAX_HISTORY_PER_DOC) {
      history.shift();
    }

    console.log(`[History] Snapshot: ${docId} @ ${new Date(timestamp).toISOString()}`);
    return { timestamp, state };
  } catch (err) {
    console.error('[History] Snapshot error:', err.message);
    return null;
  }
};

const getStrokesFromState = (state) => {
  const tempDoc = new Y.Doc();
  Y.applyUpdate(tempDoc, new Uint8Array(state));
  const strokesMap = tempDoc.getMap('strokes');
  const strokes = {};
  strokesMap.forEach((value, key) => {
    strokes[key] = JSON.parse(value);
  });
  tempDoc.destroy();
  return strokes;
};

const computeDiff = (strokesA, strokesB) => {
  const keysA = new Set(Object.keys(strokesA));
  const keysB = new Set(Object.keys(strokesB));

  const added = [];
  const removed = [];
  const modified = [];

  for (const key of keysB) {
    if (!keysA.has(key)) {
      added.push(strokesB[key]);
    }
  }

  for (const key of keysA) {
    if (!keysB.has(key)) {
      removed.push(strokesA[key]);
    }
  }

  for (const key of keysA) {
    if (keysB.has(key)) {
      const a = JSON.stringify(strokesA[key]);
      const b = JSON.stringify(strokesB[key]);
      if (a !== b) {
        modified.push({
          before: strokesA[key],
          after: strokesB[key]
        });
      }
    }
  }

  return { added, removed, modified };
};

const sendJSON = (res, statusCode, data) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] !== 'api' || parts[1] !== 'history') {
    sendJSON(res, 404, { error: 'Not found' });
    return;
  }

  const docId = parts[2];
  if (!docId || !docsRef?.has(docId)) {
    sendJSON(res, 404, { error: 'Room not found' });
    return;
  }

  if (parts.length === 3) {
    const history = historyStore.get(docId) || [];
    const versions = history
      .map(h => ({
        timestamp: h.timestamp,
        label: new Date(h.timestamp).toLocaleString('zh-CN')
      }))
      .reverse();
    sendJSON(res, 200, { versions });
    return;
  }

  const timestamp = parseInt(parts[3], 10);
  if (!timestamp) {
    sendJSON(res, 400, { error: 'Invalid timestamp' });
    return;
  }

  const history = historyStore.get(docId) || [];
  const snapshot = history.find(h => h.timestamp === timestamp);

  if (!snapshot) {
    sendJSON(res, 404, { error: 'Version not found' });
    return;
  }

  if (parts[4] === 'diff') {
    try {
      const docState = docsRef.get(docId);

      const currentStrokes = getStrokesFromState(Y.encodeStateAsUpdate(docState.ydoc));
      const snapshotStrokes = getStrokesFromState(snapshot.state);

      const diff = computeDiff(currentStrokes, snapshotStrokes);

      sendJSON(res, 200, {
        timestamp,
        diff,
        stats: {
          currentCount: Object.keys(currentStrokes).length,
          snapshotCount: Object.keys(snapshotStrokes).length,
          added: diff.added.length,
          removed: diff.removed.length,
          modified: diff.modified.length
        }
      });
    } catch (err) {
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  if (parts[4] === 'rollback') {
    try {
      const docState = docsRef.get(docId);

      Y.applyUpdate(docState.ydoc, new Uint8Array(snapshot.state));

      createSnapshot(docId, docState.ydoc);

      console.log(`[History] Rollback: ${docId} → ${timestamp}`);

      sendJSON(res, 200, {
        success: true,
        timestamp,
        message: `已回滚到 ${new Date(timestamp).toLocaleString('zh-CN')}`
      });
    } catch (err) {
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(config.apiPort, () => {
  console.log(`[API] HTTP server running on http://localhost:${config.apiPort}`);
});

export default server;
