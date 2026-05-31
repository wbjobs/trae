import type {
  Branch,
  Commit,
  SerializedGraphState,
  OperationHistoryEntry,
} from './types';

export interface BranchCreationOptions {
  name: string;
  graphId: string;
  userId: string;
  fromCommitId?: string;
  fromVersion?: number;
  description?: string;
}

export class BranchManager {
  private branches: Map<string, Branch> = new Map();
  private commits: Map<string, Commit[]> = new Map();
  private mainBranchId: string | null = null;

  createMainBranch(graphId: string, userId: string): Branch {
    const existingMain = Array.from(this.branches.values()).find(
      (b) => b.graphId === graphId && b.isMain,
    );

    if (existingMain) {
      throw new Error('Main branch already exists for this graph');
    }

    const now = Date.now();
    const mainBranch: Branch = {
      id: `branch_main_${graphId}`,
      name: 'main',
      graphId,
      isMain: true,
      parentBranchId: null,
      parentCommitId: null,
      parentVersion: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      currentVersion: 0,
      operationCount: 0,
      description: 'Main branch - default development branch',
    };

    this.branches.set(mainBranch.id, mainBranch);
    this.mainBranchId = mainBranch.id;
    this.commits.set(mainBranch.id, []);

    return mainBranch;
  }

  createBranch(
    options: BranchCreationOptions,
    parentBranch: Branch,
    parentState: SerializedGraphState,
  ): Branch {
    const now = Date.now();
    const fromVersion = options.fromVersion ?? parentBranch.currentVersion;

    const branch: Branch = {
      id: `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: options.name,
      graphId: options.graphId,
      isMain: false,
      parentBranchId: parentBranch.id,
      parentCommitId: options.fromCommitId ?? null,
      parentVersion: fromVersion,
      createdBy: options.userId,
      createdAt: now,
      updatedAt: now,
      currentVersion: fromVersion,
      operationCount: 0,
      description: options.description,
    };

    this.branches.set(branch.id, branch);
    this.commits.set(branch.id, []);

    return branch;
  }

  getBranch(branchId: string): Branch | undefined {
    return this.branches.get(branchId);
  }

  getBranchesByGraph(graphId: string): Branch[] {
    return Array.from(this.branches.values()).filter(
      (branch) => branch.graphId === graphId,
    );
  }

  getMainBranch(graphId: string): Branch | undefined {
    return Array.from(this.branches.values()).find(
      (branch) => branch.graphId === graphId && branch.isMain,
    );
  }

  updateBranch(branchId: string, updates: Partial<Branch>): Branch | null {
    const branch = this.branches.get(branchId);
    if (!branch) return null;

    const updated: Branch = {
      ...branch,
      ...updates,
      updatedAt: Date.now(),
    };

    this.branches.set(branchId, updated);
    return updated;
  }

  deleteBranch(branchId: string): boolean {
    const branch = this.branches.get(branchId);
    if (!branch || branch.isMain) return false;

    this.branches.delete(branchId);
    this.commits.delete(branchId);
    return true;
  }

  createCommit(
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
  ): Commit {
    const now = Date.now();
    const commits = this.commits.get(branchId) || [];
    const lastCommit = commits[commits.length - 1];

    const commit: Commit = {
      id: `commit_${now}_${Math.random().toString(36).substr(2, 9)}`,
      branchId,
      graphId: this.branches.get(branchId)?.graphId || '',
      version: options.version,
      sequenceNumber: options.sequenceNumber,
      parentCommitId: options.parentCommitId ?? lastCommit?.id ?? null,
      message: options.message,
      author: options.author,
      createdAt: now,
      operationIds: options.operationIds,
      stateSnapshotId: options.stateSnapshotId,
    };

    commits.push(commit);
    this.commits.set(branchId, commits);

    return commit;
  }

  getCommits(branchId: string, limit?: number): Commit[] {
    const commits = this.commits.get(branchId) || [];
    if (limit) {
      return commits.slice(-limit);
    }
    return [...commits];
  }

  getCommit(commitId: string): Commit | undefined {
    for (const commits of this.commits.values()) {
      const commit = commits.find((c) => c.id === commitId);
      if (commit) return commit;
    }
    return undefined;
  }

  getCommitByVersion(branchId: string, version: number): Commit | undefined {
    const commits = this.commits.get(branchId) || [];
    return commits.find((c) => c.version === version);
  }

  getCommitHistory(
    branchId: string,
    startVersion?: number,
    endVersion?: number,
  ): Commit[] {
    const commits = this.commits.get(branchId) || [];
    return commits.filter((c) => {
      const afterStart = startVersion === undefined || c.version >= startVersion;
      const beforeEnd = endVersion === undefined || c.version <= endVersion;
      return afterStart && beforeEnd;
    });
  }

  findCommonAncestor(
    branchAId: string,
    branchBId: string,
  ): Commit | null {
    const commitsA = new Map(
      this.getCommits(branchAId).map((c) => [c.id, c]),
    );
    const commitsB = this.getCommits(branchBId);

    for (const commit of commitsB) {
      if (commitsA.has(commit.id)) {
        return commit;
      }

      let current = commit.parentCommitId;
      while (current) {
        const parentCommit = this.getCommit(current);
        if (!parentCommit) break;
        if (commitsA.has(parentCommit.id)) {
          return parentCommit;
        }
        current = parentCommit.parentCommitId;
      }
    }

    const branchA = this.getBranch(branchAId);
    const branchB = this.getBranch(branchBId);

    if (branchA?.parentBranchId === branchBId) {
      return this.getCommitByVersion(branchBId, branchA.parentVersion) || null;
    }

    if (branchB?.parentBranchId === branchAId) {
      return this.getCommitByVersion(branchAId, branchB.parentVersion) || null;
    }

    return null;
  }

  getBranchLineage(branchId: string): Branch[] {
    const lineage: Branch[] = [];
    let current = this.getBranch(branchId);

    while (current) {
      lineage.unshift(current);
      if (!current.parentBranchId) break;
      current = this.getBranch(current.parentBranchId);
    }

    return lineage;
  }

  serializeBranchManager(): {
    branches: Branch[];
    commits: Array<{ branchId: string; commits: Commit[] }>;
    mainBranchId: string | null;
  } {
    return {
      branches: Array.from(this.branches.values()),
      commits: Array.from(this.commits.entries()).map(([branchId, commits]) => ({
        branchId,
        commits,
      })),
      mainBranchId: this.mainBranchId,
    };
  }

  static deserializeBranchManager(data: {
    branches: Branch[];
    commits: Array<{ branchId: string; commits: Commit[] }>;
    mainBranchId: string | null;
  }): BranchManager {
    const manager = new BranchManager();

    data.branches.forEach((branch) => {
      manager.branches.set(branch.id, branch);
    });

    data.commits.forEach((entry) => {
      manager.commits.set(entry.branchId, entry.commits);
    });

    manager.mainBranchId = data.mainBranchId;

    return manager;
  }
}
