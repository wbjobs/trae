import type { Operation } from './types';
import { OperationFactory } from './operation-factory';

export function generateSampleGraph(
  graphId: string,
  nodeCount: number = 100,
  edgeDensity: number = 0.02,
): {
  initialState: {
    nodes: Array<{
      id: string;
      label: string;
      x: number;
      y: number;
      color: string;
      createdAt: number;
    }>;
    edges: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      label?: string;
      createdAt: number;
    }>;
    version: number;
  };
  operations: Operation[];
} {
  const nodes: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    color: string;
    createdAt: number;
  }> = [];
  const edges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    label?: string;
    createdAt: number;
  }> = [];
  const operations: Operation[] = [];

  const now = Date.now();

  const cols = Math.ceil(Math.sqrt(nodeCount * 1.5));
  const rows = Math.ceil(nodeCount / cols);
  const spacing = 80;

  for (let i = 0; i < nodeCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 100 + col * spacing + Math.random() * 30;
    const y = 100 + row * spacing + Math.random() * 30;

    const nodeId = `node_${i}`;
    const label = `节点 ${i + 1}`;
    const color = OperationFactory.getRandomColor();

    nodes.push({
      id: nodeId,
      label,
      x,
      y,
      color,
      createdAt: now - nodeCount + i,
    });

    operations.push(
      OperationFactory.createAddNode({
        userId: 'system',
        graphId,
        version: i,
        label,
        x,
        y,
        color,
        nodeId,
      }),
    );
  }

  const edgeCount = Math.floor(nodeCount * nodeCount * edgeDensity);
  let version = nodeCount;

  for (let i = 0; i < edgeCount; i++) {
    const sourceIndex = Math.floor(Math.random() * nodeCount);
    const targetIndex = Math.floor(Math.random() * nodeCount);

    if (sourceIndex === targetIndex) continue;

    const sourceId = `node_${sourceIndex}`;
    const targetId = `node_${targetIndex}`;
    const edgeId = `edge_${i}`;

    edges.push({
      id: edgeId,
      sourceId,
      targetId,
      label: Math.random() > 0.7 ? `关系 ${i + 1}` : undefined,
      createdAt: now + i,
    });

    operations.push(
      OperationFactory.createAddEdge({
        userId: 'system',
        graphId,
        version: version++,
        sourceId,
        targetId,
        label: Math.random() > 0.7 ? `关系 ${i + 1}` : undefined,
        edgeId,
      }),
    );
  }

  return {
    initialState: {
      nodes,
      edges,
      version,
    },
    operations,
  };
}

export function generateConcurrentOperations(
  graphId: string,
  userId1: string,
  userId2: string,
  nodeCount: number,
): Operation[] {
  const operations: Operation[] = [];
  const now = Date.now();

  for (let i = 0; i < nodeCount; i++) {
    const x = 100 + (i % 10) * 100 + Math.random() * 30;
    const y = 100 + Math.floor(i / 10) * 100 + Math.random() * 30;

    const userId = i % 2 === 0 ? userId1 : userId2;
    const timestamp = now + i * 100 + Math.floor(Math.random() * 50);

    operations.push(
      OperationFactory.createAddNode({
        userId,
        graphId,
        version: 0,
        label: `并发节点 ${i + 1}`,
        x,
        y,
        nodeId: `node_concurrent_${i}`,
      }),
    );
  }

  operations.sort((a, b) => a.timestamp - b.timestamp);

  return operations;
}

export function generateEditOperations(
  graphId: string,
  userId: string,
  nodeIds: string[],
  updateCount: number,
): Operation[] {
  const operations: Operation[] = [];
  const now = Date.now();

  for (let i = 0; i < updateCount; i++) {
    const nodeId = nodeIds[i % nodeIds.length];
    const operationType = i % 3;

    switch (operationType) {
      case 0:
        operations.push(
          OperationFactory.createUpdateNodeLabel({
            userId,
            graphId,
            version: i,
            nodeId,
            oldLabel: `旧标签 ${i}`,
            newLabel: `新标签 ${i}`,
          }),
        );
        break;

      case 1:
        operations.push(
          OperationFactory.createMoveNode({
            userId,
            graphId,
            version: i,
            nodeId,
            fromX: 100 + i * 10,
            fromY: 100 + i * 10,
            toX: 150 + i * 10 + Math.random() * 50,
            toY: 150 + i * 10 + Math.random() * 50,
          }),
        );
        break;

      case 2:
        const targetIndex = (i + 1) % nodeIds.length;
        operations.push(
          OperationFactory.createAddEdge({
            userId,
            graphId,
            version: i,
            sourceId: nodeId,
            targetId: nodeIds[targetIndex],
            label: `边 ${i}`,
          }),
        );
        break;
    }
  }

  return operations;
}
