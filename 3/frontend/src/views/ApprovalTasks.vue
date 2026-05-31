<template>
  <div class="approval-tasks">
    <div class="page-header">
      <h2>我的审批</h2>
      <el-tabs v-model="activeTab" @tab-change="loadTasks">
        <el-tab-pane label="待处理" name="pending" />
        <el-tab-pane label="已处理" name="processed" />
      </el-tabs>
    </div>
    
    <el-card v-loading="loading">
      <el-table :data="tasks" style="width: 100%">
        <el-table-column prop="formName" label="表单名称" min-width="180" />
        <el-table-column prop="flowName" label="流程名称" min-width="180" />
        <el-table-column prop="nodeName" label="当前节点" width="150" />
        <el-table-column label="申请人" width="120">
          <template #default="{ row }">
            {{ row.submission?.createdBy?.name }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="收到时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text @click="viewDetail(row)">查看</el-button>
            <el-button
              type="success"
              text
              v-if="row.status === 'pending'"
              @click="approveTask(row)"
            >
              通过
            </el-button>
            <el-button
              type="danger"
              text
              v-if="row.status === 'pending'"
              @click="rejectTask(row)"
            >
              拒绝
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <el-pagination
        v-if="total > 0"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 20px; justify-content: flex-end"
        @size-change="loadTasks"
        @current-change="loadTasks"
      />
    </el-card>
    
    <el-dialog v-model="detailVisible" title="审批详情" width="700px">
      <template v-if="currentTask">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="表单名称">{{ currentTask.formName }}</el-descriptions-item>
          <el-descriptions-item label="流程名称">{{ currentTask.flowName }}</el-descriptions-item>
          <el-descriptions-item label="当前节点">{{ currentTask.nodeName }}</el-descriptions-item>
          <el-descriptions-item label="申请人">
            {{ currentTask.submission?.createdBy?.name }}
          </el-descriptions-item>
          <el-descriptions-item label="申请时间">
            {{ formatDate(currentTask.submission?.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="任务状态">
            <el-tag :type="getStatusType(currentTask.status)">
              {{ getStatusLabel(currentTask.status) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
        
        <div class="data-section">
          <h4>表单数据</h4>
          <el-descriptions :column="1" border v-if="currentTask.submission?.data">
            <el-descriptions-item
              v-for="(value, key) in currentTask.submission.data"
              :key="key"
              :label="key"
            >
              {{ formatValue(value) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
        
        <template v-if="currentTask.status === 'pending'">
          <div class="action-section">
            <el-input
              v-model="comment"
              type="textarea"
              placeholder="请输入审批意见（可选）"
              :rows="3"
            />
            <div class="action-buttons">
              <el-button type="success" @click="submitApprove" :loading="approving">
                通过
              </el-button>
              <el-button type="danger" @click="submitReject" :loading="rejecting">
                拒绝
              </el-button>
            </div>
          </div>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { approvalApi } from '@/api/approval';
import type { ApprovalTask } from '@/types';

const activeTab = ref('pending');
const loading = ref(false);
const tasks = ref<ApprovalTask[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const detailVisible = ref(false);
const currentTask = ref<ApprovalTask | null>(null);
const comment = ref('');
const approving = ref(false);
const rejecting = ref(false);

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

const formatDate = (dateStr?: string) => {
  return dateStr ? new Date(dateStr).toLocaleString('zh-CN') : '-';
};

const formatValue = (value: any) => {
  if (value === null || value === undefined) return '-';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const loadTasks = async () => {
  loading.value = true;
  try {
    const result = await approvalApi.getMyTasks({
      status: activeTab.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    tasks.value = result.items;
    total.value = result.total;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const viewDetail = (row: ApprovalTask) => {
  currentTask.value = row;
  comment.value = '';
  detailVisible.value = true;
};

const approveTask = (row: ApprovalTask) => {
  viewDetail(row);
};

const rejectTask = (row: ApprovalTask) => {
  viewDetail(row);
};

const submitApprove = async () => {
  if (!currentTask.value) return;
  
  approving.value = true;
  try {
    await approvalApi.approveTask(currentTask.value.id, { comment: comment.value });
    ElMessage.success('审批通过');
    detailVisible.value = false;
    loadTasks();
  } catch (error) {
    console.error(error);
  } finally {
    approving.value = false;
  }
};

const submitReject = async () => {
  if (!currentTask.value) return;
  
  rejecting.value = true;
  try {
    await approvalApi.rejectTask(currentTask.value.id, { comment: comment.value });
    ElMessage.success('已拒绝');
    detailVisible.value = false;
    loadTasks();
  } catch (error) {
    console.error(error);
  } finally {
    rejecting.value = false;
  }
};

onMounted(() => {
  loadTasks();
});
</script>

<style scoped>
.approval-tasks {
  padding: 0;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 600;
}

.data-section {
  margin-top: 20px;
}

.data-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #333;
}

.action-section {
  margin-top: 20px;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}
</style>
