<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <el-button @click="goBack" :icon="ArrowLeft">返回</el-button>
        <h1 class="page-title" style="margin-top: 10px;">
          {{ gameServer?.metadata.name }}
          <el-tag :type="getPhaseTagType(gameServer?.status?.phase)" size="large" style="margin-left: 10px;">
            {{ getPhaseText(gameServer?.status?.phase) }}
          </el-tag>
        </h1>
      </div>
      <div style="display: flex; gap: 10px;">
        <el-button @click="refreshData" :icon="Refresh">刷新</el-button>
        <el-button type="warning" @click="showUpgradeDialog" :icon="Upload">
          升级
        </el-button>
      </div>
    </div>

    <div v-if="gameServer" class="detail-content">
      <div class="stat-cards">
        <StatCard
          label="副本数"
          :value="`${gameServer.status.readyReplicas || 0}/${gameServer.spec.replicas}`"
          icon="Collection"
          color="#409EFF"
        />
        <StatCard
          label="在线玩家"
          :value="gameServer.status.onlinePlayers || 0"
          icon="User"
          color="#67C23A"
        />
        <StatCard
          label="已升级副本"
          :value="gameServer.status.updatedReplicas || 0"
          icon="CircleCheck"
          color="#E6A23C"
        />
        <StatCard
          label="升级进度"
          :value="`${gameServer.status.upgradeProgress?.percentage || 0}%`"
          icon="DataLine"
          :color="getProgressColor()"
        />
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="card-header">基本信息</div>
          <div class="card-body">
            <div class="info-item">
              <span class="info-label">游戏名称</span>
              <span class="info-value">{{ gameServer.spec.gameName }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">服务器 ID</span>
              <span class="info-value">{{ gameServer.spec.serverId }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">命名空间</span>
              <span class="info-value">{{ gameServer.metadata.namespace }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前版本</span>
              <span class="info-value">{{ getCurrentVersion() }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">目标版本</span>
              <span class="info-value highlight">{{ gameServer.status.targetVersion || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">最后更新</span>
              <span class="info-value">{{ formatTime(gameServer.status.lastUpdateTime) }}</span>
            </div>
          </div>
        </div>

        <UpgradeProgress :upgrade-progress="gameServer.status.upgradeProgress" />
      </div>

      <div class="card">
        <div class="card-header">升级策略</div>
        <div class="card-body">
          <div class="info-item">
            <span class="info-label">升级策略</span>
            <span class="info-value">
              <el-tag type="primary">原地升级</el-tag>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">最大不可用</span>
            <span class="info-value">{{ gameServer.spec.upgradePolicy?.maxUnavailable || 1 }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">迁移超时</span>
            <span class="info-value">{{ gameServer.spec.upgradePolicy?.migrationTimeoutSeconds || 300 }}s</span>
          </div>
          <div class="info-item">
            <span class="info-label">Agent 端口</span>
            <span class="info-value">{{ gameServer.spec.upgradePolicy?.agentPort || 8080 }}</span>
          </div>
        </div>
      </div>

      <MigrationStatus :migration-status="gameServer.status.migrationStatus" />

      <div v-if="gameServer.status.canaryStatus" class="card">
        <div class="card-header">
          <span>金丝雀升级状态</span>
          <el-tag :type="getCanaryPhaseTagType(gameServer.status.canaryStatus.phase)" size="small" style="margin-left: 10px;">
            {{ getCanaryPhaseText(gameServer.status.canaryStatus.phase) }}
          </el-tag>
        </div>
        <div class="card-body">
          <div class="canary-summary">
            <div class="info-item">
              <span class="info-label">金丝雀副本</span>
              <span class="info-value canary-value">{{ gameServer.status.canaryStatus.canaryReplicas }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">稳定副本</span>
              <span class="info-value">{{ gameServer.status.canaryStatus.stableReplicas }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">观察开始</span>
              <span class="info-value">{{ formatTime(gameServer.status.canaryStatus.observationStart) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">观察结束</span>
              <span class="info-value">{{ formatTime(gameServer.status.canaryStatus.observationEnd) }}</span>
            </div>
          </div>

          <div v-if="gameServer.status.canaryStatus.decision" class="canary-decision">
            <div class="decision-label">升级决策</div>
            <div class="decision-badge" :class="getDecisionClass(gameServer.status.canaryStatus.decision)">
              <span class="decision-icon">{{ getDecisionIcon(gameServer.status.canaryStatus.decision) }}</span>
              <span>{{ getCanaryDecisionText(gameServer.status.canaryStatus.decision) }}</span>
            </div>
            <div v-if="gameServer.status.canaryStatus.decisionReason" class="decision-reason">
              原因: {{ gameServer.status.canaryStatus.decisionReason }}
            </div>
          </div>

          <div v-if="gameServer.status.canaryStatus.metricsComparison" class="metrics-comparison">
            <div class="section-title">指标对比</div>
            <div class="metrics-table">
              <div class="metrics-header">
                <div class="metrics-cell"></div>
                <div class="metrics-cell canary-label">
                  <span class="badge-canary">金丝雀</span>
                </div>
                <div class="metrics-cell stable-label">
                  <span class="badge-stable">稳定</span>
                </div>
                <div class="metrics-cell deviation-label">偏差</div>
              </div>
              <div class="metrics-row">
                <div class="metrics-cell metric-name">CPU 使用率</div>
                <div class="metrics-cell">{{ gameServer.status.canaryStatus.metricsComparison.canaryAvgCPU.toFixed(1) }}%</div>
                <div class="metrics-cell">{{ gameServer.status.canaryStatus.metricsComparison.stableAvgCPU.toFixed(1) }}%</div>
                <div class="metrics-cell" :class="getDeviationClass(gameServer.status.canaryStatus.metricsComparison.cpuDeviation)">
                  {{ formatDeviation(gameServer.status.canaryStatus.metricsComparison.cpuDeviation) }}
                </div>
              </div>
              <div class="metrics-row">
                <div class="metrics-cell metric-name">内存使用率</div>
                <div class="metrics-cell">{{ gameServer.status.canaryStatus.metricsComparison.canaryAvgMemory.toFixed(1) }}%</div>
                <div class="metrics-cell">{{ gameServer.status.canaryStatus.metricsComparison.stableAvgMemory.toFixed(1) }}%</div>
                <div class="metrics-cell" :class="getDeviationClass(gameServer.status.canaryStatus.metricsComparison.memoryDeviation)">
                  {{ formatDeviation(gameServer.status.canaryStatus.metricsComparison.memoryDeviation) }}
                </div>
              </div>
              <div class="metrics-row">
                <div class="metrics-cell metric-name">在线玩家</div>
                <div class="metrics-cell">{{ gameServer.status.canaryStatus.metricsComparison.canaryAvgPlayers }}</div>
                <div class="metrics-cell">{{ gameServer.status.canaryStatus.metricsComparison.stableAvgPlayers }}</div>
                <div class="metrics-cell" :class="getDeviationClass(-gameServer.status.canaryStatus.metricsComparison.playerLossPercent)">
                  {{ formatDeviation(-gameServer.status.canaryStatus.metricsComparison.playerLossPercent) }}
                </div>
              </div>
              <div class="metrics-row health-row">
                <div class="metrics-cell metric-name">健康分数</div>
                <div class="metrics-cell health-score" :class="getHealthScoreClass(gameServer.status.canaryStatus.metricsComparison.overallHealthScore)">
                  {{ gameServer.status.canaryStatus.metricsComparison.overallHealthScore.toFixed(0) }}/100
                </div>
                <div class="metrics-cell"></div>
                <div class="metrics-cell"></div>
              </div>
            </div>
          </div>

          <div v-if="gameServer.status.canaryStatus.canaryPods && gameServer.status.canaryStatus.canaryPods.length > 0" class="pod-metrics">
            <div class="section-title">金丝雀 Pod 指标</div>
            <div class="pod-metrics-list">
              <div v-for="pod in gameServer.status.canaryStatus.canaryPods" :key="pod.podName" class="pod-metric-item">
                <div class="pod-name">{{ pod.podName }}</div>
                <div class="pod-metric-values">
                  <span class="metric-pill">CPU: {{ pod.cpuPercent.toFixed(1) }}%</span>
                  <span class="metric-pill">内存: {{ pod.memoryPercent.toFixed(1) }}%</span>
                  <span class="metric-pill">玩家: {{ pod.onlinePlayers }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">事件记录</div>
        <div class="card-body">
          <el-timeline>
            <el-timeline-item
              v-for="(condition, index) in gameServer.status.conditions"
              :key="index"
              :timestamp="formatTime(condition.lastTransitionTime)"
              :color="getConditionColor(condition.type)"
              :type="getConditionType(condition.type)"
              :icon="getConditionIcon(condition.type)"
            >
              <div class="condition-item">
                <div class="condition-type">{{ condition.type }}</div>
                <div class="condition-message">{{ condition.message }}</div>
                <div class="condition-reason">原因: {{ condition.reason }}</div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="upgradeDialogVisible"
      title="升级游戏服"
      width="500px"
    >
      <el-form :model="upgradeForm" label-width="100px">
        <el-form-item label="当前版本">
          <span>{{ getCurrentVersion() }}</span>
        </el-form-item>
        <el-form-item label="新镜像" required>
          <el-input
            v-model="upgradeForm.image"
            placeholder="请输入新的镜像地址"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="upgradeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmUpgrade" :loading="upgrading">
          确认升级
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Refresh, Upload } from '@element-plus/icons-vue'
import StatCard from '@/components/StatCard.vue'
import UpgradeProgress from '@/components/UpgradeProgress.vue'
import MigrationStatus from '@/components/MigrationStatus.vue'
import { gameServerApi } from '@/api'
import { getPhaseText, getCanaryDecisionText, getCanaryPhaseText } from '@/types'

const router = useRouter()
const route = useRoute()
const gameServer = ref(null)
const upgradeDialogVisible = ref(false)
const upgrading = ref(false)
const upgradeForm = ref({
  image: ''
})

let refreshInterval = null

const fetchData = async () => {
  try {
    const data = await gameServerApi.get(route.params.namespace, route.params.name)
    gameServer.value = data
  } catch (error) {
    ElMessage.error('获取游戏服详情失败')
  }
}

const refreshData = () => {
  fetchData()
  ElMessage.success('已刷新')
}

const goBack = () => {
  router.push('/gameservers')
}

const showUpgradeDialog = () => {
  upgradeForm.value.image = getCurrentVersion()
  upgradeDialogVisible.value = true
}

const confirmUpgrade = async () => {
  if (!upgradeForm.value.image) {
    ElMessage.warning('请输入新的镜像地址')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要升级到 ${upgradeForm.value.image} 吗？`,
      '确认升级',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  upgrading.value = true
  try {
    await gameServerApi.upgrade(
      route.params.namespace,
      route.params.name,
      upgradeForm.value.image
    )
    ElMessage.success('升级请求已提交')
    upgradeDialogVisible.value = false
    fetchData()
  } catch (error) {
    ElMessage.error('升级请求失败')
  } finally {
    upgrading.value = false
  }
}

const getPhaseTagType = (phase) => {
  const types = {
    Running: 'success',
    Upgrading: 'warning',
    Migrating: '',
    Draining: 'info',
    Canary: '',
    RollingBack: 'warning',
    Succeeded: 'success',
    Failed: 'danger'
  }
  return types[phase] || 'info'
}

const getCurrentVersion = () => {
  return gameServer.value?.spec?.template?.containers?.[0]?.image || '-'
}

const getProgressColor = () => {
  const percentage = gameServer.value?.status?.upgradeProgress?.percentage || 0
  if (percentage >= 100) return '#67C23A'
  if (percentage > 0) return '#E6A23C'
  return '#909399'
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const getConditionColor = (type) => {
  const colors = {
    Initialized: '#409EFF',
    UpgradeStarted: '#E6A23C',
    MigrationCompleted: '#8E44AD',
    CanaryUpgradeStarted: '#1890FF',
    CanaryObserving: '#1890FF',
    CanaryDeciding: '#1890FF',
    CanaryPromoted: '#67C23A',
    CanaryRollback: '#F56C6C',
    UpgradeCompleted: '#67C23A',
    UpgradeFailed: '#F56C6C',
    RollbackCompleted: '#909399'
  }
  return colors[type] || '#909399'
}

const getConditionType = (type) => {
  const types = {
    Initialized: 'primary',
    UpgradeStarted: 'warning',
    MigrationCompleted: '',
    CanaryUpgradeStarted: '',
    CanaryObserving: '',
    CanaryDeciding: 'primary',
    CanaryPromoted: 'success',
    CanaryRollback: 'danger',
    UpgradeCompleted: 'success',
    UpgradeFailed: 'danger',
    RollbackCompleted: 'info'
  }
  return types[type] || 'info'
}

const getConditionIcon = (type) => {
  const icons = {
    Initialized: 'Setting',
    UpgradeStarted: 'Upload',
    MigrationCompleted: 'Switch',
    CanaryUpgradeStarted: 'Promotion',
    CanaryObserving: 'View',
    CanaryDeciding: 'DataAnalysis',
    CanaryPromoted: 'CircleCheck',
    CanaryRollback: 'RefreshLeft',
    UpgradeCompleted: 'CircleCheck',
    UpgradeFailed: 'CircleClose',
    RollbackCompleted: 'Refresh'
  }
  return icons[type] || 'MoreFilled'
}

const getCanaryPhaseTagType = (phase) => {
  const types = {
    Preparing: 'info',
    Observing: 'warning',
    Deciding: 'primary',
    Promoting: 'success',
    RollingBack: 'danger',
    Completed: 'success'
  }
  return types[phase] || 'info'
}

const getDecisionClass = (decision) => {
  const classes = {
    Promote: 'decision-promote',
    Rollback: 'decision-rollback',
    Observe: 'decision-observe',
    Pending: 'decision-pending'
  }
  return classes[decision] || 'decision-pending'
}

const getDecisionIcon = (decision) => {
  const icons = {
    Promote: '✅',
    Rollback: '⚠️',
    Observe: '👁',
    Pending: '⏳'
  }
  return icons[decision] || '⏳'
}

const getDeviationClass = (deviation) => {
  if (deviation > 0.3) return 'deviation-danger'
  if (deviation > 0.1) return 'deviation-warning'
  if (deviation < -0.1) return 'deviation-good'
  return 'deviation-normal'
}

const getHealthScoreClass = (score) => {
  if (score >= 80) return 'health-good'
  if (score >= 50) return 'health-warning'
  return 'health-danger'
}

const formatDeviation = (deviation) => {
  if (!isFinite(deviation)) return '-'
  const sign = deviation > 0 ? '+' : ''
  return `${sign}${(deviation * 100).toFixed(1)}%`
}

onMounted(() => {
  fetchData()
  refreshInterval = setInterval(fetchData, 5000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.highlight {
  color: #e6a23c !important;
  font-weight: 600;
}

.condition-item {
  padding: 8px 0;
}

.condition-type {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.condition-message {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}

.condition-reason {
  font-size: 12px;
  color: #909399;
}

.canary-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
}

.canary-value {
  font-weight: 600;
  color: #1890ff !important;
}

.canary-decision {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.decision-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.decision-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 20px;
}

.decision-badge.decision-promote {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.decision-badge.decision-rollback {
  background: #fff2f0;
  color: #ff4d4f;
  border: 1px solid #ffccc7;
}

.decision-badge.decision-observe {
  background: #fffbe6;
  color: #faad14;
  border: 1px solid #ffe58f;
}

.decision-badge.decision-pending {
  background: #f5f5f5;
  color: #8c8c8c;
  border: 1px solid #d9d9d9;
}

.decision-icon {
  font-size: 18px;
}

.decision-reason {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}

.metrics-comparison {
  margin-bottom: 20px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.metrics-table {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}

.metrics-header {
  display: flex;
  background: #f5f7fa;
  font-weight: 600;
  font-size: 13px;
}

.metrics-row {
  display: flex;
  border-top: 1px solid #ebeef5;
}

.metrics-cell {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  color: #606266;
  text-align: center;
}

.metrics-cell.metric-name {
  flex: 1.2;
  text-align: left;
  font-weight: 500;
  color: #303133;
}

.metrics-cell.canary-label {
  background: #e6f7ff;
  color: #1890ff;
}

.metrics-cell.stable-label {
  background: #fff7e6;
  color: #fa8c16;
}

.metrics-cell.deviation-label {
  background: #f5f5f5;
  color: #595959;
}

.badge-canary {
  background: #1890ff;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.badge-stable {
  background: #fa8c16;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.deviation-normal {
  color: #67c23a;
}

.deviation-good {
  color: #52c41a;
}

.deviation-warning {
  color: #faad14;
}

.deviation-danger {
  color: #f56c6c;
  font-weight: 600;
}

.health-row {
  background: #fafbfc;
}

.health-score {
  font-size: 16px;
  font-weight: 700;
}

.health-good {
  color: #52c41a;
}

.health-warning {
  color: #faad14;
}

.health-danger {
  color: #f5222d;
}

.pod-metrics-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pod-metric-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.pod-name {
  font-weight: 500;
  color: #303133;
  font-size: 13px;
}

.pod-metric-values {
  display: flex;
  gap: 8px;
}

.metric-pill {
  background: white;
  border: 1px solid #dcdfe6;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  color: #606266;
}
</style>
