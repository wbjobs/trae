<template>
  <div class="ticket-list-page">
    <div class="page-header">
      <h1 class="page-title">工单列表</h1>
      <div class="filter-bar">
        <select v-model="store.filter.status" @change="store.fetchTickets()" class="filter-select">
          <option value="all">全部状态</option>
          <option value="pending">待接单</option>
          <option value="processing">处理中</option>
          <option value="reviewing">待验收</option>
          <option value="completed">已完成</option>
        </select>
        <button class="btn btn-primary" @click="showCreateModal = true">
          + 创建工单
        </button>
      </div>
    </div>

    <div class="stats-grid" v-if="store.stats">
      <div class="stat-card stat-pending">
        <div class="stat-value">{{ store.stats.pending }}</div>
        <div class="stat-label">待接单</div>
      </div>
      <div class="stat-card stat-processing">
        <div class="stat-value">{{ store.stats.processing }}</div>
        <div class="stat-label">处理中</div>
      </div>
      <div class="stat-card stat-reviewing">
        <div class="stat-value">{{ store.stats.reviewing }}</div>
        <div class="stat-label">待验收</div>
      </div>
      <div class="stat-card stat-completed">
        <div class="stat-value">{{ store.stats.completed }}</div>
        <div class="stat-label">已完成</div>
      </div>
      <div class="stat-card stat-breached" v-if="store.stats.breached_response > 0 || store.stats.breached_resolve > 0">
        <div class="stat-value">{{ store.stats.breached_response + store.stats.breached_resolve }}</div>
        <div class="stat-label">SLA超时</div>
      </div>
    </div>

    <div class="ticket-table-container" v-loading="store.loading">
      <table class="ticket-table">
        <thead>
          <tr>
            <th>工单ID</th>
            <th>标题</th>
            <th>客户</th>
            <th>处理人</th>
            <th>状态</th>
            <th>优先级</th>
            <th>响应SLA</th>
            <th>解决SLA</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ticket in store.tickets" :key="ticket.id" @click="goToDetail(ticket.id)" class="ticket-row">
            <td class="ticket-id">{{ ticket.id.slice(0, 8) }}</td>
            <td class="ticket-title">{{ ticket.title }}</td>
            <td>{{ ticket.customer_name }}</td>
            <td>{{ ticket.assignee_name || '-' }}</td>
            <td>
              <span class="status-badge" :style="{ background: STATUS_COLORS[ticket.status] }">
                {{ STATUS_LABELS[ticket.status] }}
              </span>
            </td>
            <td>
              <span class="priority-badge" :style="{ background: PRIORITY_COLORS[ticket.priority] }">
                {{ PRIORITY_LABELS[ticket.priority] }}
              </span>
            </td>
            <td>
              <SlaBadge :ticket="ticket" type="response" />
            </td>
            <td>
              <SlaBadge :ticket="ticket" type="resolve" />
            </td>
            <td class="time">{{ formatTime(ticket.created_at) }}</td>
            <td>
              <button class="btn btn-sm btn-secondary" @click.stop="goToDetail(ticket.id)">
                查看
              </button>
              <button v-if="ticket.status === 'pending'" class="btn btn-sm btn-primary" @click.stop="handleAssign(ticket)">
                接单
              </button>
              <button v-if="ticket.status !== 'completed'" class="btn btn-sm btn-ai" @click.stop="handleAutoAssign(ticket)">
                🤖
              </button>
            </td>
          </tr>
          <tr v-if="!store.loading && store.tickets.length === 0">
            <td colspan="10" class="empty-state">
              <div class="empty-icon">📭</div>
              <div>暂无工单</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <CreateTicketModal v-if="showCreateModal" @close="showCreateModal = false" @created="handleCreated" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTicketStore } from '~/composables/useTicketStore'
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '~/composables/types'

const router = useRouter()
const store = useTicketStore()
const showCreateModal = ref(false)

const formatTime = (time: string) => {
  return new Date(time).toLocaleString('zh-CN')
}

const goToDetail = (id: string) => {
  router.push(`/ticket/${id}`)
}

const handleAssign = async (ticket: any) => {
  await store.assignTicket(ticket.id, 'agent-1')
}

const handleAutoAssign = async (ticket: any) => {
  await store.autoAssignTicket(ticket.id)
}

const handleCreated = () => {
  showCreateModal.value = false
  store.fetchTickets()
  store.fetchStats()
}

onMounted(() => {
  store.fetchTickets()
  store.fetchStats()
  store.fetchAgents()
  store.initRealtime()
})

onUnmounted(() => {
  store.cleanup()
})
</script>

<style scoped>
.ticket-list-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: white;
  font-size: 14px;
  cursor: pointer;
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

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-secondary {
  background: #f3f4f6;
  color: #4b5563;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-ai {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.btn-ai:hover {
  opacity: 0.9;
}

.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 4px solid;
}

.stat-pending {
  border-color: #f59e0b;
}

.stat-processing {
  border-color: #3b82f6;
}

.stat-reviewing {
  border-color: #8b5cf6;
}

.stat-completed {
  border-color: #10b981;
}

.stat-breached {
  border-color: #ef4444;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #1f2937;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}

.ticket-table-container {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.ticket-table {
  width: 100%;
  border-collapse: collapse;
}

.ticket-table th {
  background: #f9fafb;
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
}

.ticket-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
}

.ticket-row {
  cursor: pointer;
  transition: background 0.15s;
}

.ticket-row:hover {
  background: #f9fafb;
}

.ticket-id {
  font-family: 'Courier New', monospace;
  color: #6b7280;
  font-size: 13px;
}

.ticket-title {
  font-weight: 500;
  color: #1f2937;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge,
.priority-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: white;
}

.time {
  color: #6b7280;
  font-size: 13px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
</style>
