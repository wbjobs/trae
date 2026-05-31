<template>
  <div class="approval">
    <div class="page-header">
      <h2>审批管理</h2>
    </div>
    
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="stat-card" @click="$router.push('/approval/tasks')">
          <div class="stat-content">
            <div class="stat-icon warning">
              <el-icon><Clock /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ pendingCount }}</div>
              <div class="stat-label">待处理</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card" @click="$router.push('/approval/tasks')">
          <div class="stat-content">
            <div class="stat-icon success">
              <el-icon><Check /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ approvedCount }}</div>
              <div class="stat-label">已通过</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card" @click="$router.push('/approval/flows')">
          <div class="stat-content">
            <div class="stat-icon primary">
              <el-icon><Connection /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ flowCount }}</div>
              <div class="stat-label">审批流程</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    
    <div class="quick-actions">
      <h3>快捷操作</h3>
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="action-card" @click="$router.push('/approval/tasks')">
            <el-icon class="action-icon"><Document /></el-icon>
            <span>我的审批任务</span>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="action-card" @click="$router.push('/approval/flows')">
            <el-icon class="action-icon"><Connection /></el-icon>
            <span>流程管理</span>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="action-card" @click="$router.push('/approval/flows')">
            <el-icon class="action-icon"><Plus /></el-icon>
            <span>新建流程</span>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="action-card" @click="$router.push('/notifications')">
            <el-icon class="action-icon"><Bell /></el-icon>
            <span>通知中心</span>
          </el-card>
        </el-col>
      </el-row>
    </div>
    
    <div class="recent-tasks">
      <h3>最近审批任务</h3>
      <el-card v-loading="loading">
        <el-table :data="recentTasks" style="width: 100%">
          <el-table-column prop="formName" label="表单名称" min-width="200" />
          <el-table-column prop="nodeName" label="节点" width="150" />
          <el-table-column prop="status" label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { approvalApi } from '@/api/approval';
import type { ApprovalTask } from '@/types';

const loading = ref(false);
const pendingCount = ref(0);
const approvedCount = ref(0);
const flowCount = ref(0);
const recentTasks = ref<ApprovalTask[]>([]);

const getStatusType = (status: string) => {
  const types: Record<string, string> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    completed: 'success',
  };
  return types[status] || 'info';
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    pending: '待处理',
    approved: '已通过',
    rejected: '已拒绝',
    completed: '已完成',
  };
  return labels[status] || status;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN');
};

const loadStats = async () => {
  try {
    const tasksResult = await approvalApi.getMyTasks({ status: 'pending', page: 1, pageSize: 1 });
    pendingCount.value = tasksResult.total;
    
    const processedResult = await approvalApi.getMyTasks({ status: 'processed', page: 1, pageSize: 1 });
    approvedCount.value = processedResult.total;
    
    const flowsResult = await approvalApi.getFlows();
    flowCount.value = flowsResult.length;
    
    const recentResult = await approvalApi.getMyTasks({ page: 1, pageSize: 5 });
    recentTasks.value = recentResult.items;
  } catch (error) {
    console.error(error);
  }
};

onMounted(() => {
  loadStats();
});
</script>

<style scoped>
.approval {
  padding: 0;
}

.page-header h2 {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
}

.stat-card {
  cursor: pointer;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: white;
}

.stat-icon.warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.stat-icon.success {
  background: linear-gradient(135deg, #10b981, #059669);
}

.stat-icon.primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #333;
}

.stat-label {
  color: #909399;
  font-size: 14px;
}

.quick-actions {
  margin-top: 24px;
}

.quick-actions h3,
.recent-tasks h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}

.action-card {
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
  padding: 24px 12px;
}

.action-card:hover {
  border-color: #409eff;
}

.action-icon {
  font-size: 32px;
  color: #409eff;
  margin-bottom: 8px;
  display: block;
}

.recent-tasks {
  margin-top: 24px;
}
</style>
