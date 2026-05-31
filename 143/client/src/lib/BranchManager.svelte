<script>
  import { wsClient } from './websocket.js';

  export let showBranchesPanel = false;
  export let showCreateBranchModal = false;
  export let showMergeModal = false;
  export let showConflictModal = false;
  export let newBranchName = '';
  export let mergeSourceBranch = null;
  export let mergeTargetBranch = null;
  export let conflictResolutions = [];

  $: branches = $wsClient.branches || [];
  $: currentBranchId = $wsClient.branchId;
  $: merges = $wsClient.merges || [];
  $: currentMerge = $wsClient.currentMerge;
  $: mergeConflicts = $wsClient.mergeConflicts || [];

  function handleCreateBranch() {
    if (newBranchName.trim()) {
      wsClient.createBranch(newBranchName.trim());
      newBranchName = '';
      showCreateBranchModal = false;
    }
  }

  function handleSwitchBranch(branchId) {
    if (branchId !== currentBranchId) {
      wsClient.switchBranch(branchId);
    }
  }

  function handleDeleteBranch(branchId, e) {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this branch?')) {
      wsClient.deleteBranch(branchId);
    }
  }

  function handleMerge() {
    if (mergeSourceBranch && mergeTargetBranch && mergeSourceBranch !== mergeTargetBranch) {
      wsClient.mergeBranches(mergeSourceBranch, mergeTargetBranch);
      showMergeModal = false;
    }
  }

  function resolveConflict(conflict, action) {
    const existing = conflictResolutions.find(r => 
      (r.nodeId && (r.nodeId === conflict.nodeId || r.nodeId === conflict.sourceNodeId || r.nodeId === conflict.targetNodeId)) ||
      (r.connectionId && r.connectionId === conflict.connectionId)
    );

    if (existing) {
      existing.action = action;
    } else {
      const resolution = {
        action,
        nodeId: conflict.nodeId || conflict.sourceNodeId,
        connectionId: conflict.connectionId
      };
      conflictResolutions.push(resolution);
    }
  }

  function handleApplyMerge() {
    wsClient.resolveMerge(currentMerge.id, true, conflictResolutions);
    showConflictModal = false;
    conflictResolutions = [];
  }

  function handleAbortMerge() {
    wsClient.resolveMerge(currentMerge.id, false);
    showConflictModal = false;
    conflictResolutions = [];
  }

  function getConflictTypeLabel(type) {
    const labels = {
      'node_conflict': 'Node Property Conflict',
      'node_overlap': 'Node Position Conflict',
      'spatial_overlap': 'Spatial Overlap',
      'connection_conflict': 'Connection Conflict',
      'broken_connection': 'Broken Connection'
    };
    return labels[type] || type;
  }
</script>

{#if showBranchesPanel}
  <div class="branches-panel">
    <div class="panel-header">
      <h3>Branches</h3>
      <button class="btn-close" onclick={() => showBranchesPanel = false}>×</button>
    </div>

    <div class="panel-actions">
      <button class="btn btn-primary" onclick={() => showCreateBranchModal = true}>
        + New Branch
      </button>
      <button class="btn btn-secondary" onclick={() => showMergeModal = true}>
        Merge
      </button>
    </div>

    <div class="branches-list">
      {#each branches as branch}
        <div 
          class="branch-item {branch.id === currentBranchId ? 'current' : ''}"
          onclick={() => handleSwitchBranch(branch.id)}
        >
          <div class="branch-info">
            <span class="branch-name">{branch.name}</span>
            <span class="branch-version">v{branch.latest_version || 0}</span>
          </div>
          <div class="branch-actions">
            {#if branch.name !== 'main'}
              <button class="btn-icon" onclick={(e) => handleDeleteBranch(branch.id, e)} title="Delete">
                🗑️
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if merges.length > 0}
      <div class="merges-section">
        <h4>Merge History</h4>
        <div class="merges-list">
          {#each merges as merge}
            <div class="merge-item">
              <div class="merge-info">
                <span class="merge-branches">
                  {merge.source_branch_name} → {merge.target_branch_name}
                </span>
                <span class="merge-status status-{merge.status}">{merge.status}</span>
              </div>
              <div class="merge-date">
                {new Date(merge.created_at).toLocaleString()}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#if showCreateBranchModal}
    <div class="modal-overlay" onclick={() => showCreateBranchModal = false}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h2>Create Branch</h2>
        <div class="form-group">
          <label>Branch Name</label>
          <input 
            type="text" 
            bind:value={newBranchName} 
            placeholder="Enter branch name"
            on:keydown={(e) => e.key === 'Enter' && handleCreateBranch()}
          />
        </div>
        <div class="form-hint">
          Branch will be created from current branch ({branches.find(b => b.id === currentBranchId)?.name || 'main'})
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick={() => showCreateBranchModal = false}>
            Cancel
          </button>
          <button class="btn btn-primary" onclick={handleCreateBranch}>
            Create
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showMergeModal}
    <div class="modal-overlay" onclick={() => showMergeModal = false}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h2>Merge Branches</h2>
        <div class="form-group">
          <label>Source Branch</label>
          <select bind:value={mergeSourceBranch}>
            <option value={null}>Select source branch</option>
            {#each branches as branch}
              {#if branch.id !== mergeTargetBranch}
                <option value={branch.id}>{branch.name}</option>
              {/if}
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label>Target Branch</label>
          <select bind:value={mergeTargetBranch}>
            <option value={null}>Select target branch</option>
            {#each branches as branch}
              {#if branch.id !== mergeSourceBranch}
                <option value={branch.id}>{branch.name}</option>
              {/if}
            {/each}
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick={() => showMergeModal = false}>
            Cancel
          </button>
          <button class="btn btn-primary" onclick={handleMerge}>
            Merge
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

{#if mergeConflicts.length > 0 && currentMerge}
  <div class="conflict-overlay">
    <div class="conflict-modal">
      <div class="conflict-header">
        <h2>Merge Conflicts Detected</h2>
        <p>{mergeConflicts.length} conflict(s) need to be resolved</p>
      </div>

      <div class="conflicts-list">
        {#each mergeConflicts as conflict}
          <div class="conflict-item">
            <div class="conflict-type">{getConflictTypeLabel(conflict.type)}</div>
            <div class="conflict-description">{conflict.description}</div>

            {#if conflict.type === 'node_conflict' || conflict.type === 'node_overlap'}
              <div class="conflict-compare">
                <div class="compare-side">
                  <h4>Source Branch</h4>
                  {#if conflict.source}
                    <p>Text: {conflict.source.text}</p>
                    <p>Color: {conflict.source.color}</p>
                    <p>Position: ({conflict.source.x}, {conflict.source.y})</p>
                  {/if}
                </div>
                <div class="compare-side">
                  <h4>Target Branch</h4>
                  {#if conflict.target}
                    <p>Text: {conflict.target.text}</p>
                    <p>Color: {conflict.target.color}</p>
                    <p>Position: ({conflict.target.x}, {conflict.target.y})</p>
                  {/if}
                </div>
              </div>
            {/if}

            {#if conflict.type === 'spatial_overlap'}
              <div class="conflict-compare">
                <div class="compare-side">
                  <h4>Node in Source</h4>
                  <p>Text: {conflict.sourceNode.text}</p>
                  <p>Position: ({conflict.sourceNode.x}, {conflict.sourceNode.y})</p>
                </div>
                <div class="compare-side">
                  <h4>Node in Target</h4>
                  <p>Text: {conflict.targetNode.text}</p>
                  <p>Position: ({conflict.targetNode.x}, {conflict.targetNode.y})</p>
                </div>
              </div>
            {/if}

            {#if conflict.type === 'broken_connection'}
              <div class="conflict-warning">
                ⚠️ Connection may break due to missing nodes
                {#if conflict.missingFrom}
                  <p>Missing source node: {conflict.connection.from}</p>
                {/if}
                {#if conflict.missingTo}
                  <p>Missing target node: {conflict.connection.to}</p>
                {/if}
              </div>
            {/if}

            <div class="conflict-resolutions">
              <button 
                class="btn btn-source"
                onclick={() => resolveConflict(conflict, 'keep_source')}
              >
                Keep Source
              </button>
              <button 
                class="btn btn-target"
                onclick={() => resolveConflict(conflict, 'keep_target')}
              >
                Keep Target
              </button>
              <button 
                class="btn btn-skip"
                onclick={() => resolveConflict(conflict, 'skip')}
              >
                Skip
              </button>
            </div>
          </div>
        {/each}
      </div>

      <div class="conflict-actions">
        <button class="btn btn-ghost" onclick={handleAbortMerge}>
          Abort Merge
        </button>
        <button class="btn btn-primary" onclick={handleApplyMerge}>
          Apply Merge
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .branches-panel {
    position: fixed;
    right: 0;
    top: 60px;
    width: 320px;
    height: calc(100vh - 60px);
    background: var(--bg-primary);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    z-index: 100;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 16px;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-secondary);
  }

  .panel-actions {
    padding: 16px;
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
    border: none;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: none;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    border: none;
  }

  .btn-ghost:hover {
    background: var(--bg-tertiary);
  }

  .btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    font-size: 14px;
  }

  .branches-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .branch-item {
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.2s;
  }

  .branch-item:hover {
    background: var(--bg-secondary);
  }

  .branch-item.current {
    background: var(--primary);
    color: white;
  }

  .branch-info {
    display: flex;
    flex-direction: column;
  }

  .branch-name {
    font-weight: 500;
  }

  .branch-version {
    font-size: 12px;
    opacity: 0.7;
  }

  .branch-actions {
    display: flex;
    gap: 4px;
  }

  .merges-section {
    padding: 16px;
    border-top: 1px solid var(--border);
  }

  .merges-section h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .merges-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .merge-item {
    padding: 8px;
    border-radius: 6px;
    background: var(--bg-secondary);
    margin-bottom: 8px;
  }

  .merge-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .merge-branches {
    font-size: 12px;
    font-weight: 500;
  }

  .merge-status {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
  }

  .status-resolved {
    background: #10b981;
    color: white;
  }

  .status-pending {
    background: #fbbf24;
    color: #78350f;
  }

  .status-conflicted {
    background: #ef4444;
    color: white;
  }

  .merge-date {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 200;
  }

  .modal {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 500px;
  }

  .modal h2 {
    margin: 0 0 20px 0;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
  }

  .form-hint {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .conflict-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 300;
  }

  .conflict-modal {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 24px;
    width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .conflict-header {
    margin-bottom: 20px;
  }

  .conflict-header h2 {
    margin: 0 0 8px 0;
    color: #ef4444;
  }

  .conflicts-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
  }

  .conflict-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .conflict-type {
    font-weight: 600;
    color: var(--primary);
    margin-bottom: 8px;
  }

  .conflict-description {
    color: var(--text-secondary);
    margin-bottom: 12px;
  }

  .conflict-compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .compare-side {
    background: var(--bg-secondary);
    padding: 12px;
    border-radius: 8px;
  }

  .compare-side h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
  }

  .compare-side p {
    margin: 4px 0;
    font-size: 13px;
  }

  .conflict-warning {
    background: #fef3c7;
    border: 1px solid #fbbf24;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
  }

  .conflict-resolutions {
    display: flex;
    gap: 8px;
  }

  .btn-source {
    background: #3b82f6;
    color: white;
    border: none;
  }

  .btn-target {
    background: #10b981;
    color: white;
    border: none;
  }

  .btn-skip {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: none;
  }

  .conflict-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
</style>
