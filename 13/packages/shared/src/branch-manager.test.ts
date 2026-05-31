import { describe, it, expect, beforeEach } from 'vitest';
import { BranchManager } from './branch-manager';
import type { Branch, Commit } from './types';

describe('BranchManager', () => {
  let manager: BranchManager;

  beforeEach(() => {
    manager = new BranchManager();
  });

  describe('createMainBranch', () => {
    it('should create main branch successfully', () => {
      const branch = manager.createMainBranch('graph-1', 'user-1');

      expect(branch).toBeDefined();
      expect(branch.name).toBe('main');
      expect(branch.isMain).toBe(true);
      expect(branch.parentBranchId).toBeNull();
      expect(branch.currentVersion).toBe(0);
      expect(manager.getBranchesByGraph('graph-1').length).toBe(1);
    });

    it('should not allow multiple main branches for same graph', () => {
      manager.createMainBranch('graph-1', 'user-1');
      expect(() => manager.createMainBranch('graph-1', 'user-2')).toThrow();
    });
  });

  describe('createBranch', () => {
    let mainBranch: Branch;
    let parentState: any;

    beforeEach(() => {
      mainBranch = manager.createMainBranch('graph-1', 'user-1');
      parentState = {
        nodes: [],
        edges: [],
        tombstones: [],
        version: 0,
      };
    });

    it('should create branch from main branch', () => {
      const branch = manager.createBranch(
        {
          name: 'feature/branch-1',
          graphId: 'graph-1',
          userId: 'user-2',
          description: 'Test branch',
        },
        mainBranch,
        parentState,
      );

      expect(branch).toBeDefined();
      expect(branch.name).toBe('feature/branch-1');
      expect(branch.isMain).toBe(false);
      expect(branch.parentBranchId).toBe(mainBranch.id);
      expect(branch.parentVersion).toBe(mainBranch.currentVersion);
    });

    it('should create branch from specific version', () => {
      manager.updateBranch(mainBranch.id, {});

      const branch = manager.createBranch(
        {
          name: 'feature/branch-2',
          graphId: 'graph-1',
          userId: 'user-2',
          fromVersion: 0,
        },
        mainBranch,
        parentState,
      );

      expect(branch.parentVersion).toBe(0);
    });
  });

  describe('branch operations', () => {
    let mainBranch: Branch;
    let parentState: any;

    beforeEach(() => {
      mainBranch = manager.createMainBranch('graph-1', 'user-1');
      parentState = {
        nodes: [],
        edges: [],
        tombstones: [],
        version: 0,
      };
    });

    it('should get branch by id', () => {
      const fetched = manager.getBranch(mainBranch.id);
      expect(fetched?.id).toBe(mainBranch.id);
    });

    it('should return undefined for non-existent branch', () => {
      const fetched = manager.getBranch('non-existent');
      expect(fetched).toBeUndefined();
    });

    it('should get all branches by graph', () => {
      manager.createBranch(
        { name: 'branch-1', graphId: 'graph-1', userId: 'user-1' },
        mainBranch,
        parentState,
      );

      const branches = manager.getBranchesByGraph('graph-1');
      expect(branches.length).toBe(2);
    });

    it('should get main branch', () => {
      const fetched = manager.getMainBranch('graph-1');
      expect(fetched?.id).toBe(mainBranch.id);
      expect(fetched?.isMain).toBe(true);
    });

    it('should update branch', () => {
      const updated = manager.updateBranch(mainBranch.id, {
        currentVersion: 5,
      });
      expect(updated?.currentVersion).toBe(5);
    });

    it('should not delete main branch', () => {
      const result = manager.deleteBranch(mainBranch.id);
      expect(result).toBe(false);
    });

    it('should delete feature branch', () => {
      const featureBranch = manager.createBranch(
        { name: 'feature/delete-me', graphId: 'graph-1', userId: 'user-1' },
        mainBranch,
        parentState,
      );

      const result = manager.deleteBranch(featureBranch.id);
      expect(result).toBe(true);
      expect(manager.getBranch(featureBranch.id)).toBeUndefined();
    });
  });

  describe('commits', () => {
    let mainBranch: Branch;
    let parentState: any;

    beforeEach(() => {
      mainBranch = manager.createMainBranch('graph-1', 'user-1');
      parentState = {
        nodes: [],
        edges: [],
        tombstones: [],
        version: 0,
      };
    });

    it('should create commit', () => {
      const commit = manager.createCommit(mainBranch.id, {
        message: 'Initial commit',
        author: 'user-1',
        operationIds: ['op-1', 'op-2'],
        version: 1,
        sequenceNumber: 1,
      });

      expect(commit).toBeDefined();
      expect(commit.message).toBe('Initial commit');
      expect(commit.author).toBe('user-1');
      expect(commit.operationIds).toEqual(['op-1', 'op-2']);
    });

    it('should get commits for branch', () => {
      manager.createCommit(mainBranch.id, {
        message: 'Commit 1',
        author: 'user-1',
        operationIds: ['op-1'],
        version: 1,
        sequenceNumber: 1,
      });

      manager.createCommit(mainBranch.id, {
        message: 'Commit 2',
        author: 'user-1',
        operationIds: ['op-2'],
        version: 2,
        sequenceNumber: 2,
      });

      const commits = manager.getCommits(mainBranch.id);
      expect(commits.length).toBe(2);
    });

    it('should get commit by id', () => {
      const commit = manager.createCommit(mainBranch.id, {
        message: 'Test commit',
        author: 'user-1',
        operationIds: ['op-1'],
        version: 1,
        sequenceNumber: 1,
      });

      const fetched = manager.getCommit(commit.id);
      expect(fetched?.id).toBe(commit.id);
    });

    it('should get commit history by version range', () => {
      for (let i = 1; i <= 5; i++) {
        manager.createCommit(mainBranch.id, {
          message: `Commit ${i}`,
          author: 'user-1',
          operationIds: [`op-${i}`],
          version: i,
          sequenceNumber: i,
        });
      }

      const history = manager.getCommitHistory(mainBranch.id, 2, 4);
      expect(history.length).toBe(3);
      expect(history[0].version).toBe(2);
      expect(history[2].version).toBe(4);
    });
  });

  describe('common ancestor', () => {
    let mainBranch: Branch;
    let parentState: any;

    beforeEach(() => {
      mainBranch = manager.createMainBranch('graph-1', 'user-1');
      parentState = {
        nodes: [],
        edges: [],
        tombstones: [],
        version: 0,
      };

      manager.createCommit(mainBranch.id, {
        message: 'Commit 1',
        author: 'user-1',
        operationIds: ['op-1'],
        version: 1,
        sequenceNumber: 1,
      });
    });

    it('should find common ancestor for parent-child branches', () => {
      const featureBranch = manager.createBranch(
        { name: 'feature/branch', graphId: 'graph-1', userId: 'user-1', fromVersion: 1 },
        mainBranch,
        parentState,
      );

      manager.createCommit(featureBranch.id, {
        message: 'Feature commit',
        author: 'user-1',
        operationIds: ['op-feature'],
        version: 2,
        sequenceNumber: 1,
      });

      const ancestor = manager.findCommonAncestor(mainBranch.id, featureBranch.id);
      expect(ancestor).toBeDefined();
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize branch manager', () => {
      const manager1 = new BranchManager();
      const mainBranch = manager1.createMainBranch('graph-1', 'user-1');

      manager1.createCommit(mainBranch.id, {
        message: 'Test commit',
        author: 'user-1',
        operationIds: ['op-1'],
        version: 1,
        sequenceNumber: 1,
      });

      const serialized = manager1.serializeBranchManager();
      const manager2 = BranchManager.deserializeBranchManager(serialized);

      expect(manager2.getBranchesByGraph('graph-1').length).toBe(1);
      expect(manager2.getCommits(mainBranch.id).length).toBe(1);
    });
  });
});
