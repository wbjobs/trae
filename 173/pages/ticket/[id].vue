<template>
  <div class="ticket-detail-page" v-if="store.currentTicket">
    <div class="page-header">
      <button class="back-btn" @click="goBack">← 返回列表</button>
      <div class="ticket-actions">
        <button v-if="store.currentTicket.status === 'pending'" class="btn btn-primary" @click="handleAssign">
          接单
        </button>
        <button v-if="store.currentTicket.status !== 'completed'" class="btn btn-ai" @click="handleAutoAssign" :disabled="autoAssigning">
          {{ autoAssigning ? '分派中...' : '🤖 智能分派' }}
        </button>
        <button v-if="store.currentTicket.status === 'processing'" class="btn btn-warning" @click="showTransferModal = true">
          转派
        </button>
        <select v-if="store.currentTicket.status !== 'completed'" v-model="selectedStatus" @change="handleStatusChange" class="status-select">
          <option :value="store.currentTicket.status">{{ STATUS_LABELS[store.currentTicket.status] }}</option>
          <option v-if="store.currentTicket.status === 'pending'" value="processing">处理中</option>
          <option v-if="store.currentTicket.status === 'processing'" value="reviewing">待验收</option>
          <option v-if="store.currentTicket.status === 'reviewing'" value="completed">已完成</option>
          <option value="pending">待接单</option>
        </select>
      </div>
    </div>

    <div class="detail-grid">
      <div class="main-content">
        <div class="card ticket-info">
          <div class="card-header">
            <h2 class="ticket-title">{{ store.currentTicket.title }}</h2>
            <div class="badges">
              <span class="status-badge" :style="{ background: STATUS_COLORS[store.currentTicket.status] }">
                {{ STATUS_LABELS[store.currentTicket.status] }}
              </span>
              <span class="priority-badge" :style="{ background: PRIORITY_COLORS[store.currentTicket.priority] }">
                {{ PRIORITY_LABELS[store.currentTicket.priority] }}
              </span>
            </div>
          </div>
          <div class="ticket-meta">
            <div class="meta-item">
              <span class="meta-label">工单ID</span>
              <span class="meta-value">{{ store.currentTicket.id.slice(0, 8) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">客户</span>
              <span class="meta-value">{{ store.currentTicket.customer_name }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">处理人</span>
              <span class="meta-value">{{ store.currentTicket.assignee_name || '未分配' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">创建时间</span>
              <span class="meta-value">{{ formatTime(store.currentTicket.created_at) }}</span>
            </div>
          </div>
          <div class="ticket-description">
            <h3>问题描述</h3>
            <p>{{ store.currentTicket.description }}</p>
          </div>
        </div>

        <div class="card notes-section">
          <h3>内部备注</h3>
          <div class="note-form">
            <textarea v-model="newNote" class="note-input" placeholder="添加内部备注..." rows="3"></textarea>
            <button class="btn btn-primary btn-sm" @click="handleAddNote" :disabled="!newNote.trim()">
              添加备注
            </button>
          </div>
          <div class="notes-list">
            <div v-for="note in store.currentTicket.notes" :key="note.id" class="note-item">
              <div class="note-header">
                <span class="note-author">{{ note.author_name }}</span>
                <span class="note-time">{{ formatTime(note.created_at) }}</span>
              </div>
              <div class="note-content">{{ note.content }}</div>
            </div>
            <div v-if="store.currentTicket.notes.length === 0" class="empty-notes">
              暂无备注
            </div>
          </div>
        </div>
      </div>

      <div class="sidebar">
        <div class="card sla-card">
          <h3>SLA 监控</h3>
          <div class="sla-item">
            <div class="sla-label">响应时间 (30分钟)</div>
            <SlaBadge :ticket="store.currentTicket" type="response" />
          </div>
          <div class="sla-item">
            <div class="sla-label">解决时间 (2小时)</div>
            <SlaBadge :ticket="store.currentTicket" type="resolve" />
          </div>
        </div>

        <div class="card activity-card">
          <h3>操作历史</h3>
          <div class="activity-list">
            <div v-for="activity in store.currentTicket.activities" :key="activity.id" class="activity-item">
              <div class="activity-dot"></div>
              <div class="activity-content">
                <div class="activity-header">
                  <span class="activity-action">{{ getActionLabel(activity.action) }}</span>
                  <span class="activity-time">{{ formatTime(activity.created_at) }}</span>
                </div>
                <div class="activity-detail" v-if="activity.note">
                  {{ activity.note }}
                </div>
                <div class="activity-detail" v-if="activity.old_status && activity.new_status">
                  {{ STATUS_LABELS[activity.old_status] }} → {{ STATUS_LABELS[activity.new_status] }}
                </div>
                <div class="activity-user">— {{ activity.user_name }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <TransferModal v-if="showTransferModal" @close="showTransferModal = false" @transfer="handleTransfer" />
  </div>

  <div v-else class="loading-page">
    <div class="loading-spinner"></div>
    <div>加载中...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTicketStore } from '~/composables/useTicketStore'
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '~/composables/types'

const router = useRouter()
const route = useRoute()
const store = useTicketStore()

const ticketId = computed(() => route.params.id as string)
const selectedStatus = ref('')
const newNote = ref('')
const showTransferModal = ref(false)
const autoAssigning = ref(false)

const formatTime = (time: string) => {
  return new Date(time).toLocaleString('zh-CN')
}

const getActionLabel = (action: string) => {
  const labels: Record<string, string> = {
    created: '创建工单',
    assigned: '指派工单',
    status_changed: '状态变更',
    note_added: '添加备注',
    transferred: '转派工单'
  }
  return labels[action] || action
}

const goBack = () => {
  router.push('/')
}

const handleAssign = async () => {
  await store.assignTicket(ticketId.value, 'agent-1')
  await store.fetchTicketDetail(ticketId.value)
}

const handleStatusChange = async () => {
  if (selectedStatus.value !== store.currentTicket!.status) {
    await store.updateTicketStatus(ticketId.value, selectedStatus.value)
    await store.fetchTicketDetail(ticketId.value)
  }
}

const handleAddNote = async () => {
  if (newNote.value.trim()) {
    await store.addNote(ticketId.value, newNote.value.trim())
    newNote.value = ''
    await store.fetchTicketDetail(ticketId.value)
  }
}

const handleTransfer = async (newAssigneeId: string, reason: string) => {
  await store.transferTicket(ticketId.value, newAssigneeId, reason)
  showTransferModal.value = false
  await store.fetchTicketDetail(ticketId.value)
}

const handleAutoAssign = async () => {
  autoAssigning.value = true
  try {
    await store.autoAssignTicket(ticketId.value)
    await store.fetchTicketDetail(ticketId.value)
  } finally {
    autoAssigning.value = false
  }
}

onMounted(async () => {
  await store.fetchTicketDetail(ticketId.value)
  await store.fetchAgents()
  if (store.currentTicket) {
    selectedStatus.value = store.currentTicket.status
  }
  store.subscribeToTicket(ticketId.value)
})

onUnmounted(() => {
  store.unsubscribeFromTicket(ticketId.value)
})

watch(() => store.currentTicket, (val) => {
  if (val) {
    selectedStatus.value = val.status
  }
})
</script>

<style scoped>
.ticket-detail-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.back-btn {
  background: none;
  border: none;
  color: #667eea;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 0;
}

.back-btn:hover {
  text-decoration: underline;
}

.ticket-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-ai {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.btn-ai:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-ai:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.status-select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.ticket-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.badges {
  display: flex;
  gap: 8px;
}

.status-badge,
.priority-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: white;
}

.ticket-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 12px;
  color: #6b7280;
}

.meta-value {
  font-size: 14px;
  color: #1f2937;
  font-weight: 500;
}

.ticket-description h3 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.ticket-description p {
  color: #4b5563;
  line-height: 1.6;
  white-space: pre-wrap;
}

.notes-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.note-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.note-input {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
}

.note-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.note-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.note-author {
  font-weight: 500;
  color: #1f2937;
  font-size: 14px;
}

.note-time {
  font-size: 12px;
  color: #6b7280;
}

.note-content {
  color: #4b5563;
  font-size: 14px;
  line-height: 1.5;
}

.empty-notes {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
}

.sla-card h3 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 16px;
}

.sla-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 8px;
}

.sla-label {
  font-size: 13px;
  color: #4b5563;
}

.activity-card h3 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 16px;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  gap: 10px;
  position: relative;
}

.activity-dot {
  width: 8px;
  height: 8px;
  background: #667eea;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.activity-content {
  flex: 1;
}

.activity-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.activity-action {
  font-weight: 500;
  color: #1f2937;
  font-size: 13px;
}

.activity-time {
  font-size: 11px;
  color: #9ca3af;
}

.activity-detail {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 2px;
}

.activity-user {
  font-size: 12px;
  color: #9ca3af;
}

.loading-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 20px;
  color: #6b7280;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
