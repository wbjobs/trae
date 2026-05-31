<template>
  <div class="migration-status-card">
    <div class="card-header">
      <div class="header-left">
        <span>玩家迁移状态</span>
        <el-tag v-if="migrationStatus" :type="getStateType(migrationStatus.state)" size="small">
          {{ getStateText(migrationStatus.state) }}
        </el-tag>
      </div>
      <div v-if="migrationStatus" class="header-right">
        <el-icon><User /></el-icon>
        {{ migrationStatus.migratedPlayers }}/{{ migrationStatus.totalPlayers }}
      </div>
    </div>

    <div class="card-body">
      <div v-if="!migrationStatus" class="empty-state">
        <el-empty description="暂无迁移数据" />
      </div>

      <template v-else>
        <div class="migration-summary">
          <div class="summary-item">
            <div class="summary-label">源 Pod</div>
            <div class="summary-value">{{ migrationStatus.sourcePod || '-' }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">目标 Pod</div>
            <div class="summary-value">{{ migrationStatus.targetPod || '-' }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">迁移玩家</div>
            <div class="summary-value">
              <span class="success">{{ migrationStatus.migratedPlayers }}</span>
              <span class="divider">/</span>
              <span>{{ migrationStatus.totalPlayers }}</span>
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">失败玩家</div>
            <div class="summary-value error">{{ migrationStatus.failedPlayers }}</div>
          </div>
        </div>

        <div v-if="migrationStatus.startTime" class="time-info">
          <el-icon><Clock /></el-icon>
          开始: {{ formatTime(migrationStatus.startTime) }}
          <span v-if="migrationStatus.endTime" class="end-time">
            结束: {{ formatTime(migrationStatus.endTime) }}
          </span>
        </div>

        <div v-if="migrationStatus.players?.length" class="player-list">
          <div class="list-title">玩家列表</div>
          <div class="migration-list">
            <div
              v-for="player in migrationStatus.players"
              :key="player.playerId"
              class="player-item"
            >
              <div class="player-info">
                <span class="player-name">{{ player.playerName }}</span>
                <span class="player-id">ID: {{ player.playerId }}</span>
              </div>
              <div class="player-status">
                <el-tag :type="getPlayerStatusType(player.status)" size="small">
                  {{ getPlayerStatusText(player.status) }}
                </el-tag>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { User, Clock } from '@element-plus/icons-vue'
import { getMigrationStateColor, getMigrationStateText } from '@/types'

defineProps({
  migrationStatus: {
    type: Object,
    default: null
  }
})

const getStateType = (state) => {
  const types = {
    Pending: 'info',
    Migrating: 'warning',
    Completed: 'success',
    Failed: 'danger'
  }
  return types[state] || 'info'
}

const getStateText = (state) => {
  return getMigrationStateText(state)
}

const getPlayerStatusType = (status) => {
  const types = {
    migrating: 'warning',
    completed: 'success',
    failed: 'danger'
  }
  return types[status] || 'info'
}

const getPlayerStatusText = (status) => {
  const texts = {
    migrating: '迁移中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status] || status
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>

<style scoped>
.migration-status-card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #606266;
}

.card-body {
  padding: 20px;
}

.empty-state {
  padding: 40px 0;
}

.migration-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 16px;
}

.summary-item {
  text-align: center;
}

.summary-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.summary-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.summary-value.success {
  color: #67c23a;
}

.summary-value.error {
  color: #f56c6c;
}

.divider {
  margin: 0 4px;
  color: #909399;
}

.time-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
  margin-bottom: 16px;
}

.end-time {
  margin-left: 16px;
}

.player-list {
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
}

.list-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.migration-list {
  max-height: 300px;
  overflow-y: auto;
}

.player-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
  margin-bottom: 8px;
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.player-id {
  font-size: 12px;
  color: #909399;
}
</style>
