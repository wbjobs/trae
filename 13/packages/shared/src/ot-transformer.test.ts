import { describe, it, expect } from 'vitest';
import { OTTransformer } from './ot-transformer';
import { GraphStateManager } from './graph-state';
import { OperationFactory } from './operation-factory';
import { generateSampleGraph, generateConcurrentOperations } from './test-utils';

describe('OTTransformer', () => {
  const transformer = new OTTransformer();

  it('should transform concurrent moveNode operations on same node', () => {
    const graphId = 'test-graph';
    const nodeId = 'node-1';

    const op1 = OperationFactory.createMoveNode({
      userId: 'user1',
      graphId,
      version: 0,
      nodeId,
      fromX: 100,
      fromY: 100,
      toX: 200,
      toY: 200,
    });

    const op2 = OperationFactory.createMoveNode({
      userId: 'user2',
      graphId,
      version: 0,
      nodeId,
      fromX: 100,
      fromY: 100,
      toX: 300,
      toY: 300,
    });

    const [transformedOp1, transformedOp2] = transformer.transform(op1, op2);

    expect(transformedOp1.type).toBe('moveNode');
    expect(transformedOp2.type).toBe('moveNode');
  });

  it('should transform concurrent updateNodeLabel operations on same node', () => {
    const graphId = 'test-graph';
    const nodeId = 'node-1';

    const op1 = OperationFactory.createUpdateNodeLabel({
      userId: 'user1',
      graphId,
      version: 0,
      nodeId,
      oldLabel: 'Original',
      newLabel: 'Label A',
    });

    const op2 = OperationFactory.createUpdateNodeLabel({
      userId: 'user2',
      graphId,
      version: 0,
      nodeId,
      oldLabel: 'Original',
      newLabel: 'Label B',
    });

    const [transformedOp1, transformedOp2] = transformer.transform(op1, op2);

    expect(transformedOp1.type).toBe('updateNodeLabel');
    expect(transformedOp2.type).toBe('updateNodeLabel');

    if (op1.timestamp < op2.timestamp) {
      expect(transformedOp2.oldLabel).toBe('Label A');
    } else {
      expect(transformedOp1.oldLabel).toBe('Label B');
    }
  });

  it('should transform operations on different nodes without changes', () => {
    const graphId = 'test-graph';

    const op1 = OperationFactory.createMoveNode({
      userId: 'user1',
      graphId,
      version: 0,
      nodeId: 'node-1',
      fromX: 100,
      fromY: 100,
      toX: 200,
      toY: 200,
    });

    const op2 = OperationFactory.createMoveNode({
      userId: 'user2',
      graphId,
      version: 0,
      nodeId: 'node-2',
      fromX: 100,
      fromY: 100,
      toX: 300,
      toY: 300,
    });

    const [transformedOp1, transformedOp2] = transformer.transform(op1, op2);

    expect(transformedOp1.nodeId).toBe('node-1');
    expect(transformedOp2.nodeId).toBe('node-2');
    expect(transformedOp1.toX).toBe(200);
    expect(transformedOp1.toY).toBe(200);
    expect(transformedOp2.toX).toBe(300);
    expect(transformedOp2.toY).toBe(300);
  });
});

describe('GraphStateManager', () => {
  it('should apply addNode operation correctly', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const op = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Test Node',
      x: 100,
      y: 100,
      color: '#FF5722',
      nodeId: 'node-1',
    });

    const result = manager.applyOperation(op);

    expect(result).toBe(true);
    expect(manager.getNodes().size).toBe(1);
    expect(manager.getVersion()).toBe(1);
    expect(manager.getNode('node-1')?.label).toBe('Test Node');
  });

  it('should reject operation with wrong version', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const op1 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Node 1',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const op2 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Node 2',
      x: 200,
      y: 200,
      nodeId: 'node-2',
    });

    manager.applyOperation(op1);
    const result = manager.applyOperation(op2);

    expect(result).toBe(false);
    expect(manager.getNodes().size).toBe(1);
  });

  it('should delete node and its connected edges', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const addNode1 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Node 1',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const addNode2 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 1,
      label: 'Node 2',
      x: 200,
      y: 200,
      nodeId: 'node-2',
    });

    const addEdge = OperationFactory.createAddEdge({
      userId: 'user1',
      graphId,
      version: 2,
      sourceId: 'node-1',
      targetId: 'node-2',
      edgeId: 'edge-1',
    });

    const deleteNode1 = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 3,
      nodeId: 'node-1',
    });

    manager.applyOperation(addNode1);
    manager.applyOperation(addNode2);
    manager.applyOperation(addEdge);

    expect(manager.getNodes().size).toBe(2);
    expect(manager.getEdges().size).toBe(1);

    manager.applyOperation(deleteNode1);

    expect(manager.getNodes().size).toBe(1);
    expect(manager.getEdges().size).toBe(0);
  });

  it('should replay to previous version', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const addNode1 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Node 1',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const addNode2 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 1,
      label: 'Node 2',
      x: 200,
      y: 200,
      nodeId: 'node-2',
    });

    const addNode3 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 2,
      label: 'Node 3',
      x: 300,
      y: 300,
      nodeId: 'node-3',
    });

    manager.applyOperation(addNode1);
    manager.applyOperation(addNode2);
    manager.applyOperation(addNode3);

    expect(manager.getNodes().size).toBe(3);

    const stateAtVersion1 = manager.replayToVersion(1);
    expect(stateAtVersion1?.nodes.length).toBe(1);

    const stateAtVersion2 = manager.replayToVersion(2);
    expect(stateAtVersion2?.nodes.length).toBe(2);

    const stateAtVersion3 = manager.replayToVersion(3);
    expect(stateAtVersion3?.nodes.length).toBe(3);
  });
});

describe('Concurrent Operations', () => {
  it('should handle concurrent addNode operations from multiple users', () => {
    const manager1 = new GraphStateManager();
    const manager2 = new GraphStateManager();
    const transformer = new OTTransformer();

    const graphId = 'test-graph';
    const ops = generateConcurrentOperations(graphId, 'user1', 'user2', 10);
    const user1Ops = ops.filter(op => op.userId === 'user1');
    const user2Ops = ops.filter(op => op.userId === 'user2');

    let version1 = 0;
    let version2 = 0;

    for (let i = 0; i < 5; i++) {
      const op1 = user1Ops[i];
      const op2 = user2Ops[i];

      const [transformedOp1, transformedOp2] = transformer.transform(op1, op2);

      manager1.applyOperation({ ...op1, version: version1++ });
      manager1.applyOperation({ ...transformedOp2, version: version1++ });

      manager2.applyOperation({ ...op2, version: version2++ });
      manager2.applyOperation({ ...transformedOp1, version: version2++ });
    }

    expect(manager1.getNodes().size).toBe(10);
    expect(manager2.getNodes().size).toBe(10);

    const nodes1 = Array.from(manager1.getNodes().keys()).sort();
    const nodes2 = Array.from(manager2.getNodes().keys()).sort();
    expect(nodes1).toEqual(nodes2);
  });

  it('should generate and handle large sample graph', () => {
    const { initialState, operations } = generateSampleGraph('large-graph', 500, 0.01);

    expect(initialState.nodes.length).toBe(500);
    expect(operations.length).toBeGreaterThan(500);

    const manager = new GraphStateManager();

    for (const op of operations) {
      manager.applyOperation(op);
    }

    expect(manager.getNodes().size).toBe(500);
    expect(manager.getHistoryCount()).toBe(operations.length);
  });
});

describe('Tombstone Mechanism', () => {
  it('should create tombstone when node is deleted', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const addNode = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Test Node',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const deleteNode = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 1,
      nodeId: 'node-1',
    });

    manager.applyOperation(addNode);
    manager.applyOperation(deleteNode);

    expect(manager.getNodes().size).toBe(0);
    expect(manager.hasTombstone('node-1')).toBe(true);
    expect(manager.getTombstone('node-1')).toBeDefined();
    expect(manager.getTombstone('node-1')?.deletedBy).toBe('user1');
  });

  it('should prevent adding node with same id after deletion', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const addNode = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Test Node',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const deleteNode = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 1,
      nodeId: 'node-1',
    });

    const readdNode = OperationFactory.createAddNode({
      userId: 'user2',
      graphId,
      version: 2,
      label: 'Readded Node',
      x: 200,
      y: 200,
      nodeId: 'node-1',
    });

    manager.applyOperation(addNode);
    manager.applyOperation(deleteNode);

    expect(manager.applyOperation(readdNode)).toBe(false);
    expect(manager.getNodes().size).toBe(0);
  });

  it('should reject addEdge connecting to deleted node (ghost node)', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const addNode1 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Node 1',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const addNode2 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 1,
      label: 'Node 2',
      x: 200,
      y: 200,
      nodeId: 'node-2',
    });

    const deleteNode = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 2,
      nodeId: 'node-2',
    });

    const addEdge = OperationFactory.createAddEdge({
      userId: 'user2',
      graphId,
      version: 3,
      sourceId: 'node-1',
      targetId: 'node-2',
      edgeId: 'edge-1',
    });

    manager.applyOperation(addNode1);
    manager.applyOperation(addNode2);
    manager.applyOperation(deleteNode);

    expect(manager.applyOperation(addEdge)).toBe(false);
    expect(manager.getEdges().size).toBe(0);
  });

  it('should handle concurrent deleteNode and addEdge without creating dangling edges', () => {
    const transformer = new OTTransformer();
    const graphId = 'test-graph';
    const baseTime = Date.now();

    const addNode1 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Node 1',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const addNode2 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 1,
      label: 'Node 2',
      x: 200,
      y: 200,
      nodeId: 'node-2',
    });

    const deleteNodeOp = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 2,
      nodeId: 'node-2',
    });
    deleteNodeOp.timestamp = baseTime;

    const addEdgeOp = OperationFactory.createAddEdge({
      userId: 'user2',
      graphId,
      version: 2,
      sourceId: 'node-1',
      targetId: 'node-2',
      edgeId: 'edge-1',
    });
    addEdgeOp.timestamp = baseTime + 10;

    const managerServer = new GraphStateManager();
    const managerClient = new GraphStateManager();

    managerServer.applyOperation(addNode1);
    managerServer.applyOperation(addNode2);

    managerClient.applyOperation(addNode1);
    managerClient.applyOperation(addNode2);

    expect(deleteNodeOp.timestamp < addEdgeOp.timestamp).toBe(true);

    expect(managerServer.getVersion()).toBe(2);
    expect(managerClient.getVersion()).toBe(2);

    managerServer.applyOperation({ ...deleteNodeOp, version: 2 });

    const [transformedDelete, transformedEdge] = transformer.transform(
      deleteNodeOp,
      addEdgeOp,
    );

    expect(transformedDelete.tombstone).toBeDefined();
    managerServer.applyOperation({ ...transformedEdge, version: 3 });

    managerClient.applyOperation({ ...addEdgeOp, version: 2 });
    const [clientTransformedEdge, clientTransformedDelete] = transformer.transform(
      addEdgeOp,
      deleteNodeOp,
    );
    managerClient.applyOperation({ ...clientTransformedDelete, version: 3 });

    expect(managerServer.getNodes().size).toBe(1);
    expect(managerServer.getEdges().size).toBe(0);
    expect(managerServer.hasTombstone('node-2')).toBe(true);

    expect(managerClient.getNodes().size).toBe(1);
    expect(managerClient.getEdges().size).toBe(0);
    expect(managerClient.hasTombstone('node-2')).toBe(true);
  });

  it('should serialize and deserialize state with tombstones', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const addNode = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Test Node',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const deleteNode = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 1,
      nodeId: 'node-1',
    });

    manager.applyOperation(addNode);
    manager.applyOperation(deleteNode);

    const serializedState = manager.getSerializedState();
    expect(serializedState.tombstones).toBeDefined();
    expect(serializedState.tombstones.length).toBe(1);
    expect(serializedState.tombstones[0].id).toBe('node-1');

    const loadedManager = new GraphStateManager(serializedState);
    expect(loadedManager.hasTombstone('node-1')).toBe(true);
    expect(loadedManager.getNodes().size).toBe(0);
  });

  it('should canApplyOperation return false for edge with tombstoned node', () => {
    const manager = new GraphStateManager();
    const graphId = 'test-graph';

    const addNode1 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 0,
      label: 'Node 1',
      x: 100,
      y: 100,
      nodeId: 'node-1',
    });

    const addNode2 = OperationFactory.createAddNode({
      userId: 'user1',
      graphId,
      version: 1,
      label: 'Node 2',
      x: 200,
      y: 200,
      nodeId: 'node-2',
    });

    const deleteNode = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 2,
      nodeId: 'node-2',
    });

    manager.applyOperation(addNode1);
    manager.applyOperation(addNode2);
    manager.applyOperation(deleteNode);

    const addEdge = OperationFactory.createAddEdge({
      userId: 'user2',
      graphId,
      version: 3,
      sourceId: 'node-1',
      targetId: 'node-2',
      edgeId: 'edge-1',
    });

    expect(manager.canApplyOperation(addEdge)).toBe(false);
  });

  it('should transformWithContext use tombstone context correctly', () => {
    const transformer = new OTTransformer();
    const graphId = 'test-graph';
    const baseTime = Date.now();

    const deleteNodeOp = OperationFactory.createDeleteNode({
      userId: 'user1',
      graphId,
      version: 2,
      nodeId: 'node-2',
    });
    deleteNodeOp.timestamp = baseTime;

    const addEdgeOp = OperationFactory.createAddEdge({
      userId: 'user2',
      graphId,
      version: 2,
      sourceId: 'node-1',
      targetId: 'node-2',
      edgeId: 'edge-1',
    });
    addEdgeOp.timestamp = baseTime + 10;

    const context = {
      nodes: new Set(['node-1']),
      edges: new Set<string>(),
      tombstones: new Map([
        ['node-2', { id: 'node-2', deletedAt: baseTime, deletedBy: 'user1' }],
      ]),
    };

    const [transformedDelete, transformedEdge] = transformer.transformWithContext(
      deleteNodeOp,
      addEdgeOp,
      context,
    );

    expect(transformedDelete.type).toBe('deleteNode');
    expect(transformedEdge.type).toBe('addEdge');

    if (transformedDelete.tombstone) {
      expect(transformedDelete.tombstone.id).toBe('node-2');
      expect(transformedDelete.tombstone.deletedBy).toBe('user1');
    }
  });
});
