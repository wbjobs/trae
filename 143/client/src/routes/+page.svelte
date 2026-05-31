<script>
  import { onMount, onDestroy } from 'svelte';
  import FlowEditor from './lib/FlowEditor.svelte';
  import { wsClient } from './lib/websocket.js';

  let connected = false;
  let currentView = 'home';
  let documents = [];
  let showCreateModal = false;
  let newDocName = '';
  let userName = '';
  let userColor = '#60a5fa';
  let showProfileModal = false;

  $: state = $wsClient;

  onMount(() => {
    connectToServer();
  });

  onDestroy(() => {
    wsClient.disconnect();
  });

  async function connectToServer() {
    try {
      await wsClient.connect('ws://localhost:3000');
      connected = true;
      wsClient.listDocuments();
      
      const savedName = localStorage.getItem('flow_editor_name');
      const savedColor = localStorage.getItem('flow_editor_color');
      
      if (savedName) {
        userName = savedName;
        wsClient.updateProfile(savedName, savedColor || '#60a5fa');
      }
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  }

  function createDocument() {
    if (newDocName.trim()) {
      wsClient.createDocument(newDocName.trim());
      showCreateModal = false;
      newDocName = '';
    }
  }

  function joinDocument(docId) {
    wsClient.joinDocument(docId);
    currentView = 'editor';
  }

  function leaveEditor() {
    currentView = 'home';
    wsClient.listDocuments();
  }

  function saveProfile() {
    if (userName.trim()) {
      localStorage.setItem('flow_editor_name', userName.trim());
      localStorage.setItem('flow_editor_color', userColor);
      wsClient.updateProfile(userName.trim(), userColor);
    }
    showProfileModal = false;
  }

  $: {
    if (state.documentList) {
      documents = state.documentList;
    }
    if (state.createdDocument) {
      joinDocument(state.createdDocument.id);
    }
  }
</script>

<svelte:head>
  <title>Collaborative Flow Editor</title>
</svelte:head>

{#if currentView === 'home'}
  <div class="home-container">
    <div class="home-header">
      <h1>Collaborative Flow Editor</h1>
      <div class="header-actions">
        <button class="btn btn-ghost" onclick={() => showProfileModal = true}>
          Profile
        </button>
      </div>
    </div>

    <div class="home-content">
      <div class="home-actions">
        <button class="btn btn-primary btn-large" onclick={() => showCreateModal = true}>
          + Create New Document
        </button>
      </div>

      <div class="documents-section">
        <h2>Your Documents</h2>
        {#if documents.length === 0}
          <div class="empty-state">
            <p>No documents yet. Create one to get started!</p>
          </div>
        {:else}
          <div class="documents-grid">
            {#each documents as doc}
              <div class="document-card" onclick={() => joinDocument(doc.id)}>
                <div class="document-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                  </svg>
                </div>
                <div class="document-info">
                  <h3>{doc.name}</h3>
                  <p>Last updated: {new Date(doc.updated_at).toLocaleString()}</p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if showCreateModal}
      <div class="modal-overlay" onclick={() => showCreateModal = false}>
        <div class="modal" onclick={(e) => e.stopPropagation()}>
          <h2>Create New Document</h2>
          <div class="form-group">
            <label>Document Name</label>
            <input 
              type="text" 
              bind:value={newDocName} 
              placeholder="Enter document name"
              on:keydown={(e) => e.key === 'Enter' && createDocument()}
            />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick={() => showCreateModal = false}>
              Cancel
            </button>
            <button class="btn btn-primary" onclick={createDocument}>
              Create
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if showProfileModal}
      <div class="modal-overlay" onclick={() => showProfileModal = false}>
        <div class="modal" onclick={(e) => e.stopPropagation()}>
          <h2>Your Profile</h2>
          <div class="form-group">
            <label>Display Name</label>
            <input 
              type="text" 
              bind:value={userName} 
              placeholder="Enter your name"
            />
          </div>
          <div class="form-group">
            <label>Cursor Color</label>
            <div class="color-picker">
              {#each ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#60a5fa', '#34d399'] as color}
                <div 
                  class="color-option {userColor === color ? 'selected' : ''}"
                  style="background: {color}"
                  onclick={() => userColor = color}
                ></div>
              {/each}
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick={() => showProfileModal = false}>
              Cancel
            </button>
            <button class="btn btn-primary" onclick={saveProfile}>
              Save
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{:else if currentView === 'editor'}
  <FlowEditor 
    documentId={state.documentId} 
    document={state.document}
    on:disconnect={leaveEditor}
  />
{/if}

<style>
  .home-container {
    min-height: 100vh;
    background: var(--bg-secondary);
  }

  .home-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 40px;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border);
  }

  .home-header h1 {
    font-size: 24px;
    color: var(--primary);
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .home-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px;
  }

  .home-actions {
    margin-bottom: 40px;
  }

  .btn-large {
    padding: 16px 32px;
    font-size: 18px;
  }

  .documents-section h2 {
    margin-bottom: 20px;
    font-size: 20px;
  }

  .documents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }

  .document-card {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .document-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .document-icon {
    color: var(--primary);
    flex-shrink: 0;
  }

  .document-info h3 {
    font-size: 16px;
    margin-bottom: 4px;
  }

  .document-info p {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    background: var(--bg-primary);
    border-radius: 12px;
    color: var(--text-secondary);
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
    z-index: 1000;
  }

  .modal {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 32px;
    min-width: 400px;
    max-width: 500px;
  }

  .modal h2 {
    margin-bottom: 24px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  .form-group input[type="text"] {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
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

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  .btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
  }

  .btn-ghost:hover {
    background: var(--bg-tertiary);
  }
</style>
