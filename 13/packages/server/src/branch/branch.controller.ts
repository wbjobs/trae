import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { BranchService, CreateBranchOptions, MergeBranchesOptions } from './branch.service';
import type {
  Branch,
  Commit,
  MergeResult,
} from '@collaborative-graph/shared';

@Controller('api/graphs/:graphId/branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  async getBranches(@Param('graphId') graphId: string): Promise<Branch[]> {
    return this.branchService.getBranchesByGraph(graphId);
  }

  @Get('main')
  async getMainBranch(@Param('graphId') graphId: string): Promise<Branch> {
    const branch = await this.branchService.getMainBranch(graphId);
    if (!branch) {
      throw new HttpException('Main branch not found', HttpStatus.NOT_FOUND);
    }
    return branch;
  }

  @Get(':branchId')
  async getBranch(
    @Param('graphId') graphId: string,
    @Param('branchId') branchId: string,
  ): Promise<Branch> {
    const branch = await this.branchService.getBranch(branchId);
    if (!branch || branch.graphId !== graphId) {
      throw new HttpException('Branch not found', HttpStatus.NOT_FOUND);
    }
    return branch;
  }

  @Post()
  async createBranch(
    @Param('graphId') graphId: string,
    @Body() body: {
      name: string;
      userId: string;
      fromBranchId?: string;
      fromCommitId?: string;
      fromVersion?: number;
      description?: string;
    },
  ): Promise<Branch> {
    const options: CreateBranchOptions = {
      graphId,
      name: body.name,
      userId: body.userId,
      fromBranchId: body.fromBranchId,
      fromCommitId: body.fromCommitId,
      fromVersion: body.fromVersion,
      description: body.description,
    };

    return this.branchService.createBranch(options);
  }

  @Put(':branchId')
  async updateBranch(
    @Param('graphId') graphId: string,
    @Param('branchId') branchId: string,
    @Body() body: {
      name?: string;
      description?: string;
    },
  ): Promise<Branch> {
    const branch = await this.branchService.getBranch(branchId);
    if (!branch || branch.graphId !== graphId) {
      throw new HttpException('Branch not found', HttpStatus.NOT_FOUND);
    }

    return this.branchService.updateBranch(branchId, body);
  }

  @Delete(':branchId')
  async deleteBranch(
    @Param('graphId') graphId: string,
    @Param('branchId') branchId: string,
    @Query('userId') userId: string,
  ): Promise<{ success: boolean }> {
    const branch = await this.branchService.getBranch(branchId);
    if (!branch || branch.graphId !== graphId) {
      throw new HttpException('Branch not found', HttpStatus.NOT_FOUND);
    }

    const success = await this.branchService.deleteBranch(branchId, userId);
    return { success };
  }

  @Get(':branchId/commits')
  async getBranchCommits(
    @Param('graphId') graphId: string,
    @Param('branchId') branchId: string,
    @Query('limit') limit?: string,
  ): Promise<Commit[]> {
    const branch = await this.branchService.getBranch(branchId);
    if (!branch || branch.graphId !== graphId) {
      throw new HttpException('Branch not found', HttpStatus.NOT_FOUND);
    }

    return this.branchService.getCommits(branchId, limit ? parseInt(limit, 10) : undefined);
  }

  @Post('merge')
  async mergeBranches(
    @Param('graphId') graphId: string,
    @Body() body: {
      sourceBranchId: string;
      targetBranchId: string;
      userId: string;
      strategy?: 'ours' | 'theirs' | 'auto';
      message?: string;
    },
  ): Promise<MergeResult> {
    const options: MergeBranchesOptions = {
      sourceBranchId: body.sourceBranchId,
      targetBranchId: body.targetBranchId,
      userId: body.userId,
      strategy: body.strategy || 'auto',
      message: body.message,
    };

    const sourceBranch = await this.branchService.getBranch(options.sourceBranchId);
    const targetBranch = await this.branchService.getBranch(options.targetBranchId);

    if (!sourceBranch || sourceBranch.graphId !== graphId) {
      throw new HttpException('Source branch not found', HttpStatus.NOT_FOUND);
    }

    if (!targetBranch || targetBranch.graphId !== graphId) {
      throw new HttpException('Target branch not found', HttpStatus.NOT_FOUND);
    }

    return this.branchService.mergeBranches(options);
  }

  @Post('merge-preview')
  async previewMerge(
    @Param('graphId') graphId: string,
    @Body() body: {
      sourceBranchId: string;
      targetBranchId: string;
    },
  ): Promise<{
    hasConflicts: boolean;
    conflictCount: number;
    sampleConflicts: Array<{
      type: 'node' | 'edge';
      targetId: string;
      autoResolved: boolean;
    }>;
    estimatedNewOperations: number;
  }> {
    const sourceBranch = await this.branchService.getBranch(body.sourceBranchId);
    const targetBranch = await this.branchService.getBranch(body.targetBranchId);

    if (!sourceBranch || sourceBranch.graphId !== graphId) {
      throw new HttpException('Source branch not found', HttpStatus.NOT_FOUND);
    }

    if (!targetBranch || targetBranch.graphId !== graphId) {
      throw new HttpException('Target branch not found', HttpStatus.NOT_FOUND);
    }

    return this.branchService.previewMerge(body.sourceBranchId, body.targetBranchId);
  }
}
