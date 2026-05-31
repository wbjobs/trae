<template>
  <div class="file-explorer">
    <div class="toolbar">
      <div class="server-selector">
        <el-select
          v-model="selectedServerId"
          placeholder="选择服务器"
          style="width: 200px"
          @change="handleServerChange"
        >
          <el-option
            v-for="server in servers"
            :key="server.id"
            :label="server.name"
            :value="server.id"
          />
        </el-select>
      </div>

      <div class="path-navigator">
        <el-button
          :disabled="pathHistory.length === 0"
          @click="goBack"
          size="small"
        >
          <el-icon><ArrowLeft /></el-icon>
        </el-button>

        <div class="path-breadcrumb">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item @click="navigateTo('/')">根目录</el-breadcrumb-item>
            <template v-for="(segment, index) in pathSegments" :key="index">
              <el-breadcrumb-item @click="navigateTo(segment.fullPath)">
                {{ segment.name }}
              </el-breadcrumb-item>
            </template>
          </el-breadcrumb>
        </div>
      </div>

      <div class="actions">
        <el-button size="small" @click="refreshFiles">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button size="small" @click="showCreateFolderDialog = true">
          <el-icon><FolderAdd /></el-icon>
          新建文件夹
        </el-button>
        <el-button size="small" type="primary" @click="handleUploadClick">
          <el-icon><Upload /></el-icon>
          上传文件
        </el-button>
      </div>
    </div>

    <div
      class="file-drop-zone"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
      :class="{ 'drag-over': isDragOver }"
    >
      <el-table
        :data="files"
        v-loading="loading"
        style="width: 100%"
        height="calc(100vh - 220px)"
        empty-text="暂无文件"
        @row-dblclick="handleRowDblClick"
      >
        <el-table-column width="50">
          <template #default="{ row }">
            <el-icon :size="24" :color="row.is_dir ? '#409eff' : '#909399'">
              <component :is="row.is_dir ? 'Folder' : getFileIcon(row.name)" />
            </el-icon>
          </template>
        </el-table-column>

        <el-table-column prop="name" label="名称" min-width="200">
          <template #default="{ row }">
            <span :class="{ 'folder': row.is_dir }">{{ row.name }}</span>
          </template>
        </el-table-column>

        <el-table-column label="大小" width="120">
          <template #default="{ row }">
            <span v-if="!row.is_dir">{{ formatFileSize(row.size) }}</span>
            <span v-else class="dir-label">文件夹</span>
          </template>
        </el-table-column>

        <el-table-column prop="modified" label="修改时间" width="180">
          <template #default="{ row }">
            {{ row.modified || '-' }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              @click.stop="handleEdit(row)"
              v-if="!row.is_dir && isEditable(row.name)"
            >
              编辑
            </el-button>
            <el-button size="small" @click.stop="handleDownload(row)" v-if="!row.is_dir">
              下载
            </el-button>
            <el-button size="small" @click.stop="handleRename(row)">
              重命名
            </el-button>
            <el-button size="small" type="danger" @click.stop="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="isDragOver" class="drop-overlay">
        <el-icon :size="48" color="#409eff"><UploadFilled /></el-icon>
        <p>释放文件以上传</p>
      </div>
    </div>

    <FileEditor
      v-if="showEditor"
      :visible="showEditor"
      :file-item="editingFile"
      @close="handleEditorClose"
    />

    <input
      type="file"
      ref="fileInput"
      style="display: none"
      multiple
      @change="onFileSelect"
    />

    <el-dialog v-model="showCreateFolderDialog" title="新建文件夹" width="400px">
      <el-form :model="folderForm" :rules="folderRules" ref="folderFormRef">
        <el-form-item label="文件夹名称" prop="name">
          <el-input v-model="folderForm.name" placeholder="请输入文件夹名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateFolderDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFolder">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRenameDialog" title="重命名" width="400px">
      <el-form :model="renameForm" :rules="renameRules" ref="renameFormRef">
        <el-form-item label="新名称" prop="name">
          <el-input v-model="renameForm.name" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmRename">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showUploadProgress" title="上传进度" width="500px">
      <div class="upload-progress-list">
        <div v-for="(file, index) in uploadQueue" :key="index" class="upload-item">
          <div class="file-info">
            <el-icon><Document /></el-icon>
            <span>{{ file.name }}</span>
          </div>
          <el-progress
            :percentage="file.progress"
            :status="file.status === 'error' ? 'exception' : file.status === 'done' ? 'success' : ''"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWebDAVStore } from '../stores/webdav'
import { Document, Folder, Picture, Video, Headset, Files } from '@element-plus/icons-vue'
import FileEditor from './FileEditor.vue'

const store = useWebDAVStore()

const servers = computed(() => store.servers)
const files = computed(() => store.files)
const loading = computed(() => store.loading)
const currentPath = computed(() => store.currentPath)
const pathHistory = computed(() => store.pathHistory)
const uploadQueue = computed(() => store.uploadQueue)

const selectedServerId = ref(null)
const isDragOver = ref(false)
const showCreateFolderDialog = ref(false)
const showRenameDialog = ref(false)
const showUploadProgress = ref(false)
const showEditor = ref(false)
const editingFile = ref(null)
const fileInput = ref(null)
const folderFormRef = ref(null)
const renameFormRef = ref(null)

const renameTarget = ref(null)
const renameForm = ref({ name: '' })
const folderForm = ref({ name: '' })

const folderRules = {
  name: [{ required: true, message: '请输入文件夹名称', trigger: 'blur' }]
}

const renameRules = {
  name: [{ required: true, message: '请输入新名称', trigger: 'blur' }]
}

const pathSegments = computed(() => {
  if (currentPath.value === '/') return []

  const parts = currentPath.value.split('/').filter(Boolean)
  return parts.map((part, index) => ({
    name: part,
    fullPath: '/' + parts.slice(0, index + 1).join('/')
  }))
})

onMounted(async () => {
  await store.loadServers()
  if (store.servers.length > 0) {
    selectedServerId.value = store.servers[0].id
    store.setCurrentServer(store.servers[0])
    await store.listFiles('/')
  }
})

function handleServerChange(serverId) {
  const server = store.servers.find(s => s.id === serverId)
  if (server) {
    store.setCurrentServer(server)
    store.listFiles('/')
  }
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return Picture
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv'].includes(ext)) return Video
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return Headset
  if (['doc', 'docx', 'pdf', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return Document
  return Files
}

function formatFileSize(bytes) {
  return store.formatFileSize(bytes)
}

async function navigateTo(path) {
  await store.listFiles(path)
}

async function goBack() {
  await store.goBack()
}

async function refreshFiles() {
  await store.refreshFiles()
}

function handleRowDblClick(row) {
  if (row.is_dir) {
    store.listFiles(row.path)
  }
}

function handleUploadClick() {
  fileInput.value?.click()
}

function onFileSelect(event) {
  const files = Array.from(event.target.files)
  uploadLocalFiles(files)
  event.target.value = ''
}

function onDragOver(event) {
  isDragOver.value = true
}

function onDragLeave(event) {
  isDragOver.value = false
}

async function onDrop(event) {
  isDragOver.value = false
  const files = Array.from(event.dataTransfer.files)
  await uploadLocalFiles(files)
}

async function uploadLocalFiles(files) {
  showUploadProgress.value = true

  for (const file of files) {
    const remotePath = currentPath.value === '/'
      ? `/${file.name}`
      : `${currentPath.value}/${file.name}`

    try {
      if (file.size > 100 * 1024 * 1024) {
        await store.uploadFileChunked(file.path, remotePath)
      } else {
        await store.uploadFile(file.path, remotePath)
      }
      ElMessage.success(`${file.name} 上传成功`)
    } catch (e) {
      ElMessage.error(`${file.name} 上传失败: ${e}`)
    }
  }
}

async function handleDownload(row) {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const filePath = await save({
      defaultPath: row.name
    })

    if (filePath) {
      await store.downloadFile(row, filePath)
      ElMessage.success('下载成功')
    }
  } catch (e) {
    ElMessage.error(`下载失败: ${e}`)
  }
}

function handleRename(row) {
  renameTarget.value = row
  renameForm.value.name = row.name
  showRenameDialog.value = true
}

async function confirmRename() {
  try {
    await renameFormRef.value.validate()
    await store.renameFile(renameTarget.value, renameForm.value.name)
    ElMessage.success('重命名成功')
    showRenameDialog.value = false
  } catch (e) {
    if (e !== false) {
      ElMessage.error('重命名失败')
    }
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定要删除 "${row.name}" 吗？`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      }
    )

    await store.deleteFile(row)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

async function handleCreateFolder() {
  try {
    await folderFormRef.value.validate()
    await store.createFolder(folderForm.value.name)
    ElMessage.success('创建成功')
    showCreateFolderDialog.value = false
    folderForm.value.name = ''
  } catch (e) {
    if (e !== false) {
      ElMessage.error('创建失败')
    }
  }
}

async function isEditable(filename) {
  return await store.isEditable(filename)
}

function handleEdit(row) {
  editingFile.value = row
  showEditor.value = true
}

function handleEditorClose() {
  showEditor.value = false
  editingFile.value = null
}
</script>

<style scoped>
.file-explorer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.server-selector {
  flex-shrink: 0;
}

.path-navigator {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.path-breadcrumb {
  flex: 1;
  overflow: hidden;
}

.actions {
  display: flex;
  gap: 8px;
}

.file-drop-zone {
  flex: 1;
  position: relative;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.file-drop-zone.drag-over {
  border: 2px dashed #409eff;
}

.drop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(64, 158, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.drop-overlay p {
  margin-top: 12px;
  color: #409eff;
  font-size: 16px;
}

.folder {
  color: #409eff;
  font-weight: 500;
}

.dir-label {
  color: #909399;
  font-size: 12px;
}

.upload-progress-list {
  max-height: 400px;
  overflow-y: auto;
}

.upload-item {
  margin-bottom: 16px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
