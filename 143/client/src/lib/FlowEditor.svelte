<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { FlowEditor } from './editor.js';
  import { wsClient } from './websocket.js';
  import BranchManager from './BranchManager.svelte';

  const dispatch = createEventDispatcher();

  export let documentId = null;
  export let document = null;

  let canvasElement;
  let editor;
  let showUsersList = false;
  let showBranchesPanel = false;
  let selectedNode = null;
  let editText = '';
  let editColor = '';
  let lastAppliedVersion = 0;

  $: users = $wsClient.users || [];
  $: currentUser = users.find(u => u.id === $wsClient.clientId);
  $: wsState = $wsClient;
  $: currentBranch = $wsClient.branchName;

  $: if (wsState.document && wsState.version > lastAppliedVersion) {
    syncEditorFromDocument(wsState.document);
    lastAppliedVersion = wsState.version;
  }

  function syncEditorFromDocument(doc) {
    if (!editor || !doc) return;
    
    const currentData = editor.getData();
    const currentNodes = currentData.nodes || [];
    const currentConnections = currentData.connections || [];
    
    const docNodes = doc.nodes || [];
    const docConnections = doc.connections || [];
    
    const nodesChanged = JSON.stringify(currentNodes) !== JSON.stringify(docNodes);
    const connectionsChanged = JSON.stringify(currentConnections) !== JSON.stringify(docConnections);
    
    if (nodesChanged || connectionsChanged) {
      editor.loadFromData(doc);
    }
  }

  onMount(() => {
    editor = new FlowEditor(canvasElement, {
      width: 1200,
      height: 800,
      onChange: handleChange,
      onSelect: handleSelect
    });

    if (document) {
      editor.loadFromData(document);
      lastAppliedVersion = $wsClient.version;
    }

    wsClient.subscribe(handleWsUpdate);
    wsClient.listBranches();
    wsClient.listMerges();
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  function handleWsUpdate(state) {
    if (!editor) return;
    
    state.users.forEach(user => {
      if (user.cursor) {
        editor.updateRemoteCursor(user.id, user.cursor);
      }
    });
  }

  function handleChange(operation) {
    wsClient.sendOperation(operation);
  }

  function handleSelect(node) {
    selectedNode = node;
    if (node && node.type !== 'connection') {
      editText = node.text || '';
      editColor = node.color || '#60a5fa';
    }
  }

  function addNode(type) {
    const rect = canvasElement.getBoundingClientRect();
    const x = Math.random() * (rect.width - 200) + 100;
    const y = Math.random() * (rect.height - 200) + 100;
    editor.addNode(type, { x, y });
  }

  function deleteSelected() {
    const activeObj = editor.canvas.getActiveObject();
    if (activeObj) {
      if (activeObj.nodeId) {
        editor.removeNode(activeObj.nodeId);
      } else if (activeObj.connectionId) {
        editor.removeConnection(activeObj.connectionId);
      }
      selectedNode = null;
    }
  }

  function startConnecting() {
    const activeObj = editor.canvas.getActiveObject();
    if (activeObj && activeObj.nodeId) {
      editor.startConnection(activeObj);
    }
  }

  function updateNodeProperty() {
    if (selectedNode && selectedNode.type !== 'connection') {
      editor.updateNode(selectedNode.id, {
        text: editText,
        color: editColor
      });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const activeObj = editor.canvas.getActiveObject();
      if (activeObj && (activeObj.nodeId || activeObj.connectionId)) {
        deleteSelected();
      }
    }
    if (e.key === 'Escape') {
      if (editor.isConnecting) {
        editor.cancelConnection();
      }
      editor.canvas.discardActiveObject();
      editor.canvas.renderAll();
      selectedNode = null;
    }
  }

  function disconnect() {
    wsClient.leaveDocument();
    dispatch('disconnect');
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="editor-container">
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="btn btn-primary" onclick={() => addNode('rect')}>
        <span>+</span> Rectangle
      </button>
      <button class="btn btn-primary" onclick={() => addNode('circle')}>
        <span>+</span> Circle
      </button>
      <button class="btn btn-primary" onclick={() => addNode('diamond')}>
        <span>+</span> Diamond
      </button>
      <button class="btn btn-primary" onclick={() => addNode('ellipse')}>
        <span>+</span> Ellipse
      </button>
      <div class="toolbar-divider"></div>
      <button class="btn btn-success" onclick={startConnecting}>
        Connect
      </button>
      <button class="btn btn-danger" onclick={deleteSelected}>
        Delete
      </button>
    </div>
    <div class="toolbar-right">
      <div class="branch-indicator" onclick={() => showBranchesPanel = !showBranchesPanel}>
        <span class="branch-icon">🌿</span>
        <span class="branch-name">{currentBranch || 'main'}</span>
      </div>
      <div class="users-container">
        <button class="btn btn-ghost" onclick={() => showUsersList = !showUsersList}>
          Users ({users.length})
        </button>
        {#if showUsersList}
          <div class="users-dropdown">
            {#each users as user}
              <div class="user-item">
                <span class="user-color" style="background: {user.color}"></span>
                <span class="user-name">{user.name}</span>
                {#if user.id === $wsClient.clientId}
                  <span class="user-you">(you)</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <button class="btn btn-ghost" onclick={disconnect}>
        Leave
      </button>
    </div>
  </div>

  <div class="canvas-container">
    <canvas bind:this={canvasElement}></canvas>
  </div>

  {#if selectedNode && selectedNode.type !== 'connection'}
    <div class="properties-panel">
      <h3>Node Properties</h3>
      <div class="property">
        <label>Text:</label>
        <input 
          type="text" 
          bind:value={editText} 
          on:input={updateNodeProperty}
          placeholder="Enter node text"
        />
      </div>
      <div class="property">
        <label>Color:</label>
        <div class="color-picker">
          {#each ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#2dd4bf', '#fb923c', '#ec4899'] as color}
            <div 
              class="color-option {editColor === color ? 'selected' : ''}"
              style="background: {color}"
              onclick={() => { editColor = color; updateNodeProperty(); }}
            ></div>
          {/each}
        </div>
      </div>
      <div class="property">
        <button class="btn btn-danger btn-full" onclick={deleteSelected}>
          Delete Node
        </button>
      </div>
    </div>
  {/if}

  <BranchManager bind:showBranchesPanel />

  <div class="users-cursors">
    {#each users as user}
      {#if user.id !== $wsClient.clientId && user.cursor}
        <div 
          class="remote-cursor"
          style="left: {user.cursor.x}px; top: {user.cursor.y}px; border-color: {user.color}"
        >
          <div class="cursor-label" style="background: {user.color}">
            {user.name}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .editor-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-secondary);
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border);
    box-shadow: var(--shadow);
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-divider {
    width: 1px;
    height: 24px;
    background: var(--border);
    margin: 0 8px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-success {
    background: #10b981;
    color: white;
  }

  .btn-success:hover {
    background: #059669;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
  }

  .btn-ghost:hover {
    background: var(--bg-tertiary);
  }

  .btn-full {
    width: 100%;
  }

  .branch-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--bg-tertiary);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .branch-indicator:hover {
    background: var(--bg-secondary);
  }

  .branch-icon {
    font-size: 16px;
  }

  .branch-name {
    font-weight: 500;
    font-size: 14px;
  }

  .users-container {
    position: relative;
  }

  .users-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    min-width: 200px;
    z-index: 100;
    overflow: hidden;
  }

  .user-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--bg-tertiary);
  }

  .user-item:last-child {
    border-bottom: none;
  }

  .user-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .user-name {
    font-weight: 500;
  }

  .user-you {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .canvas-container {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }

  canvas {
    background: white;
    border-radius: 8px;
    box-shadow: var(--shadow);
  }

  .properties-panel {
    position: fixed;
    right: 20px;
    top: 80px;
    width: 280px;
    background: var(--bg-primary);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    padding: 16px;
    z-index: 50;
  }

  .properties-panel h3 {
    margin-bottom: 16px;
    font-size: 16px;
  }

  .property {
    margin-bottom: 16px;
  }

  .property label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .property input[type="text"] {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
  }

  .color-picker {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .color-option {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s;
  }

  .color-option.selected {
    border-color: var(--text-primary);
  }

  .users-cursors {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  .remote-cursor {
    position: fixed;
    pointer-events: none;
    z-index: 1000;
  }

  .remote-cursor::before {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-top: 15px solid;
    border-top-color: inherit;
  }

  .cursor-label {
    position: absolute;
    top: 15px;
    left: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    color: white;
    white-space: nowrap;
  }
</style>
