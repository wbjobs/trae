<template>
  <div class="chat-container">
    <div class="chat-header">
      <h3>💬 聊天</h3>
      <span class="connection-dot" :class="{ connected: wsConnected }"></span>
    </div>

    <div class="messages-container" ref="messagesContainer">
      <div
        v-for="msg in displayMessages"
        :key="msg.id"
        class="message-wrapper"
        :class="{
          'own-message': msg.userId === currentUserId,
          'system-message': msg.type === 'system'
        }"
      >
        <template v-if="msg.type === 'system'">
          <div class="system-text">{{ msg.message }}</div>
        </template>
        <template v-else>
          <div class="avatar" :style="{ backgroundColor: msg.userColor }">
            {{ msg.userName.charAt(0).toUpperCase() }}
          </div>
          <div class="bubble">
            <div class="meta">
              <span class="author" :style="{ color: msg.userColor }">{{ msg.userName }}</span>
              <span class="time">{{ formatTime(msg.timestamp) }}</span>
            </div>
            <div class="text">{{ msg.message }}</div>
          </div>
        </template>
      </div>

      <div v-if="displayMessages.length === 0" class="empty">
        <div class="empty-icon">💭</div>
        <p>还没有消息</p>
        <p class="hint">发送第一条消息吧！</p>
      </div>
    </div>

    <div class="input-area">
      <input
        v-model="inputMessage"
        type="text"
        placeholder="输入消息..."
        class="input"
        @keyup.enter="sendMessage"
        :disabled="!wsConnected"
      />
      <button
        class="send"
        @click="sendMessage"
        :disabled="!wsConnected || !inputMessage.trim()"
      >
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

interface ChatMessage {
  type: 'chat' | 'system';
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  message: string;
  timestamp: number;
}

const props = defineProps<{
  roomId: string;
  wsUrl: string;
}>();

const allMessages = ref<ChatMessage[]>([]);
const displayMessages = ref<ChatMessage[]>([]);
const inputMessage = ref('');
const wsConnected = ref(false);
const currentUserId = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

let ws: WebSocket | null = null;
let rafId: number | null = null;
let pendingMessages: ChatMessage[] = [];

const flushPending = () => {
  rafId = null;

  if (pendingMessages.length === 0) return;

  const newMessages = [...allMessages.value, ...pendingMessages];
  allMessages.value = newMessages;
  displayMessages.value = newMessages;

  pendingMessages = [];

  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

const scheduleUpdate = (msg: ChatMessage) => {
  pendingMessages.push(msg);

  if (rafId === null) {
    rafId = requestAnimationFrame(flushPending);
  }
};

const connectWebSocket = () => {
  const url = `${props.wsUrl}?room=${props.roomId}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    wsConnected.value = true;
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'init') {
        currentUserId.value = msg.self.id;
        allMessages.value = [...msg.messages];
        displayMessages.value = allMessages.value;
        nextTick(() => {
          if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
          }
        });
      } else if (msg.type === 'chat' || msg.type === 'system') {
        if (!allMessages.value.find(m => m.id === msg.id)) {
          scheduleUpdate(msg);
        }
      }
    } catch (err) {
      console.error('Chat parse error:', err);
    }
  };

  ws.onclose = () => {
    wsConnected.value = false;
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };
};

const sendMessage = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const text = inputMessage.value.trim();
  if (!text) return;

  ws.send(JSON.stringify({
    type: 'chat',
    message: text
  }));
  inputMessage.value = '';
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

onMounted(() => {
  connectWebSocket();
});

onUnmounted(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
  }
  ws?.close();
});
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.chat-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.connection-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
  transition: background 0.2s;
}

.connection-dot.connected {
  background: #22c55e;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-wrapper {
  display: flex;
  gap: 8px;
  animation: slideIn 0.25s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.own-message {
  flex-direction: row-reverse;
}

.system-message {
  justify-content: center;
}

.system-text {
  background: #e2e8f0;
  color: #64748b;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 12px;
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.bubble {
  max-width: 72%;
  background: #fff;
  padding: 8px 12px;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

.own-message .bubble {
  background: #3b82f6;
}

.own-message .text,
.own-message .author,
.own-message .time {
  color: #fff !important;
}

.meta {
  display: flex;
  gap: 8px;
  margin-bottom: 3px;
}

.author {
  font-size: 12px;
  font-weight: 600;
}

.time {
  font-size: 11px;
  color: #94a3b8;
}

.text {
  font-size: 14px;
  color: #1e293b;
  word-break: break-word;
  line-height: 1.4;
}

.empty {
  text-align: center;
  color: #94a3b8;
  margin-top: 40px;
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty .hint {
  font-size: 12px;
  margin-top: 4px;
}

.input-area {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-top: 1px solid #e2e8f0;
}

.input {
  flex: 1;
  padding: 9px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #3b82f6;
}

.input:disabled {
  background: #f1f5f9;
  cursor: not-allowed;
}

.send {
  padding: 9px 20px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.send:hover:not(:disabled) {
  background: #2563eb;
}

.send:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}
</style>
