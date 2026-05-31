<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">转派工单</h2>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="form">
          <div class="recommendation-section" v-if="store.recommendation && !store.recommendationLoading">
            <div class="section-header">
              <span class="ai-badge">🤖 AI 推荐</span>
              <button class="refresh-btn" @click="store.fetchRecommendation" :disabled="store.recommendationLoading">
                🔄
              </button>
            </div>
            <div v-if="store.recommendation.recommended" class="recommended-agent" @click="selectRecommended">
              <div class="agent-info">
                <div class="agent-avatar">👤</div>
                <div class="agent-details">
                  <div class="agent-name">
                    {{ store.recommendation.recommended.name }}
                    <span class="score-badge">{{ store.recommendation.recommended.score }}分</span>
                  </div>
                  <div class="agent-meta">
                    负载: {{ store.recommendation.recommended.current_load }} | 
                    平均处理: {{ store.recommendation.recommended.avg_resolve_minutes ? Math.round(store.recommendation.recommended.avg_resolve_minutes) + '分钟' : 'N/A' }}
                  </div>
                  <ul class="reasons">
                    <li v-for="(reason, idx) in store.recommendation.recommended.recommendation_reason.slice(0, 2)" :key="idx">
                      ✓ {{ reason }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">选择处理人</label>
            <select v-model="selectedAgent" class="form-select" required>
              <option value="">请选择处理人</option>
              <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                {{ agent.name }} ({{ agent.role === 'admin' ? '管理员' : '客服' }})
                <template v-if="getAgentScore(agent.id)">
                   - {{ getAgentScore(agent.id) }}分
                </template>
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">转派原因</label>
            <textarea v-model="reason" class="form-textarea" placeholder="请输入转派原因..." rows="3"></textarea>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
            <button class="btn btn-primary" @click="handleTransfer" :disabled="!selectedAgent">
              确认转派
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTicketStore } from '~/composables/useTicketStore'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'transfer', newAssigneeId: string, reason: string): void
}>()

const store = useTicketStore()
const selectedAgent = ref('')
const reason = ref('')

const agents = computed(() => {
  return store.agents.filter(a => a.role === 'admin' || a.role === 'agent')
})

const getAgentScore = (agentId: string): number | null => {
  if (!store.recommendation) return null
  const candidate = store.recommendation.candidates.find(c => c.id === agentId)
  return candidate ? candidate.score : null
}

const selectRecommended = () => {
  if (store.recommendation?.recommended) {
    selectedAgent.value = store.recommendation.recommended.id
  }
}

onMounted(async () => {
  if (store.agents.length === 0) {
    await store.fetchAgents()
  }
  await store.fetchRecommendation()
})

const handleTransfer = () => {
  if (selectedAgent.value) {
    emit('transfer', selectedAgent.value, reason.value)
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #374151;
}

.modal-body {
  padding: 24px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.recommendation-section {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
  background: #fafafa;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.ai-badge {
  display: inline-block;
  padding: 3px 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
}

.refresh-btn {
  padding: 4px 10px;
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
  padding: 12px;
  border-left: 3px solid #10b981;
  cursor: pointer;
  transition: all 0.2s;
}

.recommended-agent:hover {
  background: #f0fdf4;
  transform: translateX(2px);
}

.agent-info {
  display: flex;
  gap: 12px;
}

.agent-avatar {
  width: 40px;
  height: 40px;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.agent-details {
  flex: 1;
}

.agent-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 14px;
  margin-bottom: 3px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.score-badge {
  display: inline-block;
  padding: 1px 6px;
  background: #dcfce7;
  color: #166534;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.agent-meta {
  color: #6b7280;
  font-size: 12px;
  margin-bottom: 4px;
}

.reasons {
  list-style: none;
  padding: 0;
  margin: 0;
}

.reasons li {
  color: #4b5563;
  font-size: 12px;
  margin-bottom: 1px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.form-select,
.form-textarea {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
}

.btn {
  padding: 10px 20px;
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
