<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0;">同步任务</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        创建任务
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="tasks"
      style="width: 100%;"
      @row-click="goToDetail"
      row-key="id"
    >
      <el-table-column prop="name" label="任务名称" min-width="200" />
      
      <el-table-column label="源目录" min-width="250">
        <template #default="{ row }">
          <span :title="row.source.path">
            {{ getConnectionDisplay(row.source) }}
          </span>
        </template>
      </el-table-column>
      
      <el-table-column label="目标目录" min-width="250">
        <template #default="{ row }">
          <span :title="row.target.path">
            {{ getConnectionDisplay(row.target) }}
          </span>
        </template>
      </el-table-column>
      
      <el-table-column label="方向" width="100">
        <template #default="{ row }">
          {{ row.direction === 'one-way' ? '单向' : '双向' }}
        </template>
      </el-table-column>
      
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <span :class="['status-badge', `status-${row.status}`]">
            {{ getStatusText(row.status) }}
          </span>
        </template>
      </el-table-column>
      
      <el-table-column label="进度" width="150">
        <template #default="{ row }">
          <template v-if="taskProgress.has(row.id)">
            <el-progress 
              :percentage="Math.round(taskProgress.get(row.id)!.currentProgress)"
              :show-text="false"
              :stroke-width="6"
            />
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>
      
      <el-table-column label="上次同步" width="160">
        <template #default="{ row }">
          {{ row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString('zh-CN') : '未同步' }}
        </template>
      </el-table-column>
      
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button 
            size="small" 
            type="primary" 
            @click.stop="runTask(row)"
            :disabled="!row.enabled || row.status === 'running'"
          >
            运行
          </el-button>
          <el-button 
            v-if="row.status === 'running'"
            size="small" 
            type="warning" 
            @click.stop="pauseTask(row)"
          >
            暂停
          </el-button>
          <el-button 
            v-if="row.paused"
            size="small" 
            type="success" 
            @click.stop="resumeTask(row)"
          >
            恢复
          </el-button>
          <el-button 
            size="small" 
            :type="row.enabled ? 'info' : 'success'" 
            @click.stop="toggleEnabled(row)"
          >
            {{ row.enabled ? '禁用' : '启用' }}
          </el-button>
          <el-button 
            size="small" 
            type="danger" 
            @click.stop="deleteTask(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && tasks.length === 0" description="暂无任务，点击上方按钮创建第一个任务" />

    <TaskFormDialog 
      v-model="showCreateDialog" 
      @saved="handleTaskSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { SyncTask, ConnectionConfig, TaskStatus } from '@shared/types'
import { useTaskStore } from '@/stores/taskStore'
import TaskFormDialog from '@/components/TaskFormDialog.vue'

const router = useRouter()
const taskStore = useTaskStore()

const loading = ref(true)
const showCreateDialog = ref(false)

const tasks = computed(() => taskStore.tasks)
const taskProgress = computed(() => taskStore.taskProgress)

onMounted(async () => {
  setupEventListeners()
  await loadTasks()
})

function setupEventListeners() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    window.electronAPI.onProgress((progress) => {
      taskStore.updateProgress(progress)
    })
    
    window.electronAPI.onLog((log) => {
      taskStore.addLog(log)
    })
    
    window.electronAPI.onConflict((data) => {
      taskStore.addConflict(data)
    })
  }
}

async function loadTasks() {
  loading.value = true
  try {
    await taskStore.loadTasks()
  } catch (err: any) {
    ElMessage.error('加载任务失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

function getConnectionDisplay(config: ConnectionConfig): string {
  if (config.type === 'local') {
    return `本地: ${config.path}`
  } else if (config.type === 'sftp') {
    return `SFTP: ${config.host}${config.path}`
  } else if (config.type === 'webdav') {
    return `WebDAV: ${config.url}${config.path}`
  }
  return config.path
}

function getStatusText(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    idle: '空闲',
    running: '运行中',
    paused: '已暂停',
    error: '错误'
  }
  return map[status] || status
}

function goToDetail(row: SyncTask) {
  router.push(`/task/${row.id}`)
}

function handleTaskSaved() {
  loadTasks()
}

async function runTask(task: SyncTask) {
  await taskStore.runTask(task.id)
  ElMessage.info(`已开始同步: ${task.name}`)
}

async function pauseTask(task: SyncTask) {
  await taskStore.pauseTask(task.id)
  ElMessage.info('已暂停同步')
}

async function resumeTask(task: SyncTask) {
  await taskStore.resumeTask(task.id)
  ElMessage.info('已恢复同步')
}

async function toggleEnabled(task: SyncTask) {
  if (task.enabled) {
    await taskStore.disableTask(task.id)
    ElMessage.info('任务已禁用')
  } else {
    await taskStore.enableTask(task.id)
    ElMessage.info('任务已启用')
  }
}

async function deleteTask(task: SyncTask) {
  try {
    await ElMessageBox.confirm(
      `确定要删除任务"${task.name}"吗？此操作将同时删除相关的日志和版本数据。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    await taskStore.deleteTask(task.id)
    ElMessage.success('任务已删除')
  } catch {
  }
}
</script>
