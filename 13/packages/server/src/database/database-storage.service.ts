import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationEntity } from './entities/operation.entity';
import { GraphSnapshotEntity } from './entities/graph-snapshot.entity';
import { GraphEntity } from './entities/graph.entity';
import type {
  Operation,
  SerializedGraphState,
  Tombstone,
} from '@collaborative-graph/shared';

@Injectable()
export class DatabaseStorageService {
  private readonly logger = new Logger(DatabaseStorageService.name);
  private readonly SNAPSHOT_INTERVAL = 100;

  constructor(
    @InjectRepository(OperationEntity)
    private readonly operationRepository: Repository<OperationEntity>,
    @InjectRepository(GraphSnapshotEntity)
    private readonly snapshotRepository: Repository<GraphSnapshotEntity>,
    @InjectRepository(GraphEntity)
    private readonly graphRepository: Repository<GraphEntity>,
  ) {}

  async createGraph(name: string, description?: string): Promise<GraphEntity> {
    const graph = this.graphRepository.create({
      name,
      description,
      currentVersion: 0,
      operationCount: 0,
      nodeCount: 0,
      edgeCount: 0,
    });
    return this.graphRepository.save(graph);
  }

  async getGraph(graphId: string): Promise<GraphEntity | null> {
    return this.graphRepository.findOne({ where: { id: graphId } });
  }

  async getAllGraphs(): Promise<GraphEntity[]> {
    return this.graphRepository.find({
      order: { updatedAt: 'DESC' },
    });
  }

  async saveOperation(
    graphId: string,
    operation: Operation,
    sequenceNumber: number,
  ): Promise<OperationEntity> {
    const entity = this.operationRepository.create({
      graphId,
      operationId: operation.id,
      userId: operation.userId,
      type: operation.type,
      payload: operation,
      version: operation.version,
      sequenceNumber,
      timestamp: operation.timestamp,
    });

    const saved = await this.operationRepository.save(entity);

    await this.updateGraphStats(graphId, operation);

    if (sequenceNumber % this.SNAPSHOT_INTERVAL === 0) {
      this.logger.log(
        `Creating snapshot for graph ${graphId} at version ${operation.version + 1}`,
      );
    }

    return saved;
  }

  async saveSnapshot(
    graphId: string,
    state: SerializedGraphState,
  ): Promise<GraphSnapshotEntity> {
    const snapshot = this.snapshotRepository.create({
      graphId,
      version: state.version,
      state,
      nodeCount: state.nodes.length,
      edgeCount: state.edges.length,
    });

    return this.snapshotRepository.save(snapshot);
  }

  async getOperations(
    graphId: string,
    fromVersion?: number,
    limit?: number,
  ): Promise<OperationEntity[]> {
    const queryBuilder = this.operationRepository
      .createQueryBuilder('operation')
      .where('operation.graphId = :graphId', { graphId })
      .orderBy('operation.sequenceNumber', 'ASC');

    if (fromVersion !== undefined) {
      queryBuilder.andWhere('operation.version >= :fromVersion', {
        fromVersion,
      });
    }

    if (limit !== undefined) {
      queryBuilder.limit(limit);
    }

    return queryBuilder.getMany();
  }

  async getLatestSnapshot(
    graphId: string,
  ): Promise<GraphSnapshotEntity | null> {
    return this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.graphId = :graphId', { graphId })
      .orderBy('snapshot.version', 'DESC')
      .limit(1)
      .getOne();
  }

  async getSnapshotAtVersion(
    graphId: string,
    version: number,
  ): Promise<GraphSnapshotEntity | null> {
    return this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.graphId = :graphId', { graphId })
      .andWhere('snapshot.version <= :version', { version })
      .orderBy('snapshot.version', 'DESC')
      .limit(1)
      .getOne();
  }

  async getOperationsAfterVersion(
    graphId: string,
    version: number,
  ): Promise<OperationEntity[]> {
    return this.operationRepository
      .createQueryBuilder('operation')
      .where('operation.graphId = :graphId', { graphId })
      .andWhere('operation.version >= :version', { version })
      .orderBy('operation.sequenceNumber', 'ASC')
      .getMany();
  }

  async getOperationCount(graphId: string): Promise<number> {
    return this.operationRepository.count({
      where: { graphId },
    });
  }

  async getSnapshotCount(graphId: string): Promise<number> {
    return this.snapshotRepository.count({
      where: { graphId },
    });
  }

  async loadGraphState(
    graphId: string,
    targetVersion?: number,
  ): Promise<{
    state: SerializedGraphState;
    loadedFromSnapshot: boolean;
    snapshotVersion: number;
  }> {
    const latestSnapshot = targetVersion
      ? await this.getSnapshotAtVersion(graphId, targetVersion)
      : await this.getLatestSnapshot(graphId);

    if (latestSnapshot) {
      let state = latestSnapshot.state;
      const operations = await this.getOperationsAfterVersion(
        graphId,
        latestSnapshot.version,
      );

      if (targetVersion !== undefined) {
        const opsToApply = operations.filter(
          (op) => op.version < targetVersion,
        );
        state = this.replayOperations(state, opsToApply.map((o) => o.payload));
      } else {
        state = this.replayOperations(state, operations.map((o) => o.payload));
      }

      return {
        state,
        loadedFromSnapshot: true,
        snapshotVersion: latestSnapshot.version,
      };
    }

    const operations = await this.getOperations(graphId);
    const state = this.replayOperations(
      { nodes: [], edges: [], tombstones: [], version: 0 },
      operations.map((o) => o.payload),
    );

    return {
      state,
      loadedFromSnapshot: false,
      snapshotVersion: 0,
    };
  }

  private replayOperations(
    initialState: SerializedGraphState,
    operations: Operation[],
  ): SerializedGraphState {
    const nodesMap = new Map(initialState.nodes.map((n) => [n.id, n]));
    const edgesMap = new Map(initialState.edges.map((e) => [e.id, e]));
    const tombstonesMap = new Map(
      (initialState.tombstones || []).map((t) => [t.id, t]),
    );
    let version = initialState.version;

    for (const op of operations) {
      switch (op.type) {
        case 'addNode':
          if (!tombstonesMap.has(op.nodeId)) {
            nodesMap.set(op.nodeId, {
              id: op.nodeId,
              label: op.label,
              x: op.x,
              y: op.y,
              color: op.color,
              createdAt: op.timestamp,
            });
          }
          break;

        case 'deleteNode':
          if (nodesMap.has(op.nodeId)) {
            nodesMap.delete(op.nodeId);
            const edgesToRemove = Array.from(edgesMap.values()).filter(
              (e) => e.sourceId === op.nodeId || e.targetId === op.nodeId,
            );
            edgesToRemove.forEach((e) => edgesMap.delete(e.id));

            const tombstone: Tombstone = {
              id: op.nodeId,
              deletedAt: op.timestamp,
              deletedBy: op.userId,
            };
            tombstonesMap.set(op.nodeId, tombstone);
          }
          break;

        case 'moveNode':
          const node = nodesMap.get(op.nodeId);
          if (node) {
            node.x = op.toX;
            node.y = op.toY;
          }
          break;

        case 'updateNodeLabel':
          const nodeToUpdate = nodesMap.get(op.nodeId);
          if (nodeToUpdate) {
            nodeToUpdate.label = op.newLabel;
          }
          break;

        case 'addEdge':
          if (
            nodesMap.has(op.sourceId) &&
            nodesMap.has(op.targetId) &&
            !tombstonesMap.has(op.sourceId) &&
            !tombstonesMap.has(op.targetId)
          ) {
            edgesMap.set(op.edgeId, {
              id: op.edgeId,
              sourceId: op.sourceId,
              targetId: op.targetId,
              label: op.label,
              createdAt: op.timestamp,
            });
          }
          break;

        case 'deleteEdge':
          edgesMap.delete(op.edgeId);
          break;

        case 'updateEdgeLabel':
          const edge = edgesMap.get(op.edgeId);
          if (edge) {
            edge.label = op.newLabel;
          }
          break;
      }
      version = op.version + 1;
    }

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
      tombstones: Array.from(tombstonesMap.values()),
      version,
    };
  }

  private async updateGraphStats(
    graphId: string,
    operation: Operation,
  ): Promise<void> {
    const graph = await this.graphRepository.findOne({
      where: { id: graphId },
    });

    if (!graph) {
      return;
    }

    graph.currentVersion = operation.version + 1;
    graph.operationCount++;

    switch (operation.type) {
      case 'addNode':
        graph.nodeCount++;
        break;
      case 'deleteNode':
        graph.nodeCount--;
        break;
      case 'addEdge':
        graph.edgeCount++;
        break;
      case 'deleteEdge':
        graph.edgeCount--;
        break;
    }

    await this.graphRepository.save(graph);
  }

  async updateGraphInfo(
    graphId: string,
    updates: Partial<Pick<GraphEntity, 'name' | 'description'>>,
  ): Promise<GraphEntity | null> {
    const graph = await this.graphRepository.findOne({
      where: { id: graphId },
    });

    if (!graph) {
      return null;
    }

    if (updates.name !== undefined) {
      graph.name = updates.name;
    }
    if (updates.description !== undefined) {
      graph.description = updates.description;
    }

    return this.graphRepository.save(graph);
  }

  async deleteGraph(graphId: string): Promise<void> {
    await this.operationRepository.delete({ graphId });
    await this.snapshotRepository.delete({ graphId });
    await this.graphRepository.delete({ id: graphId });
  }
}
