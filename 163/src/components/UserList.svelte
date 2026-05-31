<script lang="ts">
  import { onMounted, onDestroy } from 'svelte';

  interface User {
    id: string;
    name: string;
    color: string;
    isReadOnly: boolean;
  }

  export let roomId: string;
  export let wsUrl: string;

  let users: User[] = [];
  let wsConnected = false;
  let selfId = '';

  let ws: WebSocket | null = null;

  const connect = () => {
    const url = `${wsUrl}?room=${roomId}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      wsConnected = true;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'init') {
          selfId = msg.self.id;
          users = msg.users;
        } else if (msg.type === 'userList') {
          users = msg.users;
        }
      } catch (err) {
        console.error('UserList parse error:', err);
      }
    };

    ws.onclose = () => {
      wsConnected = false;
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  onMounted(() => {
    connect();
  });

  onDestroy(() => {
    ws?.close();
  });
</script>

<div class="user-list">
  <div class="header">
    <h3>👥 在线用户</h3>
    <span class="dot" class:active={wsConnected}></span>
  </div>

  <div class="count">
    {users.length} 人在线
  </div>

  <div class="list">
    {#each users as user (user.id)}
      <div class="user" class:self={user.id === selfId}>
        <div class="avatar" style="background-color: {user.color}">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div class="info">
          <span class="name">{user.name}</span>
          {#if user.id === selfId}
            <span class="tag self-tag">你</span>
          {/if}
          {#if user.isReadOnly}
            <span class="tag readonly-tag">只读</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if users.length === 0}
    <div class="empty">
      <p>暂无用户</p>
    </div>
  {/if}
</div>

<style>
  .user-list {
    padding: 14px;
    background: #f8fafc;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd5e1;
    transition: background 0.2s;
  }

  .dot.active {
    background: #22c55e;
  }

  .count {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e2e8f0;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: #fff;
    border-radius: 8px;
    transition: transform 0.15s, background 0.15s;
  }

  .user:hover {
    transform: translateX(3px);
  }

  .user.self {
    background: #eff6ff;
    border: 1px solid #dbeafe;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    flex-shrink: 0;
  }

  .info {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .name {
    font-size: 14px;
    font-weight: 500;
    color: #1e293b;
  }

  .tag {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .self-tag {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .readonly-tag {
    background: #fef3c7;
    color: #92400e;
  }

  .empty {
    text-align: center;
    color: #94a3b8;
    margin-top: 20px;
    font-size: 13px;
  }
</style>
