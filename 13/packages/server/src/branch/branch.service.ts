import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from '../database/entities/branch.entity';
import { CommitEntity } from '../database/entities/commit.entity';
import { GraphEntity } from '../database/entities/graph.entity';
import {
  CRDTMerger,
  type MergeConfig,
} from '@collaborative-graph/shared';
import type {
  Branch,
  Commit,
  MergeResult,
  SerializedGraphState,
  Operation,
} from '@collaborative-graph/shared';
import { DatabaseStorageService } from '../database/database-storage.service';

export interface CreateBranchOptions {
  graphId: string;
  name: string;
  userId: string;
  fromBranchId?: string;
  fromCommitId?: string;
  fromVersion?: number;
  description?: string;
}

export interface MergeBranchesOptions {
  sourceBranchId: string;
  targetBranchId: string;
  userId: string;
  strategy: 'ours' | 'theirs' | 'auto';
  message?: string;
}

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);
  private readonly merger = new CRDTMerger();

  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepository: Repository<BranchEntity>,
    @InjectRepository(CommitEntity)
    private readonly commitRepository: Repository<CommitEntity>,
    @InjectRepository(GraphEntity)
    private readonly graphRepository: Repository<GraphEntity>,
    private readonly storageService: DatabaseStorageService,
  ) {}

  async createMainBranch(graphId: string, userId: string): Promise<Branch> {
    const existingMain = await this.branchRepository.findOne({
      where: { graphId, isMain: true },
    });

    if (existingMain) {
      throw new BadRequestException('Main branch already exists for this graph');
    }

    const branch = this.branchRepository.create({
      name: 'main',
      graphId,
      isMain: true,
      parentBranchId: null,
      parentCommitId: null,
      parentVersion: 0,
      createdBy: userId,
      currentVersion: 0,
      operationCount: 0,
      description: 'Main branch - default development branch',
    });

    const saved = await this.branchRepository.save(branch);
    return this.convertToBranch(saved);
  }

  async createBranch(options: CreateBranchOptions): Promise<Branch> {
    const { graphId, name, userId, description } = options;

    const graph = await this.graphRepository.findOne({ where: { id: graphId } });
    if (!graph) {
      throw new NotFoundException('Graph not found');
    }

    const existingBranch = await this.branchRepository.findOne({
      where: { graphId, name },
    });

    if (existingBranch) {
      throw new BadRequestException(`Branch with name '${name}' already exists`);
    }

    let parentBranchId = options.fromBranchId;
    let parentVersion = options.fromVersion || 0;
    let parentCommitId = options.fromCommitId || null;

    if (!parentBranchId) {
      const mainBranch = await this.branchRepository.findOne({
        where: { graphId, isMain: true },
      });

      if (!mainBranch) {
        throw new BadRequestException('No branches exist for this graph');
      }

      parentBranchId = mainBranch.id;
      parentVersion = options.fromVersion || mainBranch.currentVersion;
    }

    const parentBranch = await this.branchRepository.findOne({
      where: { id: parentBranchId },
    });

    if (!parentBranch) {
      throw new NotFoundException('Parent branch not found');
    }

    if (parentVersion > parentBranch.currentVersion) {
      throw new BadRequestException('Invalid parent version');
    }

    if (parentCommitId) {
      const commit = await this.commitRepository.findOne({
        where: { id: parentCommitId },
      });

      if (!commit || commit.branchId !== parentBranchId) {
        throw new BadRequestException('Invalid parent commit');
      }

      parentVersion = commit.version;
    }

    const branch = this.branchRepository.create({
      name,
      graphId,
      isMain: false,
      parentBranchId,
      parentCommitId,
      parentVersion,
      createdBy: userId,
      currentVersion: parentVersion,
      operationCount: 0,
      description: description || null,
    });

    const saved = await this.branchRepository.save(branch);
    this.logger.log(
      `Created branch '${name}' from branch '${parentBranch.name}' at version ${parentVersion}`,
    );

    return this.convertToBranch(saved);
  }

  async getBranch(branchId: string): Promise<Branch | null> {
    const entity = await this.branchRepository.findOne({ where: { id: branchId } });
    return entity ? this.convertToBranch(entity) : null;
  }

  async getBranchesByGraph(graphId: string): Promise<Branch[]> {
    const entities = await this.branchRepository.find({
      where: { graphId },
      order: { isMain: 'DESC', createdAt: 'ASC' },
    });
    return entities.map(this.convertToBranch);
  }

  async getMainBranch(graphId: string): Promise<Branch | null> {
    const entity = await this.branchRepository.findOne({
      where: { graphId, isMain: true },
    });
    return entity ? this.convertToBranch(entity) : null;
  }

  async deleteBranch(branchId: string, userId: string): Promise<boolean> {
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.isMain) {
      throw new BadRequestException('Cannot delete main branch');
    }

    const childBranches = await this.branchRepository.find({
      where: { parentBranchId: branchId },
    });

    if (childBranches.length > 0) {
      throw new BadRequestException(
        'Cannot delete branch with child branches. Delete child branches first.',
      );
    }

    await this.branchRepository.delete(branchId);
    this.logger.log(`Branch '${branch.name}' deleted by user '${userId}'`);

    return true;
  }

  async updateBranch(
    branchId: string,
    updates: { name?: string; description?: string },
  ): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (updates.name && updates.name !== branch.name) {
      const existing = await this.branchRepository.findOne({
        where: { graphId: branch.graphId, name: updates.name },
      });

      if (existing) {
        throw new BadRequestException(
          `Branch with name '${updates.name}' already exists`,
        );
      }

      branch.name = updates.name;
    }

    if (updates.description !== undefined) {
      branch.description = updates.description || null;
    }

    const saved = await this.branchRepository.save(branch);
    return this.convertToBranch(saved);
  }

  async createCommit(
    branchId: string,
    options: {
      message: string;
      author: string;
      operationIds: string[];
      stateSnapshotId?: string;
      version: number;
      sequenceNumber: number;
      parentCommitId?: string;
    },
  ): Promise<Commit> {
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const lastCommit = await this.commitRepository.findOne({
      where: { branchId },
      order: { sequenceNumber: 'DESC' },
    });

    const commit = this.commitRepository.create({
      branchId,
      graphId: branch.graphId,
      version: options.version,
      sequenceNumber: options.sequenceNumber,
      parentCommitId: options.parentCommitId || lastCommit?.id || null,
      message: options.message,
      author: options.author,
      operationIds: options.operationIds,
      stateSnapshotId: options.stateSnapshotId || null,
    });

    const saved = await this.commitRepository.save(commit);
    return this.convertToCommit(saved);
  }

  async getCommits(branchId: string, limit?: number): Promise<Commit[]> {
    const queryBuilder = this.commitRepository
      .createQueryBuilder('commit')
      .where('commit.branchId = :branchId', { branchId })
      .orderBy('commit.sequenceNumber', 'DESC');

    if (limit) {
      queryBuilder.limit(limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map(this.convertToCommit);
  }

  async getCommit(commitId: string): Promise<Commit | null> {
    const entity = await this.commitRepository.findOne({
      where: { id: commitId },
    });
    return entity ? this.convertToCommit(entity) : null;
  }

  async mergeBranches(options: MergeBranchesOptions): Promise<MergeResult> {
    const { sourceBranchId, targetBranchId, userId, strategy, message } = options;

    const sourceBranch = await this.branchRepository.findOne({
      where: { id: sourceBranchId },
    });

    if (!sourceBranch) {
      throw new NotFoundException('Source branch not found');
    }

    const targetBranch = await this.branchRepository.findOne({
      where: { id: targetBranchId },
    });

    if (!targetBranch) {
      throw new NotFoundException('Target branch not found');
    }

    if (sourceBranch.graphId !== targetBranch.graphId) {
      throw new BadRequestException('Branches are from different graphs');
    }

    if (sourceBranchId === targetBranchId) {
      throw new BadRequestException('Cannot merge branch into itself');
    }

    const commonAncestor = await this.findCommonAncestor(
      sourceBranchId,
      targetBranchId,
    );

    const baseVersion = commonAncestor?.version || sourceBranch.parentVersion;

    const { state: baseState } = await this.storageService.loadGraphState(
      sourceBranch.graphId,
      baseVersion,
    );

    const sourceOperations = await this.getBranchOperations(
      sourceBranchId,
      baseVersion,
    );

    const targetOperations = await this.getBranchOperations(
      targetBranchId,
      baseVersion,
    );

    const baseOperations = await this.getBranchOperations(
      sourceBranch.parentBranchId || targetBranchId,
      0,
      baseVersion,
    );

    const mergeResult = this.merger.merge(
      sourceOperations,
      targetOperations,
      baseOperations,
      baseState,
      strategy,
    );

    if (mergeResult.success) {
      const newVersion = targetBranch.currentVersion + mergeResult.mergedOperations.length;

      await this.branchRepository.update(targetBranchId, {
        currentVersion: newVersion,
        operationCount: targetBranch.operationCount + mergeResult.mergedOperations.length,
      });

      this.logger.log(
        `Merged branch '${sourceBranch.name}' into '${targetBranch.name}' with ${mergeResult.mergedOperations.length} operations`,
      );
    } else {
      this.logger.warn(
        `Merge from '${sourceBranch.name}' to '${targetBranch.name}' has ${mergeResult.conflicts.length} unresolved conflicts`,
      );
    }

    return {
      ...mergeResult,
      sourceBranchId,
      targetBranchId,
      baseCommitId: commonAncestor?.id || null,
    };
  }

  async previewMerge(
    sourceBranchId: string,
    targetBranchId: string,
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
    const sourceBranch = await this.branchRepository.findOne({
      where: { id: sourceBranchId },
    });

    if (!sourceBranch) {
      throw new NotFoundException('Source branch not found');
    }

    const targetBranch = await this.branchRepository.findOne({
      where: { id: targetBranchId },
    });

    if (!targetBranch) {
      throw new NotFoundException('Target branch not found');
    }

    const commonAncestor = await this.findCommonAncestor(
      sourceBranchId,
      targetBranchId,
    );

    const baseVersion = commonAncestor?.version || sourceBranch.parentVersion;

    const { state: baseState } = await this.storageService.loadGraphState(
      sourceBranch.graphId,
      baseVersion,
    );

    const sourceOperations = await this.getBranchOperations(
      sourceBranchId,
      baseVersion,
    );

    const targetOperations = await this.getBranchOperations(
      targetBranchId,
      baseVersion,
    );

    const baseOperations = await this.getBranchOperations(
      sourceBranch.parentBranchId || targetBranchId,
      0,
      baseVersion,
    );

    const preview = this.merger.previewMerge(
      sourceOperations,
      targetOperations,
      baseOperations,
      baseState,
    );

    return {
      ...preview,
      sampleConflicts: preview.sampleConflicts.map((c) => ({
        type: c.type,
        targetId: c.targetId,
        autoResolved: c.autoResolved,
      })),
    };
  }

  private async findCommonAncestor(
    branchAId: string,
    branchBId: string,
  ): Promise<Commit | null> {
    const commitsA = await this.commitRepository.find({
      where: { branchId: branchAId },
      order: { sequenceNumber: 'DESC' },
    });

    const commitIdsA = new Set(commitsA.map((c) => c.id));

    const commitsB = await this.commitRepository.find({
      where: { branchId: branchBId },
      order: { sequenceNumber: 'DESC' },
    });

    for (const commit of commitsB) {
      if (commitIdsA.has(commit.id)) {
        return this.convertToCommit(commit);
      }

      let currentParentId = commit.parentCommitId;
      while (currentParentId) {
        if (commitIdsA.has(currentParentId)) {
          const parentCommit = await this.commitRepository.findOne({
            where: { id: currentParentId },
          });
          if (parentCommit) {
            return this.convertToCommit(parentCommit);
          }
          break;
        }
        const parentCommit = await this.commitRepository.findOne({
          where: { id: currentParentId },
        });
        currentParentId = parentCommit?.parentCommitId || null;
      }
    }

    return null;
  }

  private async getBranchOperations(
    branchId: string,
    startVersion: number,
    endVersion?: number,
  ): Promise<Operation[]> {
    const operations = await this.storageService.getOperations(
      branchId,
      startVersion,
    );

    let filtered = operations;
    if (endVersion !== undefined) {
      filtered = operations.filter((op) => op.version < endVersion);
    }

    return filtered.map((entity) => entity.payload as Operation);
  }

  private convertToBranch(entity: BranchEntity): Branch {
    return {
      id: entity.id,
      name: entity.name,
      graphId: entity.graphId,
      isMain: entity.isMain,
      parentBranchId: entity.parentBranchId,
      parentCommitId: entity.parentCommitId,
      parentVersion: entity.parentVersion,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.getTime(),
      updatedAt: entity.updatedAt.getTime(),
      currentVersion: entity.currentVersion,
      operationCount: entity.operationCount,
      description: entity.description || undefined,
    };
  }

  private convertToCommit(entity: CommitEntity): Commit {
    return {
      id: entity.id,
      branchId: entity.branchId,
      graphId: entity.graphId,
      version: entity.version,
      sequenceNumber: entity.sequenceNumber,
      parentCommitId: entity.parentCommitId,
      message: entity.message,
      author: entity.author,
      createdAt: entity.createdAt.getTime(),
      operationIds: entity.operationIds,
      stateSnapshotId: entity.stateSnapshotId || undefined,
    };
  }
}
