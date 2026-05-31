<template>
  <el-dialog
    v-model="visible"
    title="文件冲突"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <template v-if="currentConflict">
      <p style="margin-bottom: 16px; color: #f56c6c;">
        检测到文件冲突，源文件和目标文件都已修改，请选择保留的版本：
      </p>
      
      <el-row :gutter="16">
        <el-col :span="12">
          <div class="conflict-file-info">
            <h4 style="margin-bottom: 8px; color: #409eff;">源文件</h4>
            <p><strong>路径：</strong>{{ currentConflict.conflict.sourceFile.path }}</p>
            <p><strong>大小：</strong>{{ formatSize(currentConflict.conflict.sourceFile.size) }}</p>
            <p><strong>修改时间：</strong>{{ formatTime(currentConflict.conflict.sourceFile.modifiedAt) }}</p>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="conflict-file-info">
            <h4 style="margin-bottom: 8px; color: #67c23a;">目标文件</h4>
            <p><strong>路径：</strong>{{ currentConflict.conflict.targetFile.path }}</p>
            <p><strong>大小：</strong>{{ formatSize(currentConflict.conflict.targetFile.size) }}</p>
            <p><strong>修改时间：</strong>{{ formatTime(currentConflict.conflict.targetFile.modifiedAt) }}</p>
          </div>
        </el-col>
      </el-row>
    </template>

    <template #footer>
      <el-button type="primary" @click="resolve('source')">保留源版本</el-button>
      <el-button type="success" @click="resolve('target')">保留目标版本</el-button>
      <el-button type="warning" @click="resolve('latest')">保留最新</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useTaskStore } from '@/stores/taskStore'

const taskStore = useTaskStore()

const visible = ref(false)

const currentConflict = computed(() => {
  return taskStore.pendingConflicts[0] || null
})

watch(
  () => taskStore.pendingConflicts.length,
  (count) => {
    visible.value = count > 0
  }
)

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

async function resolve(resolution: 'source' | 'target' | 'latest') {
  if (!currentConflict.value) return
  await taskStore.resolveConflict(currentConflict.value.conflictId, resolution)
}
</script>
