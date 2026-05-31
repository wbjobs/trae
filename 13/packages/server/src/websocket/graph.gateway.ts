import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphCollaborationService } from '../graph/graph-collaboration.service';
import type { Operation, UserCursor } from '@collaborative-graph/shared';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/graph',
})
export class GraphGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GraphGateway.name);
  private readonly socketUserMap = new Map<string, { userId: string; graphId: string }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly collaborationService: GraphCollaborationService,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const userInfo = this.socketUserMap.get(client.id);
    if (userInfo) {
      this.collaborationService.userLeave(
        userInfo.graphId,
        userInfo.userId,
      );
      this.broadcastUserLeft(userInfo.graphId, userInfo.userId);
      this.socketUserMap.delete(client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinGraph')
  async handleJoinGraph(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { graphId: string; userId: string },
  ): Promise<void> {
    const { graphId, userId } = data;

    await this.collaborationService.ensureGraphLoaded(graphId);
    this.collaborationService.userJoin(graphId, userId);

    this.socketUserMap.set(client.id, { userId, graphId });

    client.join(graphId);

    const state = await this.collaborationService.getCurrentState(graphId);
    const connectedUsers = this.collaborationService.getConnectedUsers(graphId);

    client.emit('graphState', { state, connectedUsers });

    this.broadcastUserJoined(graphId, userId);

    this.logger.log(
      `User ${userId} joined graph ${graphId}, total users: ${connectedUsers.length}`,
    );
  }

  @SubscribeMessage('leaveGraph')
  handleLeaveGraph(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { graphId: string; userId: string },
  ): void {
    const { graphId, userId } = data;

    this.collaborationService.userLeave(graphId, userId);
    client.leave(graphId);
    this.socketUserMap.delete(client.id);

    this.broadcastUserLeft(graphId, userId);

    this.logger.log(`User ${userId} left graph ${graphId}`);
  }

  @SubscribeMessage('operation')
  async handleOperation(
    @ConnectedSocket() client: Socket,
    @MessageBody() operation: Operation,
  ): Promise<void> {
    const userInfo = this.socketUserMap.get(client.id);
    if (!userInfo) {
      client.emit('error', { message: 'Not connected to a graph' });
      return;
    }

    const result = await this.collaborationService.processOperation(
      userInfo.graphId,
      operation,
    );

    if (!result.applied) {
      client.emit('operationRejected', {
        operationId: operation.id,
        reason: 'Operation could not be applied',
        conflicts: result.conflicts,
      });
      return;
    }

    if (result.transformedOperation) {
      this.server.to(userInfo.graphId).emit('operation', {
        operation: result.transformedOperation,
        fromUserId: userInfo.userId,
      });

      client.emit('operationAck', {
        operationId: operation.id,
        newVersion: result.currentState.version,
      });
    }

    this.logger.debug(
      `Processed operation ${operation.type} from user ${userInfo.userId} on graph ${userInfo.graphId}`,
    );
  }

  @SubscribeMessage('cursorUpdate')
  handleCursorUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() cursor: UserCursor,
  ): void {
    const userInfo = this.socketUserMap.get(client.id);
    if (!userInfo) {
      return;
    }

    this.server.to(userInfo.graphId).emit('cursorUpdate', cursor);
  }

  @SubscribeMessage('requestState')
  async handleRequestState(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { graphId: string; version?: number },
  ): Promise<void> {
    await this.collaborationService.ensureGraphLoaded(data.graphId);

    if (data.version !== undefined) {
      const state = await this.collaborationService.replayToVersion(
        data.graphId,
        data.version,
      );
      if (state) {
        client.emit('graphState', { state, isHistorical: true });
      }
    } else {
      const state = await this.collaborationService.getCurrentState(
        data.graphId,
      );
      client.emit('graphState', { state });
    }
  }

  @SubscribeMessage('requestHistory')
  async handleRequestHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { graphId: string; limit?: number; offset?: number },
  ): Promise<void> {
    await this.collaborationService.ensureGraphLoaded(data.graphId);

    const history = await this.collaborationService.getHistory(
      data.graphId,
      data.limit,
      data.offset,
    );
    const totalCount = await this.collaborationService.getHistoryCount(
      data.graphId,
    );

    client.emit('history', {
      history,
      totalCount,
      hasMore: data.offset !== undefined && data.offset + (data.limit || 50) < totalCount,
    });
  }

  @SubscribeMessage('replayToVersion')
  async handleReplayToVersion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { graphId: string; version: number },
  ): Promise<void> {
    await this.collaborationService.ensureGraphLoaded(data.graphId);

    const state = await this.collaborationService.replayToVersion(
      data.graphId,
      data.version,
    );

    if (state) {
      client.emit('replayState', {
        state,
        targetVersion: data.version,
      });
    } else {
      client.emit('error', { message: 'Could not replay to requested version' });
    }
  }

  @SubscribeMessage('replayToTimestamp')
  async handleReplayToTimestamp(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { graphId: string; timestamp: number },
  ): Promise<void> {
    await this.collaborationService.ensureGraphLoaded(data.graphId);

    const state = await this.collaborationService.replayToTimestamp(
      data.graphId,
      data.timestamp,
    );

    if (state) {
      client.emit('replayState', {
        state,
        targetTimestamp: data.timestamp,
      });
    } else {
      client.emit('error', { message: 'Could not replay to requested timestamp' });
    }
  }

  @SubscribeMessage('getStateSummary')
  async handleGetStateSummary(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { graphId: string },
  ): Promise<void> {
    await this.collaborationService.ensureGraphLoaded(data.graphId);

    const summary = await this.collaborationService.getStateSummary(
      data.graphId,
    );
    client.emit('stateSummary', summary);
  }

  private broadcastUserJoined(graphId: string, userId: string): void {
    this.server.to(graphId).emit('userJoined', {
      userId,
      connectedUsers: this.collaborationService.getConnectedUsers(graphId),
    });
  }

  private broadcastUserLeft(graphId: string, userId: string): void {
    this.server.to(graphId).emit('userLeft', {
      userId,
      connectedUsers: this.collaborationService.getConnectedUsers(graphId),
    });
  }
}
