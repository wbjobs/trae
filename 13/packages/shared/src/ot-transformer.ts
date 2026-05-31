import type {
  Operation,
  AddNodeOperation,
  DeleteNodeOperation,
  MoveNodeOperation,
  UpdateNodeLabelOperation,
  AddEdgeOperation,
  DeleteEdgeOperation,
  UpdateEdgeLabelOperation,
  Tombstone,
} from './types';

export interface TransformContext {
  nodes: Set<string>;
  edges: Set<string>;
  tombstones: Map<string, Tombstone>;
}

export class OTTransformer {
  transform(
    serverOp: Operation,
    clientOp: Operation,
  ): [Operation, Operation] {
    const [transformedServer, transformedClient] = this.transformPair(
      serverOp,
      clientOp,
    );

    return [
      { ...transformedServer, version: clientOp.version + 1 },
      { ...transformedClient, version: serverOp.version + 1 },
    ];
  }

  private transformPair(
    op1: Operation,
    op2: Operation,
  ): [Operation, Operation] {
    if (op1.type === 'addNode' && op2.type === 'addNode') {
      return this.transformAddNodeAddNode(op1, op2);
    }
    if (op1.type === 'addNode' && op2.type === 'deleteNode') {
      return this.transformAddNodeDeleteNode(op1, op2);
    }
    if (op1.type === 'addNode' && op2.type === 'moveNode') {
      return this.transformAddNodeMoveNode(op1, op2);
    }
    if (op1.type === 'addNode' && op2.type === 'updateNodeLabel') {
      return this.transformAddNodeUpdateNodeLabel(op1, op2);
    }
    if (op1.type === 'addNode' && op2.type === 'addEdge') {
      return this.transformAddNodeAddEdge(op1, op2);
    }
    if (op1.type === 'addNode' && op2.type === 'deleteEdge') {
      return this.transformAddNodeDeleteEdge(op1, op2);
    }
    if (op1.type === 'addNode' && op2.type === 'updateEdgeLabel') {
      return [op1, op2];
    }

    if (op1.type === 'deleteNode' && op2.type === 'addNode') {
      const [b, a] = this.transformAddNodeDeleteNode(op2, op1);
      return [a, b];
    }
    if (op1.type === 'deleteNode' && op2.type === 'deleteNode') {
      return this.transformDeleteNodeDeleteNode(op1, op2);
    }
    if (op1.type === 'deleteNode' && op2.type === 'moveNode') {
      return this.transformDeleteNodeMoveNode(op1, op2);
    }
    if (op1.type === 'deleteNode' && op2.type === 'updateNodeLabel') {
      return this.transformDeleteNodeUpdateNodeLabel(op1, op2);
    }
    if (op1.type === 'deleteNode' && op2.type === 'addEdge') {
      return this.transformDeleteNodeAddEdge(op1, op2);
    }
    if (op1.type === 'deleteNode' && op2.type === 'deleteEdge') {
      return this.transformDeleteNodeDeleteEdge(op1, op2);
    }
    if (op1.type === 'deleteNode' && op2.type === 'updateEdgeLabel') {
      return this.transformDeleteNodeUpdateEdgeLabel(op1, op2);
    }

    if (op1.type === 'moveNode' && op2.type === 'addNode') {
      const [b, a] = this.transformAddNodeMoveNode(op2, op1);
      return [a, b];
    }
    if (op1.type === 'moveNode' && op2.type === 'deleteNode') {
      const [b, a] = this.transformDeleteNodeMoveNode(op2, op1);
      return [a, b];
    }
    if (op1.type === 'moveNode' && op2.type === 'moveNode') {
      return this.transformMoveNodeMoveNode(op1, op2);
    }
    if (op1.type === 'moveNode' && op2.type === 'updateNodeLabel') {
      return this.transformMoveNodeUpdateNodeLabel(op1, op2);
    }
    if (op1.type === 'moveNode' && op2.type === 'addEdge') {
      return [op1, op2];
    }
    if (op1.type === 'moveNode' && op2.type === 'deleteEdge') {
      return [op1, op2];
    }
    if (op1.type === 'moveNode' && op2.type === 'updateEdgeLabel') {
      return [op1, op2];
    }

    if (op1.type === 'updateNodeLabel' && op2.type === 'addNode') {
      const [b, a] = this.transformAddNodeUpdateNodeLabel(op2, op1);
      return [a, b];
    }
    if (op1.type === 'updateNodeLabel' && op2.type === 'deleteNode') {
      const [b, a] = this.transformDeleteNodeUpdateNodeLabel(op2, op1);
      return [a, b];
    }
    if (op1.type === 'updateNodeLabel' && op2.type === 'moveNode') {
      const [b, a] = this.transformMoveNodeUpdateNodeLabel(op2, op1);
      return [a, b];
    }
    if (op1.type === 'updateNodeLabel' && op2.type === 'updateNodeLabel') {
      return this.transformUpdateNodeLabelUpdateNodeLabel(op1, op2);
    }
    if (op1.type === 'updateNodeLabel' && op2.type === 'addEdge') {
      return [op1, op2];
    }
    if (op1.type === 'updateNodeLabel' && op2.type === 'deleteEdge') {
      return [op1, op2];
    }
    if (op1.type === 'updateNodeLabel' && op2.type === 'updateEdgeLabel') {
      return [op1, op2];
    }

    if (op1.type === 'addEdge' && op2.type === 'addNode') {
      const [b, a] = this.transformAddNodeAddEdge(op2, op1);
      return [a, b];
    }
    if (op1.type === 'addEdge' && op2.type === 'deleteNode') {
      const [b, a] = this.transformDeleteNodeAddEdge(op2, op1);
      return [a, b];
    }
    if (op1.type === 'addEdge' && op2.type === 'moveNode') {
      return [op1, op2];
    }
    if (op1.type === 'addEdge' && op2.type === 'updateNodeLabel') {
      return [op1, op2];
    }
    if (op1.type === 'addEdge' && op2.type === 'addEdge') {
      return this.transformAddEdgeAddEdge(op1, op2);
    }
    if (op1.type === 'addEdge' && op2.type === 'deleteEdge') {
      return this.transformAddEdgeDeleteEdge(op1, op2);
    }
    if (op1.type === 'addEdge' && op2.type === 'updateEdgeLabel') {
      return this.transformAddEdgeUpdateEdgeLabel(op1, op2);
    }

    if (op1.type === 'deleteEdge' && op2.type === 'addNode') {
      const [b, a] = this.transformAddNodeDeleteEdge(op2, op1);
      return [a, b];
    }
    if (op1.type === 'deleteEdge' && op2.type === 'deleteNode') {
      const [b, a] = this.transformDeleteNodeDeleteEdge(op2, op1);
      return [a, b];
    }
    if (op1.type === 'deleteEdge' && op2.type === 'moveNode') {
      return [op1, op2];
    }
    if (op1.type === 'deleteEdge' && op2.type === 'updateNodeLabel') {
      return [op1, op2];
    }
    if (op1.type === 'deleteEdge' && op2.type === 'addEdge') {
      const [b, a] = this.transformAddEdgeDeleteEdge(op2, op1);
      return [a, b];
    }
    if (op1.type === 'deleteEdge' && op2.type === 'deleteEdge') {
      return this.transformDeleteEdgeDeleteEdge(op1, op2);
    }
    if (op1.type === 'deleteEdge' && op2.type === 'updateEdgeLabel') {
      return this.transformDeleteEdgeUpdateEdgeLabel(op1, op2);
    }

    if (op1.type === 'updateEdgeLabel' && op2.type === 'addNode') {
      return [op1, op2];
    }
    if (op1.type === 'updateEdgeLabel' && op2.type === 'deleteNode') {
      const [b, a] = this.transformDeleteNodeUpdateEdgeLabel(op2, op1);
      return [a, b];
    }
    if (op1.type === 'updateEdgeLabel' && op2.type === 'moveNode') {
      return [op1, op2];
    }
    if (op1.type === 'updateEdgeLabel' && op2.type === 'updateNodeLabel') {
      return [op1, op2];
    }
    if (op1.type === 'updateEdgeLabel' && op2.type === 'addEdge') {
      const [b, a] = this.transformAddEdgeUpdateEdgeLabel(op2, op1);
      return [a, b];
    }
    if (op1.type === 'updateEdgeLabel' && op2.type === 'deleteEdge') {
      const [b, a] = this.transformDeleteEdgeUpdateEdgeLabel(op2, op1);
      return [a, b];
    }
    if (op1.type === 'updateEdgeLabel' && op2.type === 'updateEdgeLabel') {
      return this.transformUpdateEdgeLabelUpdateEdgeLabel(op1, op2);
    }

    return [op1, op2];
  }

  private transformAddNodeAddNode(
    op1: AddNodeOperation,
    op2: AddNodeOperation,
  ): [AddNodeOperation, AddNodeOperation] {
    if (op1.nodeId === op2.nodeId) {
      if (op1.timestamp < op2.timestamp) {
        return [op1, op2];
      }
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformAddNodeDeleteNode(
    op1: AddNodeOperation,
    op2: DeleteNodeOperation,
  ): [AddNodeOperation, DeleteNodeOperation] {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformAddNodeMoveNode(
    op1: AddNodeOperation,
    op2: MoveNodeOperation,
  ): [AddNodeOperation, MoveNodeOperation] {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformAddNodeUpdateNodeLabel(
    op1: AddNodeOperation,
    op2: UpdateNodeLabelOperation,
  ): [AddNodeOperation, UpdateNodeLabelOperation] {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformAddNodeAddEdge(
    op1: AddNodeOperation,
    op2: AddEdgeOperation,
  ): [AddNodeOperation, AddEdgeOperation] {
    return [op1, op2];
  }

  private transformAddNodeDeleteEdge(
    op1: AddNodeOperation,
    op2: DeleteEdgeOperation,
  ): [AddNodeOperation, DeleteEdgeOperation] {
    return [op1, op2];
  }

  private transformDeleteNodeDeleteNode(
    op1: DeleteNodeOperation,
    op2: DeleteNodeOperation,
  ): [DeleteNodeOperation, DeleteNodeOperation] {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformDeleteNodeMoveNode(
    op1: DeleteNodeOperation,
    op2: MoveNodeOperation,
  ): [DeleteNodeOperation, MoveNodeOperation] {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformDeleteNodeUpdateNodeLabel(
    op1: DeleteNodeOperation,
    op2: UpdateNodeLabelOperation,
  ): [DeleteNodeOperation, UpdateNodeLabelOperation] {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformDeleteNodeAddEdge(
    op1: DeleteNodeOperation,
    op2: AddEdgeOperation,
  ): [DeleteNodeOperation, AddEdgeOperation] {
    if (op1.nodeId !== op2.sourceId && op1.nodeId !== op2.targetId) {
      return [op1, op2];
    }

    if (op1.timestamp < op2.timestamp) {
      const tombstone: Tombstone = {
        id: op1.nodeId,
        deletedAt: op1.timestamp,
        deletedBy: op1.userId,
      };

      const transformedOp1: DeleteNodeOperation = {
        ...op1,
        tombstone,
      };

      return [transformedOp1, op2];
    } else {
      return [op1, op2];
    }
  }

  private transformDeleteNodeDeleteEdge(
    op1: DeleteNodeOperation,
    op2: DeleteEdgeOperation,
  ): [DeleteNodeOperation, DeleteEdgeOperation] {
    return [op1, op2];
  }

  private transformDeleteNodeUpdateEdgeLabel(
    op1: DeleteNodeOperation,
    op2: UpdateEdgeLabelOperation,
  ): [DeleteNodeOperation, UpdateEdgeLabelOperation] {
    return [op1, op2];
  }

  private transformMoveNodeMoveNode(
    op1: MoveNodeOperation,
    op2: MoveNodeOperation,
  ): [MoveNodeOperation, MoveNodeOperation] {
    if (op1.nodeId !== op2.nodeId) {
      return [op1, op2];
    }

    if (op1.timestamp < op2.timestamp) {
      const transformedOp2: MoveNodeOperation = {
        ...op2,
        fromX: op1.toX,
        fromY: op1.toY,
      };
      return [op1, transformedOp2];
    } else {
      const transformedOp1: MoveNodeOperation = {
        ...op1,
        fromX: op2.toX,
        fromY: op2.toY,
      };
      return [transformedOp1, op2];
    }
  }

  private transformMoveNodeUpdateNodeLabel(
    op1: MoveNodeOperation,
    op2: UpdateNodeLabelOperation,
  ): [MoveNodeOperation, UpdateNodeLabelOperation] {
    if (op1.nodeId === op2.nodeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformUpdateNodeLabelUpdateNodeLabel(
    op1: UpdateNodeLabelOperation,
    op2: UpdateNodeLabelOperation,
  ): [UpdateNodeLabelOperation, UpdateNodeLabelOperation] {
    if (op1.nodeId !== op2.nodeId) {
      return [op1, op2];
    }

    if (op1.timestamp < op2.timestamp) {
      const transformedOp2: UpdateNodeLabelOperation = {
        ...op2,
        oldLabel: op1.newLabel,
      };
      return [op1, transformedOp2];
    } else {
      const transformedOp1: UpdateNodeLabelOperation = {
        ...op1,
        oldLabel: op2.newLabel,
      };
      return [transformedOp1, op2];
    }
  }

  private transformAddEdgeAddEdge(
    op1: AddEdgeOperation,
    op2: AddEdgeOperation,
  ): [AddEdgeOperation, AddEdgeOperation] {
    return [op1, op2];
  }

  private transformAddEdgeDeleteEdge(
    op1: AddEdgeOperation,
    op2: DeleteEdgeOperation,
  ): [AddEdgeOperation, DeleteEdgeOperation] {
    if (op1.edgeId === op2.edgeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformAddEdgeUpdateEdgeLabel(
    op1: AddEdgeOperation,
    op2: UpdateEdgeLabelOperation,
  ): [AddEdgeOperation, UpdateEdgeLabelOperation] {
    if (op1.edgeId === op2.edgeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformDeleteEdgeDeleteEdge(
    op1: DeleteEdgeOperation,
    op2: DeleteEdgeOperation,
  ): [DeleteEdgeOperation, DeleteEdgeOperation] {
    if (op1.edgeId === op2.edgeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformDeleteEdgeUpdateEdgeLabel(
    op1: DeleteEdgeOperation,
    op2: UpdateEdgeLabelOperation,
  ): [DeleteEdgeOperation, UpdateEdgeLabelOperation] {
    if (op1.edgeId === op2.edgeId) {
      return [op1, op2];
    }
    return [op1, op2];
  }

  private transformUpdateEdgeLabelUpdateEdgeLabel(
    op1: UpdateEdgeLabelOperation,
    op2: UpdateEdgeLabelOperation,
  ): [UpdateEdgeLabelOperation, UpdateEdgeLabelOperation] {
    if (op1.edgeId !== op2.edgeId) {
      return [op1, op2];
    }

    if (op1.timestamp < op2.timestamp) {
      const transformedOp2: UpdateEdgeLabelOperation = {
        ...op2,
        oldLabel: op1.newLabel,
      };
      return [op1, transformedOp2];
    } else {
      const transformedOp1: UpdateEdgeLabelOperation = {
        ...op1,
        oldLabel: op2.newLabel,
      };
      return [transformedOp1, op2];
    }
  }

  canApply(
    op: Operation,
    state: { nodes: Set<string>; edges: Set<string>; tombstones?: Map<string, Tombstone> },
  ): boolean {
    const tombstones = state.tombstones || new Map<string, Tombstone>();

    switch (op.type) {
      case 'addNode':
        return !state.nodes.has(op.nodeId) &&
               !tombstones.has(op.nodeId);

      case 'deleteNode':
      case 'moveNode':
      case 'updateNodeLabel':
        return state.nodes.has(op.nodeId);

      case 'addEdge':
        return state.nodes.has(op.sourceId) &&
               state.nodes.has(op.targetId) &&
               !tombstones.has(op.sourceId) &&
               !tombstones.has(op.targetId) &&
               !state.edges.has(op.edgeId);

      case 'deleteEdge':
      case 'updateEdgeLabel':
        return state.edges.has(op.edgeId);

      default:
        return true;
    }
  }

  transformWithContext(
    serverOp: Operation,
    clientOp: Operation,
    context: TransformContext,
  ): [Operation, Operation] {
    const [transformedServer, transformedClient] = this.transformPair(
      serverOp,
      clientOp,
    );

    const shouldInvalidateClient = this.shouldInvalidateAgainstTombstones(
      transformedClient,
      transformedServer,
    );

    if (shouldInvalidateClient) {
      return [
        { ...transformedServer, version: clientOp.version + 1 },
        transformedClient,
      ];
    }

    return [
      { ...transformedServer, version: clientOp.version + 1 },
      { ...transformedClient, version: serverOp.version + 1 },
    ];
  }

  private shouldInvalidateAgainstTombstones(
    clientOp: Operation,
    serverOp: Operation,
  ): boolean {
    if (clientOp.type !== 'addEdge') {
      return false;
    }

    if (serverOp.type !== 'deleteNode') {
      return false;
    }

    if (serverOp.nodeId === clientOp.sourceId || serverOp.nodeId === clientOp.targetId) {
      return true;
    }

    return false;
  }
}
