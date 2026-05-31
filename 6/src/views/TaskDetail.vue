<template>
  <div v-loading="loading">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <el-button @click="$router.back()" text>
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2 style="margin: 0;">{{ task?.name }}</h2>
        <span :class="['status-badge', `status-${task?.status}`]">
          {{ getStatusText(task?.status || 'idle') }}
        </span>
      </div>
      <div>
        <el-button 
          type="primary" 
          @click="runTask"
          :disabled="!task?.enabled || task?.status === 'running'"
        >
          运行
        </el-button>
        <el-button 
          v-if="task?.status === 'running'"
          type="warning" 
          @click="pauseTask"
        >
          暂停
        </el-button>
        <el-button 
          v-if="task?.paused"
          type="success" 
          @click="resumeTask"
        >
          恢复
        </el-button>
        <el-button @click="showEditDialog = true">
          <el-icon><Edit /></el-icon>
          编辑
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="同步配置" name="config">
        <el-card v-if="task">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="同步方向">
              {{ task.direction === 'one-way' ? '单向同步（源到目标）' : '双向同步' }}
            </el-descriptions-item>
            <el-descriptions-item label="触发方式">
              {{ getTriggerText(task.trigger) }}
              <span v-if="task.trigger === 'schedule'"> ({{ task.schedule }})</span>
            </el-descriptions-item>
            <el-descriptions-item label="冲突处理">
              {{ getConflictText(task.conflictResolution) }}
            </el-descriptions-item>
            <el-descriptions-item label="版本管理">
              {{ task.preserveVersions ? `保留最近 ${task.maxVersions} 个版本` : '不保留' }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              已{{ task.enabled ? '启用' : '禁用' }}
              <span v-if="task.paused">（已暂停）</span>
            </el-descriptions-item>
            <el-descriptions-item label="上次同步">
              {{ task.lastSyncAt ? new Date(task.lastSyncAt).toLocaleString('zh-CN') : '未同步' }}
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <div class="connection-config">
            <h4>源目录</h4>
            <p><strong>类型：</strong>{{ getConnectionTypeText(task.source.type) }}</p>
            <p><strong>路径：</strong>{{ getConnectionDisplay(task.source) }}</p>
            <template v-if="task.source.type === 'sftp'">
              <p><strong>主机：</strong>{{ task.source.host }}:{{ task.source.port }}</p>
              <p><strong>用户名：</strong>{{ task.source.username }}</p>
            </template>
            <template v-if="task.source.type === 'webdav'">
              <p><strong>服务器：</strong>{{ task.source.url }}</p>
              <p><strong>用户名：</strong>{{ task.source.username }}</p>
            </template>
          </div>

          <div class="connection-config">
            <h4>目标目录</h4>
            <p><strong>类型：</strong>{{ getConnectionTypeText(task.target.type) }}</p>
            <p><strong>路径：</strong>{{ getConnectionDisplay(task.target) }}</p>
            <template v-if="task.target.type === 'sftp'">
              <p><strong>主机：</strong>{{ task.target.host }}:{{ task.target.port }}</p>
              <p><strong>用户名：</strong>{{ task.target.username }}</p>
            </template>
            <template v-if="task.target.type === 'webdav'">
              <p><strong>服务器：</strong>{{ task.target.url }}</p>
              <p><strong>用户名：</strong>{{ task.target.username }}</p>
            </template>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="同步日志" name="logs">
        <el-card>
          <template v-if="progress">
            <div style="margin-bottom: 16px;">
              <p style="margin-bottom: 8px;">
                <strong>当前进度：</strong>{{ progress.currentFile || '初始化...' }}
              </p>
              <el-progress 
                :percentage="Math.round(progress.currentProgress)" 
                :status="progress.currentProgress === 100 ? 'success' : ''"
              />
              <p style="margin-top: 8px; color: #909399;">
                {{ progress.completed }} / {{ progress.total }} 个文件
              </p>
            </div>
          </template>

          <div class="log-container" ref="logContainerRef">
            <div 
              v-for="log in logs" 
              :key="log.id" 
              :class="['log-item', `log-${log.level}`]"
            >
              <span style="color: #6e7681;">[{{ formatTime(log.createdAt) }}]</span>
              <span style="margin-left: 8px;">{{ log.message }}</span>
            </div>
            <div v-if="logs.length === 0" style="color: #6e7681; text-align: center; padding: 40px;">
              暂无日志
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="版本管理" name="versions">
        <el-card>
          <div style="margin-bottom: 16px;">
            <el-input 
              v-model="versionSearchPath" 
              placeholder="输入文件路径搜索历史版本" 
              style="width: 400px; margin-right: 12px;"
            />
            <el-button type="primary" @click="searchVersions" :disabled="!versionSearchPath">
              搜索
            </el-button>
          </div>

          <div v-if="versions.length === 0 && !versionSearchPath">
            <el-empty description="请输入文件路径搜索历史版本" />
          </div>
          <div v-else-if="versions.length === 0 && versionSearchPath">
            <el-empty description="未找到该文件的历史版本" />
          </div>
          <div v-else>
            <div 
              v-for="version in versions" 
              :key="version.id"
              class="version-item"
            >
              <div>
                <p><strong>版本 {{ version.version }}</strong></p>
                <p style="color: #909399; font-size: 12px;">
                  {{ formatTime(version.createdAt) }} | {{ formatSize(version.size) }} | 
                  Hash: {{ version.hash.substring(0, 12) }}...
                </p>
              </div>
              <div>
                <el-button 
                  size="small" 
                  type="primary" 
                  @click="restoreVersion(version, true)"
                >
                  恢复到源
                </el-button>
                <el-button 
                  size="small" 
                  type="success" 
                  @click="restoreVersion(version, false)"
                >
                  恢复到目标
                </el-button>
              </div>
            </div>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <TaskFormDialog 
      v-model="showEditDialog" 
      :edit-task="task"
      @saved="handleTaskSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Edit } from '@element-plus/icons-vue'
import type { 
  SyncTask, ConnectionConfig, TaskStatus, SyncTrigger, 
  ConflictResolution, SyncLog, SyncProgress, FileVersion 
} from '@shared/types'
import { useTaskStore } from '@/stores/taskStore'
import TaskFormDialog from '@/components/TaskFormDialog.vue'

const route = useRoute()
const router = useRouter()
const taskStore = useTaskStore()

const loading = ref(true)
const activeTab = ref('config')
const showEditDialog = ref(false)
const versionSearchPath = ref('')

const logContainerRef = ref<Ref<HTMLElement | null> | null>(null)

const task = computed<SyncTask | null>(() => {
  const taskId = route.params.id as string
  return taskStore.tasks.find(t => t.id === taskId) || null
})

const progress = computed<SyncProgress | null>(() => {
  if (!task.value) return null
  return taskStore.taskProgress.get(task.value.id) || null
})

const logs = computed<SyncLog[]>(() => {
  if (!task.value) return []
  return taskStore.taskLogs.get(task.value.id) || []
})

const versions = computed<FileVersion[]>(() => {
  if (!task.value) return []
  const versionMap = taskStore.taskVersions.get(task.value.id)
  if (!versionMap) return []
  return versionMap.get(versionSearchPath.value) || []
})

watch(logs, async () => {
  await nextTick()
  if (logContainerRef.value?.value) {
    logContainerRef.value.value.scrollTop = 0
  }
}, { deep: true })

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    await taskStore.loadTasks()
    if (task.value) {
      await taskStore.loadLogs(task.value.id)
    }
  } catch (err: any) {
    ElMessage.error('加载数据失败: ' + err.message)
  } finally {
    loading.value = false
  }
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

function getTriggerText(trigger: SyncTrigger): string {
  const map: Record<SyncTrigger, string> = {
    manual: '手动触发',
    schedule: '定时同步',
    'file-change': '文件变更时',
    startup: '开机启动'
  }
  return map[trigger] || trigger
}

function getConflictText(resolution: ConflictResolution): string {
  const map: Record<ConflictResolution, string> = {
    source: '保留源版本',
    target: '保留目标版本',
    latest: '保留最新版本',
    manual: '手动选择'
  }
  return map[resolution] || resolution
}

function getConnectionTypeText(type: string): string {
  const map: Record<string, string> = {
    local: '本地目录',
    sftp: 'SFTP 服务器',
    webdav: 'WebDAV 服务器'
  }
  return map[type] || type
}

function getConnectionDisplay(config: ConnectionConfig): string {
  if (config.type === 'local') {
    return config.path
  } else if (config.type === 'sftp') {
    return `${config.host}${config.path}`
  } else if (config.type === 'webdav') {
    return `${config.url}${config.path}`
  }
  return config.path
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

async function runTask() {
  if (!task.value) return
  await taskStore.runTask(task.value.id)
  ElMessage.info('已开始同步')
  activeTab.value = 'logs'
}

async function pauseTask() {
  if (!task.value) return
  await taskStore.pauseTask(task.value.id)
  ElMessage.info('已暂停同步')
}

async function resumeTask() {
  if (!task.value) return
  await taskStore.resumeTask(task.value.id)
  ElMessage.info('已恢复同步')
}

async function handleTaskSaved() {
  await loadData()
}

async function searchVersions() {
  if (!task.value || !versionSearchPath.value) return
  await taskStore.loadVersions(task.value.id, versionSearchPath.value)
}

async function restoreVersion(version: FileVersion, toSource: boolean) {
  if (!task.value) return
  
  try {
    await taskStore.restoreVersion(task.value.id, version.id, toSource)
    ElMessage.success(`版本已恢复到${toSource ? '源' : '目标'}目录`)
  } catch (err: any) {
    ElMessage.error('恢复失败: ' + err.message)
  }
}
</script>
