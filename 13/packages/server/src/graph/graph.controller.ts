import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GraphCollaborationService } from './graph-collaboration.service';
import { DatabaseStorageService } from '../database/database-storage.service';

@Controller('graphs')
export class GraphController {
  constructor(
    private readonly collaborationService: GraphCollaborationService,
    private readonly storageService: DatabaseStorageService,
  ) {}

  @Get()
  async listGraphs(): Promise<{
    data: Array<{
      id: string;
      name: string;
      description?: string;
      nodeCount: number;
      edgeCount: number;
      version: number;
      operationCount: number;
      updatedAt: Date;
    }>;
  }> {
    const graphs = await this.collaborationService.listGraphs();
    return { data: graphs };
  }

  @Post()
  async createGraph(
    @Body() body: { name: string; description?: string },
  ): Promise<{
    success: boolean;
    data: { id: string; name: string };
  }> {
    if (!body.name || body.name.trim() === '') {
      throw new HttpException(
        { success: false, message: 'Name is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.collaborationService.createGraph(
      body.name,
      body.description,
    );

    return { success: true, data: result };
  }

  @Get(':id')
  async getGraphInfo(
    @Param('id') id: string,
  ): Promise<{
    success: boolean;
    data?: {
      id: string;
      name: string;
      description?: string;
      nodeCount: number;
      edgeCount: number;
      version: number;
      operationCount: number;
      connectedUsers: string[];
    };
    message?: string;
  }> {
    const info = await this.collaborationService.getGraphInfo(id);

    if (!info) {
      throw new HttpException(
        { success: false, message: 'Graph not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    return { success: true, data: info };
  }

  @Put(':id')
  async updateGraphInfo(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ): Promise<{
    success: boolean;
    message?: string;
  }> {
    const result = await this.collaborationService.updateGraphInfo(id, body);

    if (!result.success) {
      throw new HttpException(result, HttpStatus.NOT_FOUND);
    }

    return result;
  }

  @Delete(':id')
  async deleteGraph(
    @Param('id') id: string,
  ): Promise<{ success: boolean; message?: string }> {
    const deleted = await this.collaborationService.deleteGraph(id);

    if (!deleted) {
      throw new HttpException(
        { success: false, message: 'Graph not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    return { success: true, message: 'Graph deleted successfully' };
  }

  @Get(':id/state')
  async getGraphState(
    @Param('id') id: string,
    @Query('version') version?: string,
  ): Promise<{
    success: boolean;
    data?: {
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
      isHistorical?: boolean;
    };
  }> {
    await this.collaborationService.ensureGraphLoaded(id);

    let state;
    if (version !== undefined) {
      state = await this.collaborationService.replayToVersion(
        id,
        parseInt(version, 10),
      );
      if (!state) {
        throw new HttpException(
          { success: false, message: 'Could not replay to requested version' },
          HttpStatus.BAD_REQUEST,
        );
      }
      return { success: true, data: { ...state, isHistorical: true } };
    }

    state = await this.collaborationService.getCurrentState(id);
    return { success: true, data: state };
  }

  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{
    success: boolean;
    data: {
      history: Array<{
        operation: any;
        sequenceNumber: number;
        timestamp: number;
      }>;
      totalCount: number;
      hasMore: boolean;
    };
  }> {
    await this.collaborationService.ensureGraphLoaded(id);

    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    const history = await this.collaborationService.getHistory(
      id,
      limitNum,
      offsetNum,
    );
    const totalCount = await this.collaborationService.getHistoryCount(id);

    return {
      success: true,
      data: {
        history,
        totalCount,
        hasMore: offsetNum + limitNum < totalCount,
      },
    };
  }

  @Get(':id/summary')
  async getStateSummary(
    @Param('id') id: string,
  ): Promise<{
    success: boolean;
    data?: {
      nodeCount: number;
      edgeCount: number;
      version: number;
      historySize: number;
      connectedUsers: string[];
    };
  }> {
    await this.collaborationService.ensureGraphLoaded(id);

    const summary = await this.collaborationService.getStateSummary(id);
    return { success: true, data: summary };
  }
}
