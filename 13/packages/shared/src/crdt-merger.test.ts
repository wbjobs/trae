import { describe, it, expect, beforeEach } from 'vitest';
import { CRDTMerger, defaultMergeConfig } from './crdt-merger';
import { OperationFactory } from './operation-factory';
import type { SerializedGraphState, Operation } from './types';

describe('CRDTMerger', () => {
  let merger: CRDTMerger;
  let baseState: SerializedGraphState;

  beforeEach(() => {
    merger = new CRDTMerger();
    baseState = {
      nodes: [],
      edges: [],
      tombstones: [],
      version: 0,
    };
  });

  describe('no-conflict merges', () => {
    it('should merge branches with independent node additions', () => {
      const graphId = 'test-graph';

      const sourceOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user1',
          graphId,
          version: 0,
          label: 'Node A',
          x: 100,
          y: 100,
          nodeId: 'node-a',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user2',
          graphId,
          version: 0,
          label: 'Node B',
          x: 200,
          y: 200,
          nodeId: 'node-b',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseState,
        'auto',
      );

      expect(result.success).toBe(true);
      expect(result.conflicts.length).toBe(0);
      expect(result.mergedOperations.length).toBe(2);
    });

    it('should merge branches with independent edge additions', () => {
      const graphId = 'test-graph';

      const baseStateWithNodes: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Node 1', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
          { id: 'node-2', label: 'Node 2', x: 200, y: 200, color: '#4CAF50', createdAt: Date.now() },
          { id: 'node-3', label: 'Node 3', x: 300, y: 300, color: '#2196F3', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createAddEdge({
          userId: 'user1',
          graphId,
          version: 1,
          sourceId: 'node-1',
          targetId: 'node-2',
          edgeId: 'edge-1',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddEdge({
          userId: 'user2',
          graphId,
          version: 1,
          sourceId: 'node-2',
          targetId: 'node-3',
          edgeId: 'edge-2',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNodes,
        'auto',
      );

      expect(result.success).toBe(true);
      expect(result.conflicts.length).toBe(0);
      expect(result.mergedOperations.length).toBe(2);
    });
  });

  describe('node conflicts', () => {
    it('should detect conflict when same node is added in both branches', () => {
      const graphId = 'test-graph';

      const sourceOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user1',
          graphId,
          version: 0,
          label: 'Source Node',
          x: 100,
          y: 100,
          nodeId: 'conflict-node',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user2',
          graphId,
          version: 0,
          label: 'Target Node',
          x: 200,
          y: 200,
          nodeId: 'conflict-node',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseState,
        'auto',
      );

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].type).toBe('node');
    });

    it('should detect conflict when node is deleted and modified', () => {
      const graphId = 'test-graph';

      const baseStateWithNode: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Test Node', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createDeleteNode({
          userId: 'user1',
          graphId,
          version: 1,
          nodeId: 'node-1',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user2',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Test Node',
          newLabel: 'Updated Node',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNode,
        'auto',
      );

      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('should detect conflict when same node is moved in both branches', () => {
      const graphId = 'test-graph';

      const baseStateWithNode: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Test Node', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createMoveNode({
          userId: 'user1',
          graphId,
          version: 1,
          nodeId: 'node-1',
          fromX: 100,
          fromY: 100,
          toX: 200,
          toY: 200,
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createMoveNode({
          userId: 'user2',
          graphId,
          version: 1,
          nodeId: 'node-1',
          fromX: 100,
          fromY: 100,
          toX: 300,
          toY: 300,
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNode,
        'auto',
      );

      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('should detect conflict when same node label is updated in both branches', () => {
      const graphId = 'test-graph';

      const baseStateWithNode: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Original', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user1',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Source Label',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user2',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Target Label',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNode,
        'auto',
      );

      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('edge conflicts', () => {
    it('should detect conflict when same edge is added in both branches', () => {
      const graphId = 'test-graph';

      const baseStateWithNodes: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Node 1', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
          { id: 'node-2', label: 'Node 2', x: 200, y: 200, color: '#4CAF50', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createAddEdge({
          userId: 'user1',
          graphId,
          version: 1,
          sourceId: 'node-1',
          targetId: 'node-2',
          edgeId: 'conflict-edge',
          label: 'Source Edge',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddEdge({
          userId: 'user2',
          graphId,
          version: 1,
          sourceId: 'node-1',
          targetId: 'node-2',
          edgeId: 'conflict-edge',
          label: 'Target Edge',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNodes,
        'auto',
      );

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].type).toBe('edge');
    });

    it('should detect conflict when edge is deleted and relabeled', () => {
      const graphId = 'test-graph';

      const baseStateWithEdge: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Node 1', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
          { id: 'node-2', label: 'Node 2', x: 200, y: 200, color: '#4CAF50', createdAt: Date.now() },
        ],
        edges: [
          { id: 'edge-1', sourceId: 'node-1', targetId: 'node-2', label: 'Original', createdAt: Date.now() },
        ],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createDeleteEdge({
          userId: 'user1',
          graphId,
          version: 1,
          edgeId: 'edge-1',
          sourceId: 'node-1',
          targetId: 'node-2',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createUpdateEdgeLabel({
          userId: 'user2',
          graphId,
          version: 1,
          edgeId: 'edge-1',
          oldLabel: 'Original',
          newLabel: 'Updated Label',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithEdge,
        'auto',
      );

      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('merge strategies', () => {
    it('should use "ours" strategy to keep target branch changes', () => {
      const graphId = 'test-graph';

      const baseStateWithNode: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Original', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user1',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Source Label',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user2',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Target Label',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNode,
        'ours',
      );

      expect(result.success).toBe(true);
      const labelOps = result.mergedOperations.filter(
        (op) => op.type === 'updateNodeLabel',
      );
      expect(labelOps.length).toBeGreaterThan(0);
    });

    it('should use "theirs" strategy to keep source branch changes', () => {
      const graphId = 'test-graph';

      const baseStateWithNode: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Original', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user1',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Source Label',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user2',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Target Label',
        }),
      ];

      const result = merger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNode,
        'theirs',
      );

      expect(result.success).toBe(true);
    });
  });

  describe('canAutoMerge', () => {
    it('should return true for branches with no conflicts', () => {
      const graphId = 'test-graph';

      const sourceOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user1',
          graphId,
          version: 0,
          label: 'Node A',
          x: 100,
          y: 100,
          nodeId: 'node-a',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user2',
          graphId,
          version: 0,
          label: 'Node B',
          x: 200,
          y: 200,
          nodeId: 'node-b',
        }),
      ];

      const canAutoMerge = merger.canAutoMerge(sourceOps, targetOps, []);
      expect(canAutoMerge).toBe(true);
    });

    it('should return false for branches with conflicts', () => {
      const graphId = 'test-graph';

      const sourceOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user1',
          graphId,
          version: 0,
          label: 'Source Node',
          x: 100,
          y: 100,
          nodeId: 'conflict-node',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user2',
          graphId,
          version: 0,
          label: 'Target Node',
          x: 200,
          y: 200,
          nodeId: 'conflict-node',
        }),
      ];

      const canAutoMerge = merger.canAutoMerge(sourceOps, targetOps, []);
      expect(canAutoMerge).toBe(false);
    });
  });

  describe('previewMerge', () => {
    it('should return preview with no conflicts', () => {
      const graphId = 'test-graph';

      const sourceOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user1',
          graphId,
          version: 0,
          label: 'Node A',
          x: 100,
          y: 100,
          nodeId: 'node-a',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user2',
          graphId,
          version: 0,
          label: 'Node B',
          x: 200,
          y: 200,
          nodeId: 'node-b',
        }),
      ];

      const preview = merger.previewMerge(sourceOps, targetOps, [], baseState);

      expect(preview.hasConflicts).toBe(false);
      expect(preview.conflictCount).toBe(0);
      expect(preview.estimatedNewOperations).toBeGreaterThan(0);
    });

    it('should return preview with conflicts', () => {
      const graphId = 'test-graph';

      const sourceOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user1',
          graphId,
          version: 0,
          label: 'Source Node',
          x: 100,
          y: 100,
          nodeId: 'conflict-node',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createAddNode({
          userId: 'user2',
          graphId,
          version: 0,
          label: 'Target Node',
          x: 200,
          y: 200,
          nodeId: 'conflict-node',
        }),
      ];

      const preview = merger.previewMerge(sourceOps, targetOps, [], baseState);

      expect(preview.hasConflicts).toBe(true);
      expect(preview.conflictCount).toBeGreaterThan(0);
    });
  });

  describe('custom merge config', () => {
    it('should use custom merge config', () => {
      const customMerger = new CRDTMerger({
        conflictStrategy: 'auto',
        nodeConflictResolution: 'keep-both',
        labelConflictResolution: 'concatenate',
      });

      const graphId = 'test-graph';

      const baseStateWithNode: SerializedGraphState = {
        nodes: [
          { id: 'node-1', label: 'Original', x: 100, y: 100, color: '#FF5722', createdAt: Date.now() },
        ],
        edges: [],
        tombstones: [],
        version: 0,
      };

      const sourceOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user1',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Label A',
        }),
      ];

      const targetOps: Operation[] = [
        OperationFactory.createUpdateNodeLabel({
          userId: 'user2',
          graphId,
          version: 1,
          nodeId: 'node-1',
          oldLabel: 'Original',
          newLabel: 'Label B',
        }),
      ];

      const result = customMerger.merge(
        sourceOps,
        targetOps,
        [],
        baseStateWithNode,
        'auto',
      );

      expect(result).toBeDefined();
    });
  });
});
