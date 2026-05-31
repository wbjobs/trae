import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { 
  getDocument, 
  createDocument, 
  saveOperation, 
  getOperations,
  getAllOperations,
  listDocuments,
  listBranches,
  getBranch,
  createBranch,
  deleteBranch,
  renameBranch,
  createMerge,
  getMerge,
  listMerges,
  resolveMerge,
  applyMerge
} from './db.js';
import { OTEngine } from './ot.js';
import { ConflictDetector } from './conflict.js';

const documents = new Map();
const clients = new Map();
const documentLocks = new Map();
const operationQueues = new Map();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    const clientId = uuidv4();
    const clientInfo = {
      id: clientId,
      ws,
      docId: null,
      branchId: null,
      version: 0,
      cursor: null,
      color: getRandomColor(),
      name: `User${Math.floor(Math.random() * 1000)}`
    };

    clients.set(clientId, clientInfo);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(clientId, message);
      } catch (err) {
        console.error('Message error:', err);
        sendError(ws, err.message);
      }
    });

    ws.on('close', () => {
      handleDisconnect(clientId);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });

    sendMessage(ws, {
      type: 'init',
      clientId,
      name: clientInfo.name,
      color: clientInfo.color
    });
  });

  return wss;
}

function handleMessage(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'list_documents':
      handleListDocuments(client);
      break;

    case 'create_document':
      handleCreateDocument(client, message);
      break;

    case 'join_document':
      handleJoinDocument(client, message);
      break;

    case 'switch_branch':
      handleSwitchBranch(client, message);
      break;

    case 'list_branches':
      handleListBranches(client);
      break;

    case 'create_branch':
      handleCreateBranch(client, message);
      break;

    case 'delete_branch':
      handleDeleteBranch(client, message);
      break;

    case 'rename_branch':
      handleRenameBranch(client, message);
      break;

    case 'merge_branches':
      handleMergeBranches(client, message);
      break;

    case 'list_merges':
      handleListMerges(client);
      break;

    case 'resolve_merge':
      handleResolveMerge(client, message);
      break;

    case 'leave_document':
      handleLeaveDocument(client);
      break;

    case 'operation':
      enqueueOperation(client, message);
      break;

    case 'request_sync':
      handleSyncRequest(client, message);
      break;

    case 'cursor':
      handleCursor(client, message);
      break;

    case 'update_profile':
      handleUpdateProfile(client, message);
      break;
  }
}

function enqueueOperation(client, message) {
  if (!client.docId || !client.branchId) {
    sendError(client.ws, 'Not joined to a document branch');
    return;
  }

  if (!operationQueues.has(client.docId)) {
    operationQueues.set(client.docId, []);
  }

  const queue = operationQueues.get(client.docId);
  queue.push({ client, message, timestamp: Date.now() });

  processOperationQueue(client.docId);
}

async function processOperationQueue(docId) {
  if (documentLocks.get(docId)) return;

  const queue = operationQueues.get(docId);
  if (!queue || queue.length === 0) return;

  documentLocks.set(docId, true);

  try {
    while (queue.length > 0) {
      const { client, message } = queue.shift();
      await handleOperation(client, message);
    }
  } catch (err) {
    console.error('Operation queue error:', err);
  } finally {
    documentLocks.set(docId, false);

    const newQueue = operationQueues.get(docId);
    if (newQueue && newQueue.length > 0) {
      setImmediate(() => processOperationQueue(docId));
    }
  }
}

async function handleListDocuments(client) {
  try {
    const docs = await listDocuments();
    sendMessage(client.ws, {
      type: 'document_list',
      documents: docs
    });
  } catch (err) {
    sendError(client.ws, err.message);
  }
}

async function handleCreateDocument(client, message) {
  try {
    const doc = await createDocument(message.name || 'Untitled');
    sendMessage(client.ws, {
      type: 'document_created',
      document: doc
    });
  } catch (err) {
    sendError(client.ws, err.message);
  }
}

async function handleJoinDocument(client, message) {
  try {
    const doc = await getDocument(message.documentId);
    if (!doc) {
      sendError(client.ws, 'Document not found');
      return;
    }

    if (client.docId) {
      removeClientFromDocument(client);
    }

    client.docId = message.documentId;
    client.branchId = message.branchId || doc.main_branch_id;

    const branch = await getBranch(client.docId, client.branchId);
    if (!branch) {
      sendError(client.ws, 'Branch not found');
      return;
    }

    if (!documents.has(message.documentId)) {
      documents.set(message.documentId, {
        id: message.documentId,
        branches: new Map(),
        clients: new Set()
      });
    }

    const docData = documents.get(message.documentId);
    
    if (!docData.branches.has(client.branchId)) {
      const ops = await getAllOperations(client.docId, client.branchId);
      let content = { nodes: [], connections: [] };
      for (const op of ops) {
        if (op.operation.type !== 'init') {
          content = OTEngine.applyOperation(content, op.operation);
        }
      }
      
      docData.branches.set(client.branchId, {
        id: client.branchId,
        content,
        version: branch.latest_version || 0
      });
    }

    docData.clients.add(client.id);
    const branchData = docData.branches.get(client.branchId);
    client.version = branchData.version;

    sendMessage(client.ws, {
      type: 'document_joined',
      document: {
        id: doc.id,
        name: doc.name,
        branchId: client.branchId,
        branchName: branch.name,
        content: branchData.content,
        version: branchData.version
      }
    });

    broadcastToDocument(message.documentId, {
      type: 'user_joined',
      user: {
        id: client.id,
        name: client.name,
        color: client.color,
        branchId: client.branchId
      }
    }, client.id);

    const users = getUsersInDocument(message.documentId);
    sendMessage(client.ws, {
      type: 'users_list',
      users
    });

    const branches = await listBranches(client.docId);
    sendMessage(client.ws, {
      type: 'branches_list',
      branches
    });

  } catch (err) {
    console.error('Join error:', err);
    sendError(client.ws, err.message);
  }
}

async function handleSwitchBranch(client, message) {
  if (!client.docId) return;

  try {
    const branch = await getBranch(client.docId, message.branchId);
    if (!branch) {
      sendError(client.ws, 'Branch not found');
      return;
    }

    const docData = documents.get(client.docId);
    if (!docData) return;

    if (!docData.branches.has(message.branchId)) {
      const ops = await getAllOperations(client.docId, message.branchId);
      let content = { nodes: [], connections: [] };
      for (const op of ops) {
        if (op.operation.type !== 'init') {
          content = OTEngine.applyOperation(content, op.operation);
        }
      }
      
      docData.branches.set(message.branchId, {
        id: message.branchId,
        content,
        version: branch.latest_version || 0
      });
    }

    client.branchId = message.branchId;
    const branchData = docData.branches.get(message.branchId);
    client.version = branchData.version;

    sendMessage(client.ws, {
      type: 'branch_switched',
      branch: {
        id: branch.id,
        name: branch.name,
        content: branchData.content,
        version: branchData.version
      }
    });

    broadcastToDocument(client.docId, {
      type: 'user_switch_branch',
      userId: client.id,
      branchId: message.branchId
    }, client.id);

  } catch (err) {
    console.error('Switch branch error:', err);
    sendError(client.ws, err.message);
  }
}

async function handleListBranches(client) {
  if (!client.docId) return;

  try {
    const branches = await listBranches(client.docId);
    sendMessage(client.ws, {
      type: 'branches_list',
      branches
    });
  } catch (err) {
    sendError(client.ws, err.message);
  }
}

async function handleCreateBranch(client, message) {
  if (!client.docId) return;

  try {
    const branch = await createBranch(
      client.docId, 
      message.name, 
      message.parentBranchId || client.branchId
    );
    
    const docData = documents.get(client.docId);
    if (docData) {
      const parentBranchData = docData.branches.get(client.branchId);
      if (parentBranchData) {
        docData.branches.set(branch.id, {
          id: branch.id,
          content: JSON.parse(JSON.stringify(parentBranchData.content)),
          version: parentBranchData.version
        });
      }
    }

    sendMessage(client.ws, {
      type: 'branch_created',
      branch
    });

    broadcastToDocument(client.docId, {
      type: 'branch_created',
      branch
    }, client.id);

    const branches = await listBranches(client.docId);
    broadcastToDocument(client.docId, {
      type: 'branches_list',
      branches
    });

  } catch (err) {
    console.error('Create branch error:', err);
    sendError(client.ws, err.message);
  }
}

async function handleDeleteBranch(client, message) {
  if (!client.docId) return;

  try {
    const deleted = await deleteBranch(client.docId, message.branchId);
    if (!deleted) {
      sendError(client.ws, 'Cannot delete main branch or branch not found');
      return;
    }

    const docData = documents.get(client.docId);
    if (docData) {
      docData.branches.delete(message.branchId);
    }

    if (client.branchId === message.branchId) {
      const doc = await getDocument(client.docId);
      client.branchId = doc.main_branch_id;
      const branchData = docData.branches.get(client.branchId);
      client.version = branchData?.version || 0;
    }

    sendMessage(client.ws, {
      type: 'branch_deleted',
      branchId: message.branchId
    });

    broadcastToDocument(client.docId, {
      type: 'branch_deleted',
      branchId: message.branchId
    }, client.id);

  } catch (err) {
    sendError(client.ws, err.message);
  }
}

async function handleRenameBranch(client, message) {
  if (!client.docId) return;

  try {
    const branch = await renameBranch(client.docId, message.branchId, message.name);
    if (!branch) {
      sendError(client.ws, 'Branch not found or cannot rename main branch');
      return;
    }

    sendMessage(client.ws, {
      type: 'branch_renamed',
      branch
    });

    broadcastToDocument(client.docId, {
      type: 'branch_renamed',
      branch
    }, client.id);

  } catch (err) {
    sendError(client.ws, err.message);
  }
}

async function handleMergeBranches(client, message) {
  if (!client.docId) return;

  try {
    const sourceOps = await getAllOperations(client.docId, message.sourceBranchId);
    const targetOps = await getAllOperations(client.docId, message.targetBranchId);

    let sourceContent = { nodes: [], connections: [] };
    for (const op of sourceOps) {
      if (op.operation.type !== 'init') {
        sourceContent = OTEngine.applyOperation(sourceContent, op.operation);
      }
    }

    let targetContent = { nodes: [], connections: [] };
    for (const op of targetOps) {
      if (op.operation.type !== 'init') {
        targetContent = OTEngine.applyOperation(targetContent, op.operation);
      }
    }

    const conflicts = ConflictDetector.detectConflicts(sourceContent, targetContent);

    const merge = await createMerge(
      client.docId,
      message.sourceBranchId,
      message.targetBranchId,
      conflicts
    );

    if (conflicts.length === 0) {
      const commonOps = findCommonOperations(sourceOps, targetOps);
      const newOps = sourceOps.slice(commonOps.length);

      const operationsToApply = newOps
        .filter(op => op.operation.type !== 'init')
        .map(op => op.operation);

      const newVersion = await applyMerge(
        client.docId,
        message.sourceBranchId,
        message.targetBranchId,
        operationsToApply
      );

      await resolveMerge(merge.id, true);

      const docData = documents.get(client.docId);
      if (docData) {
        const branchData = docData.branches.get(message.targetBranchId);
        if (branchData) {
          for (const op of operationsToApply) {
            branchData.content = OTEngine.applyOperation(branchData.content, op);
          }
          branchData.version = newVersion;
        }
      }

      broadcastToDocument(client.docId, {
        type: 'merge_completed',
        merge: { ...merge, status: 'resolved' },
        targetBranchId: message.targetBranchId
      });
    } else {
      sendMessage(client.ws, {
        type: 'merge_conflicts',
        merge,
        conflicts,
        sourceContent,
        targetContent
      });
    }

  } catch (err) {
    console.error('Merge error:', err);
    sendError(client.ws, err.message);
  }
}

async function handleListMerges(client) {
  if (!client.docId) return;

  try {
    const merges = await listMerges(client.docId);
    sendMessage(client.ws, {
      type: 'merges_list',
      merges
    });
  } catch (err) {
    sendError(client.ws, err.message);
  }
}

async function handleResolveMerge(client, message) {
  if (!client.docId) return;

  try {
    const merge = await getMerge(message.mergeId);
    if (!merge) {
      sendError(client.ws, 'Merge not found');
      return;
    }

    if (message.resolved) {
      const sourceOps = await getAllOperations(client.docId, merge.source_branch_id);
      const targetOps = await getAllOperations(client.docId, merge.target_branch_id);
      const commonOps = findCommonOperations(sourceOps, targetOps);
      const newOps = sourceOps.slice(commonOps.length);

      const operationsToApply = newOps
        .filter(op => op.operation.type !== 'init')
        .map(op => op.operation);

      for (const resolution of message.resolutions || []) {
        const idx = operationsToApply.findIndex(op => 
          (op.nodeId && op.nodeId === resolution.nodeId) || 
          (op.connectionId && op.connectionId === resolution.connectionId)
        );
        if (idx !== -1) {
          if (resolution.action === 'skip') {
            operationsToApply.splice(idx, 1);
          } else if (resolution.action === 'modify' && resolution.modifiedOperation) {
            operationsToApply[idx] = resolution.modifiedOperation;
          }
        }
      }

      const newVersion = await applyMerge(
        client.docId,
        merge.source_branch_id,
        merge.target_branch_id,
        operationsToApply
      );

      await resolveMerge(merge.id, true);

      const docData = documents.get(client.docId);
      if (docData) {
        const branchData = docData.branches.get(merge.target_branch_id);
        if (branchData) {
          for (const op of operationsToApply) {
            branchData.content = OTEngine.applyOperation(branchData.content, op);
          }
          branchData.version = newVersion;
        }
      }

      broadcastToDocument(client.docId, {
        type: 'merge_completed',
        merge: { ...merge, status: 'resolved' },
        targetBranchId: merge.target_branch_id
      });
    } else {
      await resolveMerge(merge.id, false);
      
      sendMessage(client.ws, {
        type: 'merge_aborted',
        mergeId: message.mergeId
      });
    }

  } catch (err) {
    console.error('Resolve merge error:', err);
    sendError(client.ws, err.message);
  }
}

function findCommonOperations(ops1, ops2) {
  const common = [];
  for (let i = 0; i < Math.min(ops1.length, ops2.length); i++) {
    if (ops1[i].version === ops2[i].version && 
        JSON.stringify(ops1[i].operation) === JSON.stringify(ops2[i].operation)) {
      common.push(ops1[i]);
    } else {
      break;
    }
  }
  return common;
}

function handleLeaveDocument(client) {
  removeClientFromDocument(client);
  sendMessage(client.ws, {
    type: 'document_left'
  });
}

async function handleSyncRequest(client, message) {
  if (!client.docId || !client.branchId) return;

  try {
    const ops = await getOperations(client.docId, client.branchId, message.fromVersion);
    
    if (ops.length > 0) {
      sendMessage(client.ws, {
        type: 'sync_operations',
        operations: ops,
        fromVersion: message.fromVersion
      });
    }

    const docData = documents.get(client.docId);
    const branchData = docData?.branches.get(client.branchId);
    if (branchData) {
      sendMessage(client.ws, {
        type: 'document_state',
        content: branchData.content,
        version: branchData.version
      });
    }
  } catch (err) {
    console.error('Sync error:', err);
    sendError(client.ws, err.message);
  }
}

async function handleOperation(client, message) {
  if (!client.docId || !client.branchId) return;

  const docData = documents.get(client.docId);
  const branchData = docData?.branches.get(client.branchId);
  if (!docData || !branchData) return;

  let operation = message.operation;

  if (message.baseVersion < branchData.version) {
    const ops = await getOperations(client.docId, client.branchId, message.baseVersion);
    
    for (const savedOp of ops) {
      const [transformed] = OTEngine.transform(operation, savedOp.operation);
      operation = transformed;
      if (!operation) break;
    }

    if (!operation) {
      sendMessage(client.ws, {
        type: 'operation_ack',
        version: branchData.version,
        originalVersion: message.baseVersion
      });
      return;
    }
  }

  const newVersion = branchData.version + 1;
  branchData.version = newVersion;
  branchData.content = OTEngine.applyOperation(branchData.content, operation);
  client.version = newVersion;

  try {
    await saveOperation(client.docId, client.branchId, newVersion, operation);
  } catch (err) {
    console.error('Save operation error:', err);
    branchData.version = newVersion - 1;
    sendError(client.ws, 'Failed to save operation');
    return;
  }

  sendMessage(client.ws, {
    type: 'operation_ack',
    version: newVersion,
    originalVersion: message.baseVersion
  });

  broadcastToBranch(client.docId, client.branchId, {
    type: 'operation',
    operation: operation,
    version: newVersion,
    fromClient: client.id
  }, client.id);
}

function handleCursor(client, message) {
  if (!client.docId) return;

  client.cursor = message.cursor;

  broadcastToDocument(client.docId, {
    type: 'cursor',
    userId: client.id,
    cursor: message.cursor
  }, client.id);
}

function handleUpdateProfile(client, message) {
  if (message.name) {
    client.name = message.name;
  }
  if (message.color) {
    client.color = message.color;
  }

  if (client.docId) {
    broadcastToDocument(client.docId, {
      type: 'user_update',
      user: {
        id: client.id,
        name: client.name,
        color: client.color
      }
    });
  }

  sendMessage(client.ws, {
    type: 'profile_updated',
    name: client.name,
    color: client.color
  });
}

function handleDisconnect(clientId) {
  const client = clients.get(clientId);
  if (!client) return;

  removeClientFromDocument(client);
  clients.delete(clientId);
}

function removeClientFromDocument(client) {
  if (!client.docId) return;

  const docData = documents.get(client.docId);
  if (docData) {
    docData.clients.delete(client.id);
    
    broadcastToDocument(client.docId, {
      type: 'user_left',
      userId: client.id
    });

    if (docData.clients.size === 0) {
      documents.delete(client.docId);
      operationQueues.delete(client.docId);
      documentLocks.delete(client.docId);
    }
  }

  client.docId = null;
  client.branchId = null;
  client.cursor = null;
}

function getUsersInDocument(docId) {
  const docData = documents.get(docId);
  if (!docData) return [];

  const users = [];
  for (const clientId of docData.clients) {
    const client = clients.get(clientId);
    if (client) {
      users.push({
        id: client.id,
        name: client.name,
        color: client.color,
        cursor: client.cursor,
        branchId: client.branchId
      });
    }
  }
  return users;
}

function broadcastToDocument(docId, message, excludeClientId = null) {
  const docData = documents.get(docId);
  if (!docData) return;

  for (const clientId of docData.clients) {
    if (clientId === excludeClientId) continue;
    
    const client = clients.get(clientId);
    if (client && client.ws.readyState === 1) {
      sendMessage(client.ws, message);
    }
  }
}

function broadcastToBranch(docId, branchId, message, excludeClientId = null) {
  const docData = documents.get(docId);
  if (!docData) return;

  for (const clientId of docData.clients) {
    if (clientId === excludeClientId) continue;
    
    const client = clients.get(clientId);
    if (client && client.branchId === branchId && client.ws.readyState === 1) {
      sendMessage(client.ws, message);
    }
  }
}

function sendMessage(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws, error) {
  sendMessage(ws, {
    type: 'error',
    message: error
  });
}

function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
