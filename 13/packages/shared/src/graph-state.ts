import type {
  Node,
  Edge,
  GraphState,
  Operation,
  SerializedGraphState,
  OperationHistoryEntry,
  Tombstone,
} from './types';

export class GraphStateManager {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private tombstones: Map<string, Tombstone> = new Map();
  private version: number = 0;
  private history: OperationHistoryEntry[] = [];
  private sequenceNumber: number = 0;

  constructor(initialState?: SerializedGraphState) {
    if (initialState) {
      this.loadSerializedState(initialState);
    }
  }

  getVersion(): number {
    return this.version;
  }

  getNodes(): Map<string, Node> {
    return new Map(this.nodes);
  }

  getEdges(): Map<string, Edge> {
    return new Map(this.edges);
  }

  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): Edge | undefined {
    return this.edges.get(id);
  }

  getTombstones(): Map<string, Tombstone> {
    return new Map(this.tombstones);
  }

  hasTombstone(nodeId: string): boolean {
    return this.tombstones.has(nodeId);
  }

  getTombstone(nodeId: string): Tombstone | undefined {
    return this.tombstones.get(nodeId);
  }

  getState(): GraphState {
    return {
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      version: this.version,
    };
  }

  getSerializedState(): SerializedGraphState {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      tombstones: Array.from(this.tombstones.values()),
      version: this.version,
    };
  }

  getHistory(): OperationHistoryEntry[] {
    return [...this.history];
  }

  getHistoryEntry(sequenceNumber: number): OperationHistoryEntry | undefined {
    return this.history.find((entry) => entry.sequenceNumber === sequenceNumber);
  }

  getHistoryCount(): number {
    return this.history.length;
  }

  applyOperation(operation: Operation): boolean {
    if (operation.version !== this.version) {
      return false;
    }

    const success = this.executeOperation(operation);
    if (!success) {
      return false;
    }

    this.version++;
    this.history.push({
      operation,
      sequenceNumber: this.sequenceNumber++,
      timestamp: operation.timestamp,
    });

    return true;
  }

  replayToVersion(targetVersion: number): SerializedGraphState | null {
    if (targetVersion < 0 || targetVersion > this.history.length) {
      return null;
    }

    const manager = new GraphStateManager();

    for (let i = 0; i < targetVersion; i++) {
      const entry = this.history[i];
      if (!manager.executeOperation(entry.operation)) {
        return null;
      }
      manager.version = entry.operation.version + 1;
    }

    return manager.getSerializedState();
  }

  replayToSequence(targetSequence: number): SerializedGraphState | null {
    const entryIndex = this.history.findIndex(
      (entry) => entry.sequenceNumber === targetSequence,
    );

    if (entryIndex === -1) {
      return null;
    }

    return this.replayToVersion(entryIndex + 1);
  }

  replayToTimestamp(targetTimestamp: number): SerializedGraphState | null {
    const entryIndex = this.history.findIndex(
      (entry) => entry.timestamp > targetTimestamp,
    );

    const targetIndex = entryIndex === -1 ? this.history.length : entryIndex;
    return this.replayToVersion(targetIndex);
  }

  private executeOperation(operation: Operation): boolean {
    switch (operation.type) {
      case 'addNode':
        return this.executeAddNode(operation);

      case 'deleteNode':
        return this.executeDeleteNode(operation);

      case 'moveNode':
        return this.executeMoveNode(operation);

      case 'updateNodeLabel':
        return this.executeUpdateNodeLabel(operation);

      case 'addEdge':
        return this.executeAddEdge(operation);

      case 'deleteEdge':
        return this.executeDeleteEdge(operation);

      case 'updateEdgeLabel':
        return this.executeUpdateEdgeLabel(operation);

      default:
        return false;
    }
  }

  private executeAddNode(op: Operation & { type: 'addNode' }): boolean {
    if (this.nodes.has(op.nodeId)) {
      return false;
    }

    if (this.tombstones.has(op.nodeId)) {
      return false;
    }

    const node: Node = {
      id: op.nodeId,
      label: op.label,
      x: op.x,
      y: op.y,
      color: op.color,
      createdAt: op.timestamp,
    };

    this.nodes.set(op.nodeId, node);
    return true;
  }

  private executeDeleteNode(op: Operation & { type: 'deleteNode' }): boolean {
    if (!this.nodes.has(op.nodeId)) {
      return false;
    }

    const edgesToRemove: string[] = [];
    this.edges.forEach((edge, edgeId) => {
      if (edge.sourceId === op.nodeId || edge.targetId === op.nodeId) {
        edgesToRemove.push(edgeId);
      }
    });

    edgesToRemove.forEach((edgeId) => this.edges.delete(edgeId));
    this.nodes.delete(op.nodeId);

    const tombstone: Tombstone = {
      id: op.nodeId,
      deletedAt: op.timestamp,
      deletedBy: op.userId,
    };
    this.tombstones.set(op.nodeId, tombstone);

    return true;
  }

  private executeMoveNode(op: Operation & { type: 'moveNode' }): boolean {
    const node = this.nodes.get(op.nodeId);
    if (!node) {
      return false;
    }

    node.x = op.toX;
    node.y = op.toY;

    return true;
  }

  private executeUpdateNodeLabel(
    op: Operation & { type: 'updateNodeLabel' },
  ): boolean {
    const node = this.nodes.get(op.nodeId);
    if (!node) {
      return false;
    }

    node.label = op.newLabel;
    return true;
  }

  private executeAddEdge(op: Operation & { type: 'addEdge' }): boolean {
    if (!this.nodes.has(op.sourceId) || !this.nodes.has(op.targetId)) {
      return false;
    }

    if (this.tombstones.has(op.sourceId) || this.tombstones.has(op.targetId)) {
      return false;
    }

    if (this.edges.has(op.edgeId)) {
      return false;
    }

    const edge: Edge = {
      id: op.edgeId,
      sourceId: op.sourceId,
      targetId: op.targetId,
      label: op.label,
      createdAt: op.timestamp,
    };

    this.edges.set(op.edgeId, edge);
    return true;
  }

  private executeDeleteEdge(op: Operation & { type: 'deleteEdge' }): boolean {
    if (!this.edges.has(op.edgeId)) {
      return false;
    }

    this.edges.delete(op.edgeId);
    return true;
  }

  private executeUpdateEdgeLabel(
    op: Operation & { type: 'updateEdgeLabel' },
  ): boolean {
    const edge = this.edges.get(op.edgeId);
    if (!edge) {
      return false;
    }

    edge.label = op.newLabel;
    return true;
  }

  private loadSerializedState(state: SerializedGraphState): void {
    this.nodes.clear();
    this.edges.clear();
    this.tombstones.clear();

    state.nodes.forEach((node) => {
      this.nodes.set(node.id, { ...node });
    });

    state.edges.forEach((edge) => {
      this.edges.set(edge.id, { ...edge });
    });

    if (state.tombstones) {
      state.tombstones.forEach((tombstone) => {
        this.tombstones.set(tombstone.id, { ...tombstone });
      });
    }

    this.version = state.version;
    this.history = [];
    this.sequenceNumber = 0;
  }

  getStateSummary(): {
    nodeCount: number;
    edgeCount: number;
    tombstoneCount: number;
    version: number;
    historySize: number;
  } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      tombstoneCount: this.tombstones.size,
      version: this.version,
      historySize: this.history.length,
    };
  }

  canApplyOperation(operation: Operation): boolean {
    switch (operation.type) {
      case 'addNode':
        return !this.nodes.has(operation.nodeId) &&
               !this.tombstones.has(operation.nodeId);

      case 'deleteNode':
      case 'moveNode':
      case 'updateNodeLabel':
        return this.nodes.has(operation.nodeId);

      case 'addEdge':
        return this.nodes.has(operation.sourceId) &&
               this.nodes.has(operation.targetId) &&
               !this.tombstones.has(operation.sourceId) &&
               !this.tombstones.has(operation.targetId) &&
               !this.edges.has(operation.edgeId);

      case 'deleteEdge':
      case 'updateEdgeLabel':
        return this.edges.has(operation.edgeId);

      default:
        return true;
    }
  }
}
