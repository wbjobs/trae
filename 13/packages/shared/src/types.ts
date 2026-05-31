export interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  createdAt: number;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  createdAt: number;
}

export interface GraphState {
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  version: number;
}

export type OperationType =
  | 'addNode'
  | 'deleteNode'
  | 'moveNode'
  | 'updateNodeLabel'
  | 'addEdge'
  | 'deleteEdge'
  | 'updateEdgeLabel';

export interface BaseOperation {
  type: OperationType;
  id: string;
  userId: string;
  timestamp: number;
  version: number;
  graphId: string;
}

export interface AddNodeOperation extends BaseOperation {
  type: 'addNode';
  nodeId: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

export interface DeleteNodeOperation extends BaseOperation {
  type: 'deleteNode';
  nodeId: string;
  tombstone?: {
    id: string;
    deletedAt: number;
    deletedBy: string;
  };
}

export interface MoveNodeOperation extends BaseOperation {
  type: 'moveNode';
  nodeId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface UpdateNodeLabelOperation extends BaseOperation {
  type: 'updateNodeLabel';
  nodeId: string;
  oldLabel: string;
  newLabel: string;
}

export interface AddEdgeOperation extends BaseOperation {
  type: 'addEdge';
  edgeId: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface DeleteEdgeOperation extends BaseOperation {
  type: 'deleteEdge';
  edgeId: string;
  sourceId: string;
  targetId: string;
}

export interface UpdateEdgeLabelOperation extends BaseOperation {
  type: 'updateEdgeLabel';
  edgeId: string;
  oldLabel: string;
  newLabel: string;
}

export type Operation =
  | AddNodeOperation
  | DeleteNodeOperation
  | MoveNodeOperation
  | UpdateNodeLabelOperation
  | AddEdgeOperation
  | DeleteEdgeOperation
  | UpdateEdgeLabelOperation;

export interface Tombstone {
  id: string;
  deletedAt: number;
  deletedBy: string;
}

export interface OperationWithTransform extends Operation {
  transformedAgainst: string[];
}

export interface SerializedGraphState {
  nodes: Node[];
  edges: Edge[];
  tombstones: Tombstone[];
  version: number;
}

export interface OperationHistoryEntry {
  operation: Operation;
  sequenceNumber: number;
  timestamp: number;
}

export interface UserCursor {
  userId: string;
  x: number;
  y: number;
  selectedNodeId?: string;
  selectedEdgeId?: string;
}

export interface Branch {
  id: string;
  name: string;
  graphId: string;
  isMain: boolean;
  parentBranchId: string | null;
  parentCommitId: string | null;
  parentVersion: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  currentVersion: number;
  operationCount: number;
  description?: string;
}

export interface Commit {
  id: string;
  branchId: string;
  graphId: string;
  version: number;
  sequenceNumber: number;
  parentCommitId: string | null;
  message: string;
  author: string;
  createdAt: number;
  operationIds: string[];
  stateSnapshotId?: string;
}

export interface MergeConflict {
  type: 'node' | 'edge';
  targetId: string;
  operations: Operation[];
  resolutions: Array<'ours' | 'theirs' | 'both'>;
  autoResolved: boolean;
}

export interface MergeResult {
  success: boolean;
  targetBranchId: string;
  sourceBranchId: string;
  baseCommitId: string | null;
  conflicts: MergeConflict[];
  mergedOperations: Operation[];
  newVersion: number;
  message: string;
}

export interface MergeRequest {
  graphId: string;
  sourceBranchId: string;
  targetBranchId: string;
  mergeStrategy: 'ours' | 'theirs' | 'auto';
  createdBy: string;
  message?: string;
}

export interface BranchState {
  branch: Branch;
  currentCommit: Commit | null;
  state: SerializedGraphState;
}
