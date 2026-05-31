import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Node,
  Edge,
  Operation,
  SerializedGraphState,
  OperationHistoryEntry,
  UserCursor,
  Tombstone,
} from '@collaborative-graph/shared';

export const useGraphStore = defineStore('graph', () => {
  const graphId = ref<string | null>(null);
  const userId = ref<string>(generateUserId());

  const nodes = ref<Map<string, Node>>(new Map());
  const edges = ref<Map<string, Edge>>(new Map());
  const tombstones = ref<Map<string, Tombstone>>(new Map());
  const version = ref<number>(0);

  const connectedUsers = ref<string[]>([]);
  const userCursors = ref<Map<string, UserCursor>>(new Map());

  const history = ref<OperationHistoryEntry[]>([]);
  const isReplaying = ref<boolean>(false);
  const replayVersion = ref<number | null>(null);

  const selectedNodeId = ref<string | null>(null);
  const selectedEdgeId = ref<string | null>(null);

  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  const nodeCount = computed(() => nodes.value.size);
  const edgeCount = computed(() => edges.value.size);
  const historyCount = computed(() => history.value.length);

  function generateUserId(): string {
    const stored = localStorage.getItem('graph_user_id');
    if (stored) return stored;
    const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('graph_user_id', newId);
    return newId;
  }

  function setGraphState(state: SerializedGraphState): void {
    const nodeMap = new Map<string, Node>();
    state.nodes.forEach((node) => {
      nodeMap.set(node.id, { ...node });
    });
    nodes.value = nodeMap;

    const edgeMap = new Map<string, Edge>();
    state.edges.forEach((edge) => {
      edgeMap.set(edge.id, { ...edge });
    });
    edges.value = edgeMap;

    const tombstoneMap = new Map<string, Tombstone>();
    if (state.tombstones) {
      state.tombstones.forEach((tombstone) => {
        tombstoneMap.set(tombstone.id, { ...tombstone });
      });
    }
    tombstones.value = tombstoneMap;

    version.value = state.version;
  }

  function canApplyOperation(op: Operation): boolean {
    switch (op.type) {
      case 'addNode':
        return !nodes.value.has(op.nodeId) &&
               !tombstones.value.has(op.nodeId);

      case 'deleteNode':
      case 'moveNode':
      case 'updateNodeLabel':
        return nodes.value.has(op.nodeId);

      case 'addEdge':
        return nodes.value.has(op.sourceId) &&
               nodes.value.has(op.targetId) &&
               !tombstones.value.has(op.sourceId) &&
               !tombstones.value.has(op.targetId) &&
               !edges.value.has(op.edgeId);

      case 'deleteEdge':
      case 'updateEdgeLabel':
        return edges.value.has(op.edgeId);

      default:
        return true;
    }
  }

  function applyOperation(op: Operation): void {
    if (!canApplyOperation(op)) {
      return;
    }

    switch (op.type) {
      case 'addNode': {
        const node: Node = {
          id: op.nodeId,
          label: op.label,
          x: op.x,
          y: op.y,
          color: op.color,
          createdAt: op.timestamp,
        };
        nodes.value.set(op.nodeId, node);
        nodes.value = new Map(nodes.value);
        break;
      }

      case 'deleteNode': {
        nodes.value.delete(op.nodeId);
        nodes.value = new Map(nodes.value);

        const edgesToRemove: string[] = [];
        edges.value.forEach((edge) => {
          if (edge.sourceId === op.nodeId || edge.targetId === op.nodeId) {
            edgesToRemove.push(edge.id);
          }
        });
        edgesToRemove.forEach((id) => edges.value.delete(id));
        edges.value = new Map(edges.value);

        const tombstone: Tombstone = {
          id: op.nodeId,
          deletedAt: op.timestamp,
          deletedBy: op.userId,
        };
        tombstones.value.set(op.nodeId, tombstone);
        tombstones.value = new Map(tombstones.value);

        if (selectedNodeId.value === op.nodeId) {
          selectedNodeId.value = null;
        }
        break;
      }

      case 'moveNode': {
        const node = nodes.value.get(op.nodeId);
        if (node) {
          node.x = op.toX;
          node.y = op.toY;
          nodes.value = new Map(nodes.value);
        }
        break;
      }

      case 'updateNodeLabel': {
        const node = nodes.value.get(op.nodeId);
        if (node) {
          node.label = op.newLabel;
          nodes.value = new Map(nodes.value);
        }
        break;
      }

      case 'addEdge': {
        const edge: Edge = {
          id: op.edgeId,
          sourceId: op.sourceId,
          targetId: op.targetId,
          label: op.label,
          createdAt: op.timestamp,
        };
        edges.value.set(op.edgeId, edge);
        edges.value = new Map(edges.value);
        break;
      }

      case 'deleteEdge': {
        edges.value.delete(op.edgeId);
        edges.value = new Map(edges.value);

        if (selectedEdgeId.value === op.edgeId) {
          selectedEdgeId.value = null;
        }
        break;
      }

      case 'updateEdgeLabel': {
        const edge = edges.value.get(op.edgeId);
        if (edge) {
          edge.label = op.newLabel;
          edges.value = new Map(edges.value);
        }
        break;
      }
    }

    version.value = op.version + 1;
  }

  function addToHistory(entry: OperationHistoryEntry): void {
    history.value.push(entry);
  }

  function setHistory(newHistory: OperationHistoryEntry[]): void {
    history.value = [...newHistory];
  }

  function selectNode(nodeId: string | null): void {
    selectedNodeId.value = nodeId;
    selectedEdgeId.value = null;
  }

  function selectEdge(edgeId: string | null): void {
    selectedEdgeId.value = edgeId;
    selectedNodeId.value = null;
  }

  function clearSelection(): void {
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
  }

  function updateUserCursor(cursor: UserCursor): void {
    if (cursor.userId === userId.value) return;
    userCursors.value.set(cursor.userId, cursor);
    userCursors.value = new Map(userCursors.value);
  }

  function removeUserCursor(userIdToRemove: string): void {
    userCursors.value.delete(userIdToRemove);
    userCursors.value = new Map(userCursors.value);
  }

  function startReplay(targetVersion: number): void {
    isReplaying.value = true;
    replayVersion.value = targetVersion;
  }

  function stopReplay(): void {
    isReplaying.value = false;
    replayVersion.value = null;
  }

  function reset(): void {
    graphId.value = null;
    nodes.value = new Map();
    edges.value = new Map();
    tombstones.value = new Map();
    version.value = 0;
    connectedUsers.value = [];
    userCursors.value = new Map();
    history.value = [];
    isReplaying.value = false;
    replayVersion.value = null;
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
    error.value = null;
  }

  return {
    graphId,
    userId,
    nodes,
    edges,
    tombstones,
    version,
    connectedUsers,
    userCursors,
    history,
    isReplaying,
    replayVersion,
    selectedNodeId,
    selectedEdgeId,
    isLoading,
    error,
    nodeCount,
    edgeCount,
    historyCount,
    setGraphState,
    applyOperation,
    canApplyOperation,
    addToHistory,
    setHistory,
    selectNode,
    selectEdge,
    clearSelection,
    updateUserCursor,
    removeUserCursor,
    startReplay,
    stopReplay,
    reset,
  };
});
