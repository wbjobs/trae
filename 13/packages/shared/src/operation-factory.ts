import type {
  Operation,
  AddNodeOperation,
  DeleteNodeOperation,
  MoveNodeOperation,
  UpdateNodeLabelOperation,
  AddEdgeOperation,
  DeleteEdgeOperation,
  UpdateEdgeLabelOperation,
} from './types';

export class OperationFactory {
  static generateId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static generateEdgeId(): string {
    return `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static createAddNode(params: {
    userId: string;
    graphId: string;
    version: number;
    label: string;
    x: number;
    y: number;
    color?: string;
    nodeId?: string;
  }): AddNodeOperation {
    return {
      type: 'addNode',
      id: this.generateId(),
      userId: params.userId,
      timestamp: Date.now(),
      version: params.version,
      graphId: params.graphId,
      nodeId: params.nodeId || this.generateNodeId(),
      label: params.label,
      x: params.x,
      y: params.y,
      color: params.color || this.getRandomColor(),
    };
  }

  static createDeleteNode(params: {
    userId: string;
    graphId: string;
    version: number;
    nodeId: string;
  }): DeleteNodeOperation {
    return {
      type: 'deleteNode',
      id: this.generateId(),
      userId: params.userId,
      timestamp: Date.now(),
      version: params.version,
      graphId: params.graphId,
      nodeId: params.nodeId,
    };
  }

  static createMoveNode(params: {
    userId: string;
    graphId: string;
    version: number;
    nodeId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }): MoveNodeOperation {
    return {
      type: 'moveNode',
      id: this.generateId(),
      userId: params.userId,
      timestamp: Date.now(),
      version: params.version,
      graphId: params.graphId,
      nodeId: params.nodeId,
      fromX: params.fromX,
      fromY: params.fromY,
      toX: params.toX,
      toY: params.toY,
    };
  }

  static createUpdateNodeLabel(params: {
    userId: string;
    graphId: string;
    version: number;
    nodeId: string;
    oldLabel: string;
    newLabel: string;
  }): UpdateNodeLabelOperation {
    return {
      type: 'updateNodeLabel',
      id: this.generateId(),
      userId: params.userId,
      timestamp: Date.now(),
      version: params.version,
      graphId: params.graphId,
      nodeId: params.nodeId,
      oldLabel: params.oldLabel,
      newLabel: params.newLabel,
    };
  }

  static createAddEdge(params: {
    userId: string;
    graphId: string;
    version: number;
    sourceId: string;
    targetId: string;
    label?: string;
    edgeId?: string;
  }): AddEdgeOperation {
    return {
      type: 'addEdge',
      id: this.generateId(),
      userId: params.userId,
      timestamp: Date.now(),
      version: params.version,
      graphId: params.graphId,
      edgeId: params.edgeId || this.generateEdgeId(),
      sourceId: params.sourceId,
      targetId: params.targetId,
      label: params.label,
    };
  }

  static createDeleteEdge(params: {
    userId: string;
    graphId: string;
    version: number;
    edgeId: string;
    sourceId: string;
    targetId: string;
  }): DeleteEdgeOperation {
    return {
      type: 'deleteEdge',
      id: this.generateId(),
      userId: params.userId,
      timestamp: Date.now(),
      version: params.version,
      graphId: params.graphId,
      edgeId: params.edgeId,
      sourceId: params.sourceId,
      targetId: params.targetId,
    };
  }

  static createUpdateEdgeLabel(params: {
    userId: string;
    graphId: string;
    version: number;
    edgeId: string;
    oldLabel: string;
    newLabel: string;
  }): UpdateEdgeLabelOperation {
    return {
      type: 'updateEdgeLabel',
      id: this.generateId(),
      userId: params.userId,
      timestamp: Date.now(),
      version: params.version,
      graphId: params.graphId,
      edgeId: params.edgeId,
      oldLabel: params.oldLabel,
      newLabel: params.newLabel,
    };
  }

  static cloneOperation(op: Operation): Operation {
    return { ...op };
  }

  static withVersion(op: Operation, version: number): Operation {
    return { ...op, version };
  }

  static withTimestamp(op: Operation, timestamp: number): Operation {
    return { ...op, timestamp };
  }

  static getRandomColor(): string {
    const colors = [
      '#3498db',
      '#e74c3c',
      '#2ecc71',
      '#f39c12',
      '#9b59b6',
      '#1abc9c',
      '#e67e22',
      '#34495e',
      '#00bcd4',
      '#ff5722',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  static getOperationSummary(op: Operation): string {
    switch (op.type) {
      case 'addNode':
        return `Add node "${op.label}" (${op.nodeId})`;
      case 'deleteNode':
        return `Delete node (${op.nodeId})`;
      case 'moveNode':
        return `Move node (${op.nodeId}) from (${op.fromX}, ${op.fromY}) to (${op.toX}, ${op.toY})`;
      case 'updateNodeLabel':
        return `Update node label (${op.nodeId}): "${op.oldLabel}" → "${op.newLabel}"`;
      case 'addEdge':
        return `Add edge from ${op.sourceId} to ${op.targetId}`;
      case 'deleteEdge':
        return `Delete edge (${op.edgeId})`;
      case 'updateEdgeLabel':
        return `Update edge label (${op.edgeId}): "${op.oldLabel}" → "${op.newLabel}"`;
      default:
        return `Unknown operation`;
    }
  }
}
