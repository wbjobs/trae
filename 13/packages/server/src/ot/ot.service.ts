import { Injectable, Logger } from '@nestjs/common';
import {
  OTTransformer,
  GraphStateManager,
  OperationFactory,
} from '@collaborative-graph/shared';
import type {
  Operation,
  SerializedGraphState,
  OperationHistoryEntry,
} from '@collaborative-graph/shared';

@Injectable()
export class OTService {
  private readonly logger = new Logger(OTService.name);
  private readonly transformer = new OTTransformer();
  private readonly stateManagers = new Map<string, GraphStateManager>();
  private readonly pendingOperations = new Map<string, Operation[]>();

  getOrCreateStateManager(graphId: string): GraphStateManager {
    let manager = this.stateManagers.get(graphId);
    if (!manager) {
      manager = new GraphStateManager();
      this.stateManagers.set(graphId, manager);
    }
    return manager;
  }

  setStateManager(graphId: string, state: SerializedGraphState): void {
    const manager = new GraphStateManager(state);
    this.stateManagers.set(graphId, manager);
  }

  getCurrentState(graphId: string): SerializedGraphState {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.getSerializedState();
  }

  getCurrentVersion(graphId: string): number {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.getVersion();
  }

  getHistory(graphId: string): OperationHistoryEntry[] {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.getHistory();
  }

  getHistoryCount(graphId: string): number {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.getHistoryCount();
  }

  replayToVersion(
    graphId: string,
    version: number,
  ): SerializedGraphState | null {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.replayToVersion(version);
  }

  replayToSequence(
    graphId: string,
    sequenceNumber: number,
  ): SerializedGraphState | null {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.replayToSequence(sequenceNumber);
  }

  replayToTimestamp(
    graphId: string,
    timestamp: number,
  ): SerializedGraphState | null {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.replayToTimestamp(timestamp);
  }

  processOperation(
    graphId: string,
    operation: Operation,
  ): {
    applied: boolean;
    transformedOperation?: Operation;
    conflicts: Operation[];
    currentState: SerializedGraphState;
  } {
    const manager = this.getOrCreateStateManager(graphId);
    const currentVersion = manager.getVersion();

    this.logger.debug(
      `Processing operation ${operation.id} for graph ${graphId} at version ${operation.version}, current version: ${currentVersion}`,
    );

    if (operation.version === currentVersion) {
      const applied = manager.applyOperation(operation);
      return {
        applied,
        transformedOperation: applied ? operation : undefined,
        conflicts: [],
        currentState: manager.getSerializedState(),
      };
    }

    if (operation.version < currentVersion) {
      return this.transformAgainstHistory(
        graphId,
        operation,
        manager,
        currentVersion,
      );
    }

    return {
      applied: false,
      conflicts: [],
      currentState: manager.getSerializedState(),
    };
  }

  private transformAgainstHistory(
    graphId: string,
    operation: Operation,
    manager: GraphStateManager,
    currentVersion: number,
  ): {
    applied: boolean;
    transformedOperation?: Operation;
    conflicts: Operation[];
    currentState: SerializedGraphState;
  } {
    const history = manager.getHistory();
    const operationsToTransform = history.slice(operation.version);
    let transformedOp = { ...operation };
    const conflicts: Operation[] = [];

    this.logger.debug(
      `Transforming operation against ${operationsToTransform.length} historical operations`,
    );

    const context = {
      nodes: new Set(manager.getNodes().keys()),
      edges: new Set(manager.getEdges().keys()),
      tombstones: manager.getTombstones(),
    };

    for (const entry of operationsToTransform) {
      const serverOp = entry.operation;
      const [transformedServer, newTransformedOp] = this.transformer.transformWithContext(
        serverOp,
        transformedOp,
        context,
      );

      if (this.isConflict(serverOp, transformedOp)) {
        conflicts.push(serverOp);
      }

      transformedOp = newTransformedOp;
    }

    const applied = manager.applyOperation(transformedOp);

    this.logger.debug(
      `Operation transformed and ${applied ? 'applied' : 'rejected'}, conflicts: ${conflicts.length}`,
    );

    return {
      applied,
      transformedOperation: applied ? transformedOp : undefined,
      conflicts,
      currentState: manager.getSerializedState(),
    };
  }

  private isConflict(op1: Operation, op2: Operation): boolean {
    if (op1.type === 'deleteNode' && op2.type === 'addNode') {
      return op1.nodeId === op2.nodeId;
    }

    if (op1.type === 'addNode' && op2.type === 'deleteNode') {
      return op1.nodeId === op2.nodeId;
    }

    if (op1.type === 'deleteEdge' && op2.type === 'addEdge') {
      return op1.edgeId === op2.edgeId;
    }

    if (op1.type === 'addEdge' && op2.type === 'deleteEdge') {
      return op1.edgeId === op2.edgeId;
    }

    return false;
  }

  canApplyOperation(graphId: string, operation: Operation): boolean {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.canApplyOperation(operation);
  }

  getStateSummary(graphId: string): {
    nodeCount: number;
    edgeCount: number;
    version: number;
    historySize: number;
  } {
    const manager = this.getOrCreateStateManager(graphId);
    return manager.getStateSummary();
  }

  clearGraphState(graphId: string): void {
    this.stateManagers.delete(graphId);
    this.pendingOperations.delete(graphId);
    this.logger.log(`Cleared state for graph ${graphId}`);
  }

  addPendingOperation(graphId: string, operation: Operation): void {
    if (!this.pendingOperations.has(graphId)) {
      this.pendingOperations.set(graphId, []);
    }
    this.pendingOperations.get(graphId)!.push(operation);
  }

  getPendingOperations(graphId: string): Operation[] {
    return this.pendingOperations.get(graphId) || [];
  }

  clearPendingOperations(graphId: string): void {
    this.pendingOperations.delete(graphId);
  }
}
