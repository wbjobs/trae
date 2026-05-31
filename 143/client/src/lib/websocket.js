import { writable } from 'svelte/store';
import { OTEngine } from './ot.js';

export function createWebSocketClient() {
  const store = writable({
    connected: false,
    clientId: null,
    documentId: null,
    branchId: null,
    branchName: null,
    document: null,
    version: 0,
    users: [],
    pendingOps: [],
    ackedVersion: 0,
    branches: [],
    merges: [],
    currentMerge: null,
    mergeConflicts: null
  });

  let ws = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let messageQueue = [];
  let opQueue = [];
  let isProcessingOp = false;

  function connect(url = 'ws://localhost:3000') {
    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('WebSocket connected');
          reconnectAttempts = 0;
          store.update(s => ({ ...s, connected: true }));
          flushQueue();
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleMessage(message);
          } catch (err) {
            console.error('Message parse error:', err);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          store.update(s => ({ ...s, connected: false }));
          scheduleReconnect(url);
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  function scheduleReconnect(url) {
    if (reconnectAttempts >= 10) return;

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
    reconnectAttempts++;

    reconnectTimer = setTimeout(() => {
      connect(url);
    }, delay);
  }

  function flushQueue() {
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      ws.send(JSON.stringify(msg));
    }
  }

  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      messageQueue.push(message);
    }
  }

  function handleMessage(message) {
    switch (message.type) {
      case 'init':
        store.update(s => ({
          ...s,
          clientId: message.clientId
        }));
        break;

      case 'document_list':
        store.update(s => ({ ...s, documentList: message.documents }));
        break;

      case 'document_created':
        store.update(s => ({ ...s, createdDocument: message.document }));
        break;

      case 'document_joined':
        store.update(s => ({
          ...s,
          documentId: message.document.id,
          branchId: message.document.branchId,
          branchName: message.document.branchName,
          document: message.document.content,
          version: message.document.version,
          ackedVersion: message.document.version,
          pendingOps: []
        }));
        opQueue = [];
        isProcessingOp = false;
        break;

      case 'branch_switched':
        store.update(s => ({
          ...s,
          branchId: message.branch.id,
          branchName: message.branch.name,
          document: message.branch.content,
          version: message.branch.version,
          ackedVersion: message.branch.version,
          pendingOps: []
        }));
        opQueue = [];
        isProcessingOp = false;
        break;

      case 'branches_list':
        store.update(s => ({
          ...s,
          branches: message.branches
        }));
        break;

      case 'branch_created':
        store.update(s => {
          const branches = [...s.branches, message.branch];
          return { ...s, branches };
        });
        break;

      case 'branch_deleted':
        store.update(s => {
          const branches = s.branches.filter(b => b.id !== message.branchId);
          return { ...s, branches };
        });
        break;

      case 'branch_renamed':
        store.update(s => {
          const branches = s.branches.map(b => 
            b.id === message.branch.id ? { ...b, ...message.branch } : b
          );
          return { ...s, branches };
        });
        break;

      case 'merge_conflicts':
        store.update(s => ({
          ...s,
          currentMerge: message.merge,
          mergeConflicts: message.conflicts,
          mergeSourceContent: message.sourceContent,
          mergeTargetContent: message.targetContent
        }));
        break;

      case 'merge_completed':
        store.update(s => {
          const merges = s.merges.map(m => 
            m.id === message.merge.id ? { ...m, ...message.merge } : m
          );
          return {
            ...s,
            merges,
            currentMerge: null,
            mergeConflicts: null,
            mergeSourceContent: null,
            mergeTargetContent: null
          };
        });
        break;

      case 'merge_aborted':
        store.update(s => ({
          ...s,
          currentMerge: null,
          mergeConflicts: null,
          mergeSourceContent: null,
          mergeTargetContent: null
        }));
        break;

      case 'merges_list':
        store.update(s => ({
          ...s,
          merges: message.merges
        }));
        break;

      case 'document_left':
        store.update(s => ({
          ...s,
          documentId: null,
          branchId: null,
          branchName: null,
          document: null,
          version: 0,
          users: [],
          pendingOps: [],
          ackedVersion: 0,
          branches: [],
          merges: [],
          currentMerge: null,
          mergeConflicts: null
        }));
        opQueue = [];
        isProcessingOp = false;
        break;

      case 'operation':
        handleRemoteOperation(message);
        break;

      case 'operation_ack':
        handleOperationAck(message);
        break;

      case 'sync_operations':
        handleSyncOperations(message);
        break;

      case 'document_state':
        handleDocumentState(message);
        break;

      case 'user_joined':
      case 'user_left':
      case 'user_update':
      case 'user_switch_branch':
      case 'users_list':
      case 'cursor':
        handleUserMessage(message);
        break;

      case 'error':
        console.error('Server error:', message.message);
        break;
    }
  }

  function handleRemoteOperation(message) {
    store.update(s => {
      if (!s.document) return s;

      if (message.version <= s.version) {
        return s;
      }

      if (message.version > s.version + 1) {
        console.warn('Version gap detected. Requesting sync...');
        send({ type: 'request_sync', fromVersion: s.version });
        return s;
      }

      let newDoc = s.document;
      let newPendingOps = [...s.pendingOps];

      for (let i = 0; i < newPendingOps.length; i++) {
        const [transformed] = OTEngine.transform(newPendingOps[i], message.operation);
        newPendingOps[i] = transformed;
      }
      newPendingOps = newPendingOps.filter(op => op !== null);

      newDoc = OTEngine.applyOperation(newDoc, message.operation);

      return {
        ...s,
        document: newDoc,
        version: message.version,
        pendingOps: newPendingOps
      };
    });
  }

  function handleSyncOperations(message) {
    store.update(s => {
      if (!s.document) return s;

      let newDoc = s.document;
      let newPendingOps = [...s.pendingOps];
      let newVersion = s.version;

      for (const opData of message.operations) {
        if (opData.version <= newVersion) continue;

        for (let i = 0; i < newPendingOps.length; i++) {
          const [transformed] = OTEngine.transform(newPendingOps[i], opData.operation);
          newPendingOps[i] = transformed;
        }
        newPendingOps = newPendingOps.filter(op => op !== null);

        newDoc = OTEngine.applyOperation(newDoc, opData.operation);
        newVersion = opData.version;
      }

      return {
        ...s,
        document: newDoc,
        version: newVersion,
        pendingOps: newPendingOps
      };
    });
  }

  function handleDocumentState(message) {
    store.update(s => {
      if (!s.documentId) return s;

      if (message.version > s.version) {
        let newDoc = message.content;
        let newPendingOps = s.pendingOps;

        for (const op of newPendingOps) {
          newDoc = OTEngine.applyOperation(newDoc, op);
        }

        return {
          ...s,
          document: newDoc,
          version: message.version,
          pendingOps: newPendingOps
        };
      }

      return s;
    });
  }

  function handleOperationAck(message) {
    store.update(s => {
      if (s.pendingOps.length === 0) {
        return {
          ...s,
          version: message.version,
          ackedVersion: message.version
        };
      }

      const newPendingOps = s.pendingOps.slice(1);
      return {
        ...s,
        version: message.version,
        ackedVersion: message.version,
        pendingOps: newPendingOps
      };
    });

    processOpQueue();
  }

  function handleUserMessage(message) {
    store.update(s => {
      let users = [...s.users];

      switch (message.type) {
        case 'user_joined':
          if (!users.find(u => u.id === message.user.id)) {
            users.push(message.user);
          }
          break;

        case 'user_left':
          users = users.filter(u => u.id !== message.userId);
          break;

        case 'user_update':
          const idx = users.findIndex(u => u.id === message.user.id);
          if (idx >= 0) {
            users[idx] = { ...users[idx], ...message.user };
          }
          break;

        case 'user_switch_branch':
          const switchIdx = users.findIndex(u => u.id === message.userId);
          if (switchIdx >= 0) {
            users[switchIdx] = { ...users[switchIdx], branchId: message.branchId };
          }
          break;

        case 'users_list':
          users = message.users;
          break;

        case 'cursor':
          const cursorIdx = users.findIndex(u => u.id === message.userId);
          if (cursorIdx >= 0) {
            users[cursorIdx] = { ...users[cursorIdx], cursor: message.cursor };
          }
          break;
      }

      return { ...s, users };
    });
  }

  function listDocuments() {
    send({ type: 'list_documents' });
  }

  function createDocument(name) {
    send({ type: 'create_document', name });
  }

  function joinDocument(documentId, branchId = null) {
    const msg = { type: 'join_document', documentId };
    if (branchId) {
      msg.branchId = branchId;
    }
    send(msg);
  }

  function switchBranch(branchId) {
    send({ type: 'switch_branch', branchId });
  }

  function listBranches() {
    send({ type: 'list_branches' });
  }

  function createBranch(name, parentBranchId = null) {
    send({ type: 'create_branch', name, parentBranchId });
  }

  function deleteBranch(branchId) {
    send({ type: 'delete_branch', branchId });
  }

  function renameBranch(branchId, name) {
    send({ type: 'rename_branch', branchId, name });
  }

  function mergeBranches(sourceBranchId, targetBranchId) {
    send({ type: 'merge_branches', sourceBranchId, targetBranchId });
  }

  function listMerges() {
    send({ type: 'list_merges' });
  }

  function resolveMerge(mergeId, resolved, resolutions = []) {
    send({ type: 'resolve_merge', mergeId, resolved, resolutions });
  }

  function leaveDocument() {
    opQueue = [];
    isProcessingOp = false;
    send({ type: 'leave_document' });
  }

  function sendOperation(operation) {
    const currentState = getStoreValue();
    
    opQueue.push({
      operation,
      baseVersion: currentState.ackedVersion
    });
    
    store.update(s => ({
      ...s,
      pendingOps: [...s.pendingOps, operation]
    }));

    processOpQueue();
  }

  function processOpQueue() {
    if (isProcessingOp || opQueue.length === 0) return;

    isProcessingOp = true;
    const opItem = opQueue.shift();

    const currentState = getStoreValue();
    const baseVersion = currentState.ackedVersion;

    send({
      type: 'operation',
      operation: opItem.operation,
      baseVersion: baseVersion
    });

    setTimeout(() => {
      isProcessingOp = false;
      processOpQueue();
    }, 50);
  }

  function getStoreValue() {
    let value;
    const unsubscribe = store.subscribe(s => {
      value = s;
    });
    unsubscribe();
    return value;
  }

  function sendCursor(cursor) {
    send({ type: 'cursor', cursor });
  }

  function updateProfile(name, color) {
    send({ type: 'update_profile', name, color });
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (ws) {
      ws.close();
    }
  }

  return {
    ...store,
    connect,
    disconnect,
    listDocuments,
    createDocument,
    joinDocument,
    switchBranch,
    listBranches,
    createBranch,
    deleteBranch,
    renameBranch,
    mergeBranches,
    listMerges,
    resolveMerge,
    leaveDocument,
    sendOperation,
    sendCursor,
    updateProfile
  };
}

export const wsClient = createWebSocketClient();
