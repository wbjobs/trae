import type {
  Branch,
  Commit,
  MergeResult,
} from '@collaborative-graph/shared';

interface GraphInfo {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  edgeCount: number;
  version: number;
  operationCount: number;
  updatedAt: Date;
}

interface CreateGraphRequest {
  name: string;
  description?: string;
}

interface UpdateGraphRequest {
  name?: string;
  description?: string;
}

interface CreateBranchRequest {
  name: string;
  userId: string;
  fromBranchId?: string;
  fromCommitId?: string;
  fromVersion?: number;
  description?: string;
}

interface UpdateBranchRequest {
  name?: string;
  description?: string;
}

interface MergeBranchesRequest {
  sourceBranchId: string;
  targetBranchId: string;
  userId: string;
  strategy?: 'ours' | 'theirs' | 'auto';
  message?: string;
}

interface MergePreviewResult {
  hasConflicts: boolean;
  conflictCount: number;
  sampleConflicts: Array<{
    type: 'node' | 'edge';
    targetId: string;
    autoResolved: boolean;
  }>;
  estimatedNewOperations: number;
}

class ApiService {
  private baseUrl = '/api';

  async listGraphs(): Promise<GraphInfo[]> {
    const response = await fetch(`${this.baseUrl}/graphs`);
    if (!response.ok) {
      throw new Error(`Failed to list graphs: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data;
  }

  async createGraph(request: CreateGraphRequest): Promise<{ id: string; name: string }> {
    const response = await fetch(`${this.baseUrl}/graphs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to create graph: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data;
  }

  async getGraphInfo(graphId: string): Promise<GraphInfo> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}`);
    if (!response.ok) {
      throw new Error(`Failed to get graph info: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data;
  }

  async updateGraph(graphId: string, request: UpdateGraphRequest): Promise<void> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to update graph: ${response.statusText}`);
    }
  }

  async deleteGraph(graphId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete graph: ${response.statusText}`);
    }
  }

  async listBranches(graphId: string): Promise<Branch[]> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}/branches`);
    if (!response.ok) {
      throw new Error(`Failed to list branches: ${response.statusText}`);
    }
    return response.json();
  }

  async getMainBranch(graphId: string): Promise<Branch> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}/branches/main`);
    if (!response.ok) {
      throw new Error(`Failed to get main branch: ${response.statusText}`);
    }
    return response.json();
  }

  async getBranch(graphId: string, branchId: string): Promise<Branch> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}/branches/${branchId}`);
    if (!response.ok) {
      throw new Error(`Failed to get branch: ${response.statusText}`);
    }
    return response.json();
  }

  async createBranch(graphId: string, request: CreateBranchRequest): Promise<Branch> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}/branches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to create branch: ${response.statusText}`);
    }
    return response.json();
  }

  async updateBranch(
    graphId: string,
    branchId: string,
    request: UpdateBranchRequest,
  ): Promise<Branch> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}/branches/${branchId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to update branch: ${response.statusText}`);
    }
    return response.json();
  }

  async deleteBranch(graphId: string, branchId: string, userId: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/graphs/${graphId}/branches/${branchId}?userId=${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to delete branch: ${response.statusText}`);
    }
    const data = await response.json();
    return data.success;
  }

  async getBranchCommits(graphId: string, branchId: string, limit?: number): Promise<Commit[]> {
    const url = limit
      ? `${this.baseUrl}/graphs/${graphId}/branches/${branchId}/commits?limit=${limit}`
      : `${this.baseUrl}/graphs/${graphId}/branches/${branchId}/commits`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to get branch commits: ${response.statusText}`);
    }
    return response.json();
  }

  async mergeBranches(graphId: string, request: MergeBranchesRequest): Promise<MergeResult> {
    const response = await fetch(`${this.baseUrl}/graphs/${graphId}/branches/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to merge branches: ${response.statusText}`);
    }
    return response.json();
  }

  async previewMerge(
    graphId: string,
    sourceBranchId: string,
    targetBranchId: string,
  ): Promise<MergePreviewResult> {
    const response = await fetch(
      `${this.baseUrl}/graphs/${graphId}/branches/merge-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceBranchId, targetBranchId }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to preview merge: ${response.statusText}`);
    }
    return response.json();
  }
}

export const apiService = new ApiService();
