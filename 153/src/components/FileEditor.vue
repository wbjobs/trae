<template>
  <div class="file-editor" v-if="visible">
    <div class="editor-header">
      <div class="file-info">
        <el-icon :size="20"><Document /></el-icon>
        <span class="file-name">{{ currentEdit?.name || '未命名文件' }}</span>
        <el-tag
          v-if="currentEdit?.isSynced"
          type="success"
          size="small"
        >已同步</el-tag>
        <el-tag
          v-else
          type="warning"
          size="small"
        >未同步</el-tag>
      </div>

      <div class="editor-actions">
        <el-button size="small" @click="handleSave">
          <el-icon><Check /></el-icon>
          保存并同步
        </el-button>
        <el-button size="small" @click="showPreview = !showPreview">
          <el-icon><View /></el-icon>
          {{ showPreview ? '隐藏预览' : '预览' }}
        </el-button>
        <el-button size="small" type="danger" @click="handleClose">
          <el-icon><Close /></el-icon>
          关闭
        </el-button>
      </div>
    </div>

    <div class="editor-body">
      <div class="editor-pane" :class="{ 'with-preview': showPreview }">
        <textarea
          v-model="content"
          class="code-editor"
          placeholder="在此编辑文件内容..."
          @input="handleContentChange"
        ></textarea>
      </div>

      <div v-if="showPreview" class="preview-pane">
        <div class="preview-header">预览</div>
        <div class="preview-content" v-html="renderedContent"></div>
      </div>
    </div>

    <div class="editor-footer">
      <span class="status-text">{{ statusText }}</span>
      <span class="char-count">字符数: {{ content.length }}</span>
    </div>

    <el-dialog
      v-model="showConflictDialog"
      title="文件冲突"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="conflict-info">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          title="检测到文件冲突！远程文件已被其他人修改。"
        />

        <div class="conflict-comparison">
          <div class="comparison-pane">
            <h4>本地版本</h4>
            <textarea
              :value="content"
              readonly
              class="comparison-editor"
            ></textarea>
          </div>
          <div class="comparison-pane">
            <h4>远程版本</h4>
            <textarea
              :value="remoteContent"
              readonly
              class="comparison-editor"
            ></textarea>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="handleUseRemote">使用远程版本</el-button>
        <el-button type="primary" @click="handleForceSave">强制覆盖远程</el-button>
        <el-button @click="showConflictDialog = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWebDAVStore } from '../stores/webdav'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  fileItem: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const store = useWebDAVStore()

const content = ref('')
const showPreview = ref(false)
const showConflictDialog = ref(false)
const remoteContent = ref('')
const autoSaveTimer = ref(null)
const isSaving = ref(false)

const currentEdit = computed(() => store.currentEdit)

const statusText = computed(() => {
  if (isSaving.value) return '正在保存...'
  if (currentEdit.value?.isSynced) return '已与服务器同步'
  return '本地有未保存的更改'
})

const renderedContent = computed(() => {
  if (!showPreview.value) return ''

  const ext = currentEdit.value?.name?.split('.').pop()?.toLowerCase() || ''

  if (['md', 'markdown'].includes(ext)) {
    return renderMarkdown(content.value)
  } else if (['html', 'htm'].includes(ext)) {
    return content.value
  } else {
    return `<pre>${escapeHtml(content.value)}</pre>`
  }
})

watch(() => props.visible, async (newVal) => {
  if (newVal && props.fileItem) {
    await initEditor()
  }
})

watch(() => props.fileItem, async (newVal) => {
  if (newVal && props.visible) {
    await initEditor()
  }
})

onUnmounted(() => {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }
})

async function initEditor() {
  try {
    const edit = await store.startEdit(props.fileItem)
    if (edit) {
      content.value = edit.content
    }
  } catch (e) {
    ElMessage.error('打开文件失败: ' + e)
    emit('close')
  }
}

function handleContentChange() {
  if (currentEdit.value) {
    currentEdit.value.isSynced = false
  }

  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }

  autoSaveTimer.value = setTimeout(() => {
    autoSave()
  }, 5000)
}

async function autoSave() {
  try {
    await store.saveEdit(content.value, currentEdit.value?.originalEtag)
  } catch (e) {
    console.error('自动保存失败:', e)
  }
}

async function handleSave() {
  if (!currentEdit.value) return

  isSaving.value = true
  try {
    const result = await store.saveEdit(content.value, currentEdit.value.originalEtag)

    if (result.conflict) {
      const remoteData = await store.getRemoteContent(currentEdit.value.path)
      if (remoteData) {
        remoteContent.value = remoteData[0] || ''
      }
      showConflictDialog.value = true
    } else if (result.success) {
      ElMessage.success('保存成功')
    } else {
      ElMessage.error('保存失败: ' + result.message)
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + e)
  } finally {
    isSaving.value = false
  }
}

async function handleUseRemote() {
  try {
    const remoteData = await store.getRemoteContent(currentEdit.value.path)
    if (remoteData) {
      content.value = remoteData[0] || ''
      currentEdit.value.originalEtag = remoteData[1] || null
      currentEdit.value.isSynced = true
    }
    showConflictDialog.value = false
    ElMessage.success('已使用远程版本')
  } catch (e) {
    ElMessage.error('获取远程内容失败: ' + e)
  }
}

async function handleForceSave() {
  try {
    const result = await store.forceSave(content.value)
    if (result.success) {
      showConflictDialog.value = false
      ElMessage.success('已强制覆盖远程文件')
    } else {
      ElMessage.error('强制保存失败: ' + result.message)
    }
  } catch (e) {
    ElMessage.error('强制保存失败: ' + e)
  }
}

async function handleClose() {
  if (!currentEdit.value?.isSynced) {
    try {
      await ElMessageBox.confirm(
        '文件有未保存的更改，确定要关闭吗？',
        '确认关闭',
        {
          type: 'warning',
          confirmButtonText: '关闭',
          cancelButtonText: '取消'
        }
      )
    } catch (e) {
      if (e === 'cancel') return
    }
  }

  store.clearCurrentEdit()
  emit('close')
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function renderMarkdown(md) {
  let html = md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/\n/gim, '<br>')

  return `<div class="markdown-preview">${html}</div>`
}
</script>

<style scoped>
.file-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-name {
  font-weight: 500;
  color: #303133;
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.editor-pane.with-preview {
  border-right: 1px solid #ebeef5;
}

.code-editor {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  padding: 16px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  background: white;
}

.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.preview-header {
  padding: 8px 16px;
  font-weight: 500;
  border-bottom: 1px solid #ebeef5;
  background: #f0f2f5;
}

.preview-content {
  flex: 1;
  padding: 16px;
  overflow: auto;
}

.markdown-preview :deep(h1) {
  font-size: 24px;
  margin: 16px 0;
}

.markdown-preview :deep(h2) {
  font-size: 20px;
  margin: 12px 0;
}

.markdown-preview :deep(h3) {
  font-size: 16px;
  margin: 8px 0;
}

.markdown-preview :deep(code) {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.markdown-preview :deep(li) {
  margin-left: 20px;
}

.editor-footer {
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  color: #909399;
  background: #fafafa;
}

.conflict-info {
  margin-bottom: 16px;
}

.conflict-comparison {
  display: flex;
  gap: 16px;
  margin-top: 16px;
}

.comparison-pane {
  flex: 1;
}

.comparison-pane h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #606266;
}

.comparison-editor {
  width: 100%;
  height: 200px;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  resize: none;
  background: #fafafa;
}
</style>
