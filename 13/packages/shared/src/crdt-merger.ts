import type {
  Operation,
  Node,
  Edge,
  MergeConflict,
  MergeResult,
  SerializedGraphState,
  Tombstone,
} from './types';

export interface MergeConfig {
  conflictStrategy: 'ours' | 'theirs' | 'auto' | 'manual';
  nodeConflictResolution: 'keep-both' | 'ours' | 'theirs';
  edgeConflictResolution: 'keep-both' | 'ours' | 'theirs';
  labelConflictResolution: 'newer-timestamp' | 'ours' | 'theirs' | 'concatenate';
  positionConflictResolution: 'average' | 'newer-timestamp' | 'ours' | 'theirs';
}

export const defaultMergeConfig: MergeConfig = {
  conflictStrategy: 'auto',
  nodeConflictResolution: 'keep-both',
  edgeConflictResolution: 'keep-both',
  labelConflictResolution: 'newer-timestamp',
  positionConflictResolution: 'newer-timestamp',
};

interface NodeChanges {
  added: Map<string, Operation>;
  deleted: Map<string, Operation>;
  moved: Map<string, Operation>;
  relabeled: Map<string, Operation>;
}

interface EdgeChanges {
  added: Map<string, Operation>;
  deleted: Map<string, Operation>;
  relabeled: Map<string, Operation>;
}

export class CRDTMerger {
  private config: MergeConfig;

  constructor(config: Partial<MergeConfig> = {}) {
    this.config = { ...defaultMergeConfig, ...config };
  }

  merge(
    sourceBranchOperations: Operation[],
    targetBranchOperations: Operation[],
    baseOperations: Operation[],
    baseState: SerializedGraphState,
    mergeStrategy: 'ours' | 'theirs' | 'auto' = 'auto',
  ): MergeResult {
    const sourceChanges = this.extractChanges(sourceBranchOperations, baseOperations);
    const targetChanges = this.extractChanges(targetBranchOperations, baseOperations);

    const conflicts: MergeConflict[] = [];
    const mergedOperations: Operation[] = [];

    const baseNodes = new Map(baseState.nodes.map((n) => [n.id, n]));
    const baseEdges = new Map(baseState.edges.map((e) => [e.id, e]));
    const baseTombstones = new Map(
      (baseState.tombstones || []).map((t) => [t.id, t]),
    );

    const {
      nodeConflicts,
      nodeOperations: resolvedNodeOps,
    } = this.resolveNodeConflicts(
      sourceChanges.nodes,
      targetChanges.nodes,
      baseNodes,
      baseTombstones,
      mergeStrategy,
    );
    conflicts.push(...nodeConflicts);
    mergedOperations.push(...resolvedNodeOps);

    const {
      edgeConflicts,
      edgeOperations: resolvedEdgeOps,
    } = this.resolveEdgeConflicts(
      sourceChanges.edges,
      targetChanges.edges,
      baseEdges,
      baseTombstones,
      mergeStrategy,
    );
    conflicts.push(...edgeConflicts);
    mergedOperations.push(...resolvedEdgeOps);

    mergedOperations.sort((a, b) => a.timestamp - b.timestamp);

    const newVersion =
      baseState.version +
      sourceBranchOperations.length +
      targetBranchOperations.length -
      baseOperations.length;

    return {
      success: conflicts.every((c) => c.autoResolved),
      sourceBranchId: 'source',
      targetBranchId: 'target',
      baseCommitId: null,
      conflicts,
      mergedOperations,
      newVersion,
      message:
        conflicts.length === 0
          ? 'Merge completed successfully with no conflicts'
          : `Merge completed with ${conflicts.length} conflict(s)`,
    };
  }

  private extractChanges(
    branchOperations: Operation[],
    baseOperations: Operation[],
  ): {
    nodes: NodeChanges;
    edges: EdgeChanges;
  } {
    const baseOpSet = new Set(baseOperations.map((op) => op.id));
    const branchOnly = branchOperations.filter((op) => !baseOpSet.has(op.id));

    const nodes: NodeChanges = {
      added: new Map(),
      deleted: new Map(),
      moved: new Map(),
      relabeled: new Map(),
    };

    const edges: EdgeChanges = {
      added: new Map(),
      deleted: new Map(),
      relabeled: new Map(),
    };

    for (const op of branchOnly) {
      switch (op.type) {
        case 'addNode':
          nodes.added.set(op.nodeId, op);
          break;
        case 'deleteNode':
          nodes.deleted.set(op.nodeId, op);
          break;
        case 'moveNode':
          nodes.moved.set(op.nodeId, op);
          break;
        case 'updateNodeLabel':
          nodes.relabeled.set(op.nodeId, op);
          break;
        case 'addEdge':
          edges.added.set(op.edgeId, op);
          break;
        case 'deleteEdge':
          edges.deleted.set(op.edgeId, op);
          break;
        case 'updateEdgeLabel':
          edges.relabeled.set(op.edgeId, op);
          break;
      }
    }

    return { nodes, edges };
  }

  private resolveNodeConflicts(
    sourceChanges: NodeChanges,
    targetChanges: NodeChanges,
    baseNodes: Map<string, Node>,
    baseTombstones: Map<string, Tombstone>,
    strategy: 'ours' | 'theirs' | 'auto',
  ): {
    nodeConflicts: MergeConflict[];
    nodeOperations: Operation[];
  } {
    const conflicts: MergeConflict[] = [];
    const operations: Operation[] = [];
    const processedNodeIds = new Set<string>();

    for (const [nodeId, op] of sourceChanges.added) {
      if (targetChanges.added.has(nodeId)) {
        const targetOp = targetChanges.added.get(nodeId)!;
        const conflict = this.createNodeConflict(
          nodeId,
          'add',
          [op, targetOp],
          strategy,
        );
        conflicts.push(conflict);

        if (conflict.autoResolved) {
          operations.push(...this.resolveNodeAddConflict(op, targetOp, strategy));
        }
        processedNodeIds.add(nodeId);
      } else {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, op] of targetChanges.added) {
      if (!processedNodeIds.has(nodeId)) {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, op] of sourceChanges.deleted) {
      if (targetChanges.added.has(nodeId) ||
          targetChanges.moved.has(nodeId) ||
          targetChanges.relabeled.has(nodeId)) {
        const targetOps: Operation[] = [];
        if (targetChanges.added.has(nodeId)) targetOps.push(targetChanges.added.get(nodeId)!);
        if (targetChanges.moved.has(nodeId)) targetOps.push(targetChanges.moved.get(nodeId)!);
        if (targetChanges.relabeled.has(nodeId)) targetOps.push(targetChanges.relabeled.get(nodeId)!);

        const conflict = this.createNodeConflict(
          nodeId,
          'delete-vs-modify',
          [op, ...targetOps],
          strategy,
        );
        conflicts.push(conflict);

        if (conflict.autoResolved) {
          operations.push(...this.resolveDeleteVsModifyConflict(op, targetOps, strategy));
        }
        processedNodeIds.add(nodeId);
      } else if (targetChanges.deleted.has(nodeId)) {
        operations.push(op);
        processedNodeIds.add(nodeId);
      } else {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, op] of targetChanges.deleted) {
      if (!processedNodeIds.has(nodeId)) {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, op] of sourceChanges.moved) {
      if (targetChanges.moved.has(nodeId)) {
        const targetOp = targetChanges.moved.get(nodeId)!;
        const conflict = this.createNodeConflict(
          nodeId,
          'move',
          [op, targetOp],
          strategy,
        );
        conflicts.push(conflict);

        if (conflict.autoResolved) {
          operations.push(...this.resolveMoveConflict(op, targetOp, strategy));
        }
        processedNodeIds.add(nodeId);
      } else if (!processedNodeIds.has(nodeId)) {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, op] of targetChanges.moved) {
      if (!processedNodeIds.has(nodeId)) {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, op] of sourceChanges.relabeled) {
      if (targetChanges.relabeled.has(nodeId)) {
        const targetOp = targetChanges.relabeled.get(nodeId)!;
        const conflict = this.createNodeConflict(
          nodeId,
          'relabel',
          [op, targetOp],
          strategy,
        );
        conflicts.push(conflict);

        if (conflict.autoResolved) {
          operations.push(...this.resolveLabelConflict(op, targetOp, strategy));
        }
        processedNodeIds.add(nodeId);
      } else if (!processedNodeIds.has(nodeId)) {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, op] of targetChanges.relabeled) {
      if (!processedNodeIds.has(nodeId)) {
        operations.push(op);
        processedNodeIds.add(nodeId);
      }
    }

    return { nodeConflicts: conflicts, nodeOperations: operations };
  }

  private resolveEdgeConflicts(
    sourceChanges: EdgeChanges,
    targetChanges: EdgeChanges,
    baseEdges: Map<string, Edge>,
    baseTombstones: Map<string, Tombstone>,
    strategy: 'ours' | 'theirs' | 'auto',
  ): {
    edgeConflicts: MergeConflict[];
    edgeOperations: Operation[];
  } {
    const conflicts: MergeConflict[] = [];
    const operations: Operation[] = [];
    const processedEdgeIds = new Set<string>();

    for (const [edgeId, op] of sourceChanges.added) {
      if (targetChanges.added.has(edgeId)) {
        const targetOp = targetChanges.added.get(edgeId)!;
        const conflict = this.createEdgeConflict(
          edgeId,
          'add',
          [op, targetOp],
          strategy,
        );
        conflicts.push(conflict);

        if (conflict.autoResolved) {
          operations.push(...this.resolveEdgeAddConflict(op, targetOp, strategy));
        }
        processedEdgeIds.add(edgeId);
      } else {
        operations.push(op);
        processedEdgeIds.add(edgeId);
      }
    }

    for (const [edgeId, op] of targetChanges.added) {
      if (!processedEdgeIds.has(edgeId)) {
        operations.push(op);
        processedEdgeIds.add(edgeId);
      }
    }

    for (const [edgeId, op] of sourceChanges.deleted) {
      if (targetChanges.relabeled.has(edgeId)) {
        const targetOp = targetChanges.relabeled.get(edgeId)!;
        const conflict = this.createEdgeConflict(
          edgeId,
          'delete-vs-modify',
          [op, targetOp],
          strategy,
        );
        conflicts.push(conflict);

        if (conflict.autoResolved) {
          operations.push(...this.resolveDeleteVsModifyConflict(op, [targetOp], strategy));
        }
        processedEdgeIds.add(edgeId);
      } else if (!processedEdgeIds.has(edgeId)) {
        operations.push(op);
        processedEdgeIds.add(edgeId);
      }
    }

    for (const [edgeId, op] of targetChanges.deleted) {
      if (!processedEdgeIds.has(edgeId)) {
        operations.push(op);
        processedEdgeIds.add(edgeId);
      }
    }

    for (const [edgeId, op] of sourceChanges.relabeled) {
      if (targetChanges.relabeled.has(edgeId)) {
        const targetOp = targetChanges.relabeled.get(edgeId)!;
        const conflict = this.createEdgeConflict(
          edgeId,
          'relabel',
          [op, targetOp],
          strategy,
        );
        conflicts.push(conflict);

        if (conflict.autoResolved) {
          operations.push(...this.resolveEdgeLabelConflict(op, targetOp, strategy));
        }
        processedEdgeIds.add(edgeId);
      } else if (!processedEdgeIds.has(edgeId)) {
        operations.push(op);
        processedEdgeIds.add(edgeId);
      }
    }

    for (const [edgeId, op] of targetChanges.relabeled) {
      if (!processedEdgeIds.has(edgeId)) {
        operations.push(op);
        processedEdgeIds.add(edgeId);
      }
    }

    return { edgeConflicts: conflicts, edgeOperations: operations };
  }

  private createNodeConflict(
    nodeId: string,
    conflictType: string,
    operations: Operation[],
    strategy: 'ours' | 'theirs' | 'auto',
  ): MergeConflict {
    const autoResolved = strategy !== 'manual';
    return {
      type: 'node',
      targetId: nodeId,
      operations,
      resolutions: autoResolved ? [strategy === 'ours' ? 'ours' : strategy === 'theirs' ? 'theirs' : 'both'] : [],
      autoResolved,
    };
  }

  private createEdgeConflict(
    edgeId: string,
    conflictType: string,
    operations: Operation[],
    strategy: 'ours' | 'theirs' | 'auto',
  ): MergeConflict {
    const autoResolved = strategy !== 'manual';
    return {
      type: 'edge',
      targetId: edgeId,
      operations,
      resolutions: autoResolved ? [strategy === 'ours' ? 'ours' : strategy === 'theirs' ? 'theirs' : 'both'] : [],
      autoResolved,
    };
  }

  private resolveNodeAddConflict(
    sourceOp: Operation,
    targetOp: Operation,
    strategy: 'ours' | 'theirs' | 'auto',
  ): Operation[] {
    if (strategy === 'ours') return [sourceOp];
    if (strategy === 'theirs') return [targetOp];

    if (sourceOp.type !== 'addNode' || targetOp.type !== 'addNode') {
      return [sourceOp];
    }

    if (sourceOp.label === targetOp.label) {
      return [sourceOp];
    }

    return [
      sourceOp,
      {
        ...sourceOp,
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        nodeId: `${sourceOp.nodeId}_copy`,
        label: `${targetOp.label} (copy)`,
      },
    ];
  }

  private resolveEdgeAddConflict(
    sourceOp: Operation,
    targetOp: Operation,
    strategy: 'ours' | 'theirs' | 'auto',
  ): Operation[] {
    if (strategy === 'ours') return [sourceOp];
    if (strategy === 'theirs') return [targetOp];
    return [sourceOp];
  }

  private resolveDeleteVsModifyConflict(
    deleteOp: Operation,
    modifyOps: Operation[],
    strategy: 'ours' | 'theirs' | 'auto',
  ): Operation[] {
    if (strategy === 'ours') return [deleteOp];
    if (strategy === 'theirs') return modifyOps;

    if (deleteOp.timestamp < modifyOps[0].timestamp) {
      return [deleteOp];
    }
    return modifyOps;
  }

  private resolveMoveConflict(
    sourceOp: Operation,
    targetOp: Operation,
    strategy: 'ours' | 'theirs' | 'auto',
  ): Operation[] {
    if (strategy === 'ours') return [sourceOp];
    if (strategy === 'theirs') return [targetOp];

    if (sourceOp.type !== 'moveNode' || targetOp.type !== 'moveNode') {
      return [sourceOp];
    }

    if (sourceOp.timestamp > targetOp.timestamp) {
      return [sourceOp];
    }

    if (sourceOp.timestamp === targetOp.timestamp) {
      const avgX = (sourceOp.toX + targetOp.toX) / 2;
      const avgY = (sourceOp.toY + targetOp.toY) / 2;
      return [
        {
          ...sourceOp,
          toX: avgX,
          toY: avgY,
        },
      ];
    }

    return [targetOp];
  }

  private resolveLabelConflict(
    sourceOp: Operation,
    targetOp: Operation,
    strategy: 'ours' | 'theirs' | 'auto',
  ): Operation[] {
    if (strategy === 'ours') return [sourceOp];
    if (strategy === 'theirs') return [targetOp];

    if (sourceOp.type !== 'updateNodeLabel' || targetOp.type !== 'updateNodeLabel') {
      return [sourceOp];
    }

    if (sourceOp.newLabel === targetOp.newLabel) {
      return [sourceOp];
    }

    if (sourceOp.timestamp > targetOp.timestamp) {
      return [sourceOp];
    }

    if (sourceOp.timestamp === targetOp.timestamp) {
      return [
        {
          ...sourceOp,
          newLabel: `${sourceOp.newLabel} / ${targetOp.newLabel}`,
        },
      ];
    }

    return [targetOp];
  }

  private resolveEdgeLabelConflict(
    sourceOp: Operation,
    targetOp: Operation,
    strategy: 'ours' | 'theirs' | 'auto',
  ): Operation[] {
    if (strategy === 'ours') return [sourceOp];
    if (strategy === 'theirs') return [targetOp];

    if (sourceOp.type !== 'updateEdgeLabel' || targetOp.type !== 'updateEdgeLabel') {
      return [sourceOp];
    }

    if (sourceOp.newLabel === targetOp.newLabel) {
      return [sourceOp];
    }

    if (sourceOp.timestamp > targetOp.timestamp) {
      return [sourceOp];
    }

    if (sourceOp.timestamp === targetOp.timestamp) {
      return [
        {
          ...sourceOp,
          newLabel: `${sourceOp.newLabel} / ${targetOp.newLabel}`,
        },
      ];
    }

    return [targetOp];
  }

  canAutoMerge(
    sourceOperations: Operation[],
    targetOperations: Operation[],
    baseOperations: Operation[],
  ): boolean {
    const sourceChanges = this.extractChanges(sourceOperations, baseOperations);
    const targetChanges = this.extractChanges(targetOperations, baseOperations);

    const allAddedNodes = new Set([
      ...sourceChanges.nodes.added.keys(),
      ...targetChanges.nodes.added.keys(),
    ]);
    if (allAddedNodes.size < sourceChanges.nodes.added.size + targetChanges.nodes.added.size) {
      return false;
    }

    const allMovedNodes = new Set([
      ...sourceChanges.nodes.moved.keys(),
      ...targetChanges.nodes.moved.keys(),
    ]);
    if (allMovedNodes.size < sourceChanges.nodes.moved.size + targetChanges.nodes.moved.size) {
      return false;
    }

    const allRelabeledNodes = new Set([
      ...sourceChanges.nodes.relabeled.keys(),
      ...targetChanges.nodes.relabeled.keys(),
    ]);
    if (allRelabeledNodes.size < sourceChanges.nodes.relabeled.size + targetChanges.nodes.relabeled.size) {
      return false;
    }

    for (const deletedId of sourceChanges.nodes.deleted.keys()) {
      if (targetChanges.nodes.moved.has(deletedId) ||
          targetChanges.nodes.relabeled.has(deletedId)) {
        return false;
      }
    }

    for (const deletedId of targetChanges.nodes.deleted.keys()) {
      if (sourceChanges.nodes.moved.has(deletedId) ||
          sourceChanges.nodes.relabeled.has(deletedId)) {
        return false;
      }
    }

    const allAddedEdges = new Set([
      ...sourceChanges.edges.added.keys(),
      ...targetChanges.edges.added.keys(),
    ]);
    if (allAddedEdges.size < sourceChanges.edges.added.size + targetChanges.edges.added.size) {
      return false;
    }

    const allRelabeledEdges = new Set([
      ...sourceChanges.edges.relabeled.keys(),
      ...targetChanges.edges.relabeled.keys(),
    ]);
    if (allRelabeledEdges.size < sourceChanges.edges.relabeled.size + targetChanges.edges.relabeled.size) {
      return false;
    }

    return true;
  }

  previewMerge(
    sourceBranchOperations: Operation[],
    targetBranchOperations: Operation[],
    baseOperations: Operation[],
    baseState: SerializedGraphState,
  ): {
    hasConflicts: boolean;
    conflictCount: number;
    sampleConflicts: MergeConflict[];
    estimatedNewOperations: number;
  } {
    const result = this.merge(
      sourceBranchOperations,
      targetBranchOperations,
      baseOperations,
      baseState,
      'manual',
    );

    return {
      hasConflicts: result.conflicts.length > 0,
      conflictCount: result.conflicts.length,
      sampleConflicts: result.conflicts.slice(0, 5),
      estimatedNewOperations: result.mergedOperations.length,
    };
  }
}
