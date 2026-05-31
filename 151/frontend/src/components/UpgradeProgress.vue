<template>
  <div class="upgrade-progress-card">
    <div class="card-header">
      <span>升级进度</span>
      <el-tag v-if="upgradeProgress" :type="getProgressType(upgradeProgress.percentage)">
        {{ upgradeProgress.percentage }}%
      </el-tag>
    </div>
    <div class="card-body">
      <el-progress
        :percentage="upgradeProgress?.percentage || 0"
        :status="getProgressStatus(upgradeProgress?.percentage || 0)"
        :stroke-width="12"
        :text-inside="true"
      />
      
      <div class="progress-detail">
        <div class="detail-item">
          <span class="label">总 Pod 数:</span>
          <span class="value">{{ upgradeProgress?.totalPods || 0 }}</span>
        </div>
        <div class="detail-item">
          <span class="label">已升级:</span>
          <span class="value success">{{ upgradeProgress?.upgradedPods || 0 }}</span>
        </div>
        <div class="detail-item">
          <span class="label">当前 Pod:</span>
          <span class="value">{{ upgradeProgress?.currentPodIndex || 0 }}</span>
        </div>
      </div>

      <div v-if="upgradeProgress?.startTime" class="time-info">
        <el-icon><Clock /></el-icon>
        开始时间: {{ formatTime(upgradeProgress.startTime) }}
      </div>

      <div v-if="upgradeProgress?.estimatedTime" class="time-info">
        <el-icon><Timer /></el-icon>
        预计剩余: {{ upgradeProgress.estimatedTime }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { Clock, Timer } from '@element-plus/icons-vue'

defineProps({
  upgradeProgress: {
    type: Object,
    default: null
  }
})

const getProgressType = (percentage) => {
  if (percentage >= 100) return 'success'
  if (percentage > 0) return 'warning'
  return 'info'
}

const getProgressStatus = (percentage) => {
  if (percentage >= 100) return 'success'
  if (percentage > 0) return ''
  return 'exception'
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}
</script>

<style scoped>
.upgrade-progress-card {
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
  font-size: 16px;
  font-weight: 600;
}

.card-body {
  padding: 20px;
}

.progress-detail {
  display: flex;
  justify-content: space-around;
  margin-top: 20px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 6px;
}

.detail-item {
  text-align: center;
}

.detail-item .label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.detail-item .value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.detail-item .value.success {
  color: #67c23a;
}

.time-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 13px;
  color: #909399;
}
</style>
