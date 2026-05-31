<template>
  <div class="create-page">
    <div class="page-header">
      <h1 class="page-title">创建工单</h1>
    </div>
    <div class="form-container">
      <form @submit.prevent="handleSubmit" class="form">
        <div class="form-group">
          <label class="form-label">工单标题 <span class="required">*</span></label>
          <input v-model="form.title" type="text" class="form-input" placeholder="请输入工单标题" required />
        </div>
        <div class="form-group">
          <label class="form-label">问题描述 <span class="required">*</span></label>
          <textarea v-model="form.description" class="form-textarea" placeholder="请详细描述问题，包括复现步骤、期望结果等" rows="8" required></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">优先级</label>
            <select v-model="form.priority" class="form-select">
              <option value="low">低</option>
              <option value="normal" selected>普通</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">客户 <span class="required">*</span></label>
            <select v-model="form.customerId" class="form-select" required>
              <option value="">请选择客户</option>
              <option v-for="customer in customers" :key="customer.id" :value="customer.id">
                {{ customer.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">智能推荐接单人</label>
          <div class="recommendation-card" v-if="store.recommendation && !store.recommendationLoading">
            <div class="recommendation-header">
              <span class="ai-badge">🤖 AI 推荐</span>
              <button class="refresh-btn" @click="store.fetchRecommendation" :disabled="store.recommendationLoading">
                🔄 刷新
              </button>
            </div>
            <div v-if="store.recommendation.recommended" class="recommended-agent">
              <div class="agent-info">
                <div class="agent-avatar">👤</div>
                <div class="agent-details">
                  <div class="agent-name">{{ store.recommendation.recommended.name }}</div>
                  <div class="agent-meta">
                    <span class="score-badge">评分 {{ store.recommendation.recommended.score }}/100</span>
                    <span class="load-info">当前负载: {{ store.recommendation.recommended.current_load }} 工单</span>
                  </div>
                  <ul class="reasons">
                    <li v-for="(reason, idx) in store.recommendation.recommended.recommendation_reason" :key="idx">
                      ✓ {{ reason }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div v-else class="no-recommendation">
              暂无可用客服数据
            </div>

            <details class="all-candidates" v-if="store.recommendation.candidates.length > 1">
              <summary>查看所有候选客服 ({{ store.recommendation.candidates.length }})</summary>
              <div class="candidates-list">
                <div v-for="agent in store.recommendation.candidates.slice(1)" :key="agent.id" class="candidate-item">
                  <div class="candidate-name">{{ agent.name }}</div>
                  <div class="candidate-score">评分: {{ agent.score }}/100</div>
                  <div class="candidate-meta">
                    负载: {{ agent.current_load }} | 
                    平均处理: {{ agent.avg_resolve_minutes ? Math.round(agent.avg_resolve_minutes) + '分钟' : 'N/A' }} | 
                    SLA: {{ agent.sla_rate ? Math.round(agent.sla_rate * 100) + '%' : 'N/A' }}
                  </div>
                </div>
              </div>
            </details>
          </div>
          <div v-else class="recommendation-loading">
            <div class="loading-spinner"></div>
            <span>正在分析客服数据...</span>
          </div>
        </div>

        <div class="form-group sla-info">
          <div class="sla-hint">
            <strong>SLA 提醒：</strong>
            <span>响应时间 30 分钟，解决时间 2 小时</span>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="$router.push('/')">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="submitting">
            {{ submitting ? '创建中...' : '创建工单' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTicketStore } from '~/composables/useTicketStore'

const router = useRouter()
const store = useTicketStore()
const submitting = ref(false)

const form = ref({
  title: '',
  description: '',
  priority: 'normal',
  customerId: ''
})

const customers = computed(() => {
  return store.agents.filter(a => a.role === 'customer')
})

onMounted(async () => {
  if (store.agents.length === 0) {
    await store.fetchAgents()
  }
  if (customers.value.length > 0 && !form.value.customerId) {
    form.value.customerId = customers.value[0].id
  }
  await store.fetchRecommendation()
})

const handleSubmit = async () => {
  if (!form.value.customerId) {
    alert('请选择客户')
    return
  }
  submitting.value = true
  try {
    await store.createTicket(form.value)
    router.push('/')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.create-page {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
}

.form-container {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.required {
  color: #ef4444;
}

.form-input,
.form-textarea,
.form-select {
  padding: 12px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 150px;
}

.recommendation-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  background: #fafafa;
}

.recommendation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.ai-badge {
  display: inline-block;
  padding: 4px 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.refresh-btn {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: #f3f4f6;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recommended-agent {
  background: white;
  border-radius: 8px;
  padding: 14px;
  border-left: 3px solid #10b981;
}

.agent-info {
  display: flex;
  gap: 14px;
}

.agent-avatar {
  width: 44px;
  height: 44px;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.agent-details {
  flex: 1;
}

.agent-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 16px;
  margin-bottom: 4px;
}

.agent-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.score-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #dcfce7;
  color: #166534;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.load-info {
  color: #6b7280;
  font-size: 13px;
}

.reasons {
  list-style: none;
  padding: 0;
  margin: 0;
}

.reasons li {
  color: #4b5563;
  font-size: 13px;
  margin-bottom: 2px;
}

.no-recommendation {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
}

.all-candidates {
  margin-top: 12px;
}

.all-candidates summary {
  cursor: pointer;
  color: #6b7280;
  font-size: 13px;
  padding: 8px 0;
}

.candidates-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.candidate-item {
  background: white;
  border-radius: 6px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
}

.candidate-name {
  font-weight: 500;
  color: #374151;
  font-size: 14px;
}

.candidate-score {
  color: #6b7280;
  font-size: 12px;
  margin-top: 2px;
}

.candidate-meta {
  color: #9ca3af;
  font-size: 12px;
  margin-top: 2px;
}

.recommendation-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px;
  color: #6b7280;
  font-size: 14px;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.sla-info {
  padding: 16px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  border-radius: 8px;
  border: 1px solid rgba(102, 126, 234, 0.2);
}

.sla-hint {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  color: #4b5563;
}

.sla-hint strong {
  color: #667eea;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 12px;
}

.btn {
  padding: 12px 24px;
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

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #4b5563;
}

.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
