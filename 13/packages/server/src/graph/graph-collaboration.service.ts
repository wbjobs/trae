import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OTService } from '../ot/ot.service';
import { DatabaseStorageService } from '../database/database-storage.service';
import type {
  Operation,
  SerializedGraphState,
  OperationHistoryEntry,
} from '@collaborative-graph/shared';

@Injectable()
export class GraphCollaborationService implements OnModuleInit {
  private readonly logger = new Logger(GraphCollaborationService.name);
  private readonly connectedUsers = new Map<string, Set<string>>();

  constructor(
    private readonly otService: OTService,
    private readonly storageService: DatabaseStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Graph Collaboration Service initialized');
  }

  async createGraph(
    name: string,
    description?: string,
  ): Promise<{ id: string; name: string }> {
    const graph = await this.storageService.createGraph(name, description);
    this.logger.log(`Created new graph: ${graph.id}`);
    return { id: graph.id, name: graph.name };
  }

  async listGraphs(): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      nodeCount: number;
      edgeCount: number;
      version: number;
      operationCount: number;
      updatedAt: Date;
    }>
  > {
    const graphs = await this.storageService.getAllGraphs();
    return graphs.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      nodeCount: g.nodeCount,
      edgeCount: g.edgeCount,
      version: g.currentVersion,
      operationCount: g.operationCount,
      updatedAt: g.updatedAt,
    }));
  }

  async getGraphInfo(
    graphId: string,
  ): Promise<{
    id: string;
    name: string;
    description?: string;
    nodeCount: number;
    edgeCount: number;
    version: number;
    operationCount: number;
    connectedUsers: string[];
  } | null> {
    const graph = await this.storageService.getGraph(graphId);
    if (!graph) {
      return null;
    }

    return {
      id: graph.id,
      name: graph.name,
      description: graph.description,
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
      version: graph.currentVersion,
      operationCount: graph.operationCount,
      connectedUsers: Array.from(this.connectedUsers.get(graphId) || []),
    };
  }

  async initializeGraphState(graphId: string): Promise<SerializedGraphState> {
    const { state } = await this.storageService.loadGraphState(graphId);
    this.otService.setStateManager(graphId, state);
    this.logger.log(
      `Initialized graph state for ${graphId} with ${state.nodes.length} nodes and ${state.edges.length} edges`,
    );
    return state;
  }

  async getCurrentState(graphId: string): Promise<SerializedGraphState> {
    return this.otService.getCurrentState(graphId);
  }

  async processOperation(
    graphId: string,
    operation: Operation,
  ): Promise<{
    applied: boolean;
    transformedOperation?: Operation;
    conflicts: Operation[];
    currentState: SerializedGraphState;
  }> {
    const result = this.otService.processOperation(graphId, operation);

    if (result.applied && result.transformedOperation) {
      const historyCount = this.otService.getHistoryCount(graphId);
      await this.storageService.saveOperation(
        graphId,
        result.transformedOperation,
        historyCount - 1,
      );

      if (historyCount % 100 === 0) {
        await this.storageService.saveSnapshot(
          graphId,
          result.currentState,
        );
        this.logger.log(
          `Created snapshot for graph ${graphId} at version ${result.currentState.version}`,
        );
      }
    }

    return result;
  }

  async getHistory(
    graphId: string,
    limit?: number,
    offset?: number,
  ): Promise<OperationHistoryEntry[]> {
    const history = this.otService.getHistory(graphId);
    if (limit !== undefined || offset !== undefined) {
      const start = offset || 0;
      const end = limit !== undefined ? start + limit : history.length;
      return history.slice(start, end);
    }
    return history;
  }

  async getHistoryCount(graphId: string): Promise<number> {
    return this.otService.getHistoryCount(graphId);
  }

  async replayToVersion(
    graphId: string,
    version: number,
  ): Promise<SerializedGraphState | null> {
    let state = this.otService.replayToVersion(graphId, version);

    if (!state) {
      const { state: dbState } = await this.storageService.loadGraphState(
        graphId,
        version,
      );
      state = dbState;
    }

    return state;
  }

  async replayToTimestamp(
    graphId: string,
    timestamp: number,
  ): Promise<SerializedGraphState | null> {
    let state = this.otService.replayToTimestamp(graphId, timestamp);

    if (!state) {
      const dbOperations = await this.storageService.getOperations(graphId);
      const relevantOps = dbOperations
        .filter((op) => op.timestamp <= timestamp)
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      if (relevantOps.length > 0) {
        const version = relevantOps[relevantOps.length - 1].version + 1;
        const { state: dbState } = await this.storageService.loadGraphState(
          graphId,
          version,
        );
        state = dbState;
      } else {
        state = { nodes: [], edges: [], version: 0 };
      }
    }

    return state;
  }

  userJoin(graphId: string, userId: string): void {
    if (!this.connectedUsers.has(graphId)) {
      this.connectedUsers.set(graphId, new Set());
    }
    this.connectedUsers.get(graphId)!.add(userId);
    this.logger.log(`User ${userId} joined graph ${graphId}`);
  }

  userLeave(graphId: string, userId: string): void {
    const users = this.connectedUsers.get(graphId);
    if (users) {
      users.delete(userId);
      if (users.size === 0) {
        this.connectedUsers.delete(graphId);
      }
    }
    this.logger.log(`User ${userId} left graph ${graphId}`);
  }

  getConnectedUsers(graphId: string): string[] {
    return Array.from(this.connectedUsers.get(graphId) || []);
  }

  async getStateSummary(
    graphId: string,
  ): Promise<{
    nodeCount: number;
    edgeCount: number;
    version: number;
    historySize: number;
    connectedUsers: string[];
  }> {
    const summary = this.otService.getStateSummary(graphId);
    return {
      ...summary,
      connectedUsers: this.getConnectedUsers(graphId),
    };
  }

  async ensureGraphLoaded(graphId: string): Promise<void> {
    const manager = this.otService.getOrCreateStateManager(graphId);
    if (manager.getVersion() === 0 && manager.getHistoryCount() === 0) {
      const graph = await this.storageService.getGraph(graphId);
      if (graph) {
        await this.initializeGraphState(graphId);
      }
    }
  }

  async deleteGraph(graphId: string): Promise<boolean> {
    const graph = await this.storageService.getGraph(graphId);
    if (!graph) {
      return false;
    }

    await this.storageService.deleteGraph(graphId);
    this.otService.clearGraphState(graphId);
    this.connectedUsers.delete(graphId);

    this.logger.log(`Deleted graph ${graphId}`);
    return true;
  }

  async updateGraphInfo(
    graphId: string,
    updates: { name?: string; description?: string },
  ): Promise<{ success: boolean; message?: string }> {
    const result = await this.storageService.updateGraphInfo(
      graphId,
      updates,
    );
    return {
      success: result !== null,
      message: result ? 'Graph info updated' : 'Graph not found',
    };
  }
}
