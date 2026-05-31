<template>
  <div class="search-panel">
    <div class="search-container">
      <el-tabs v-model="activeTab" class="search-tabs">
        <el-tab-pane label="文件名搜索" name="filename">
          <div class="search-bar">
            <el-select
              v-model="selectedServerId"
              placeholder="选择服务器"
              style="width: 200px"
              clearable
            >
              <el-option
                v-for="server in servers"
                :key="server.id"
                :label="server.name"
                :value="server.id"
              />
            </el-select>

            <el-input
              v-model="filenameQuery"
              placeholder="输入文件名搜索..."
              style="flex: 1"
              @keyup.enter="searchFilename"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>

            <el-button type="primary" @click="searchFilename">
              搜索
            </el-button>
          </div>

          <div class="search-results">
            <el-table
              :data="filenameResults"
              v-loading="searching"
              style="width: 100%"
              empty-text="暂无搜索结果"
              @row-dblclick="navigateToFile"
            >
              <el-table-column width="50">
                <template #default="{ row }">
                  <el-icon :size="24" :color="row.is_dir ? '#409eff' : '#909399'">
                    <component :is="row.is_dir ? 'Folder' : getFileIcon(row.name)" />
                  </el-icon>
                </template>
              </el-table-column>

              <el-table-column prop="name" label="文件名" min-width="200">
                <template #default="{ row }">
                  <span :class="{ 'folder': row.is_dir }">{{ row.name }}</span>
                </template>
              </el-table-column>

              <el-table-column prop="path" label="路径" min-width="200" show-overflow-tooltip />

              <el-table-column label="大小" width="120">
                <template #default="{ row }">
                  <span v-if="!row.is_dir">{{ formatFileSize(row.size) }}</span>
                  <span v-else class="dir-label">文件夹</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="全文搜索" name="content">
          <div class="search-bar">
            <el-select
              v-model="selectedServerId"
              placeholder="选择服务器"
              style="width: 200px"
              clearable
            >
              <el-option
                v-for="server in servers"
                :key="server.id"
                :label="server.name"
                :value="server.id"
              />
            </el-select>

            <el-input
              v-model="contentQuery"
              placeholder="输入搜索关键词..."
              style="flex: 1"
              @keyup.enter="searchContent"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>

            <el-button type="primary" @click="searchContent">
              搜索
            </el-button>
          </div>

          <div class="search-tip">
            <el-alert
              title="全文搜索会在已索引的文本文件中搜索内容"
              type="info"
              :closable="false"
              show-icon
            />
          </div>

          <div class="search-results">
            <el-table
              :data="contentResults"
              v-loading="searching"
              style="width: 100%"
              empty-text="暂无搜索结果"
              @row-dblclick="viewContent"
            >
              <el-table-column prop="name" label="文件名" min-width="150" />

              <el-table-column prop="path" label="路径" min-width="150" show-overflow-tooltip />

              <el-table-column prop="content" label="内容摘要" min-width="300" show-overflow-tooltip>
                <template #default="{ row }">
                  <span class="content-preview">{{ row.content }}</span>
                </template>
              </el-table-column>

              <el-table-column prop="score" label="相关度" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="getScoreType(row.score)">
                    {{ (row.score * 100).toFixed(0) }}%
                  </el-tag>
                </template>
              </el-table-column>

              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button size="small" @click="viewContent(row)">
                    查看
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="showContentDialog" title="文件内容" width="70%" top="5vh">
      <div class="content-viewer">
        <div class="content-header">
          <span>{{ selectedFile?.name }}</span>
          <span class="content-path">{{ selectedFile?.path }}</span>
        </div>
        <div class="content-body">
          <pre>{{ fileContent }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWebDAVStore } from '../stores/webdav'
import { Document, Folder, Picture, Video, Headset, Files } from '@element-plus/icons-vue'

const router = useRouter()
const store = useWebDAVStore()

const servers = computed(() => store.servers)

const activeTab = ref('filename')
const filenameQuery = ref('')
const contentQuery = ref('')
const selectedServerId = ref(null)
const searching = ref(false)
const filenameResults = ref([])
const contentResults = ref([])
const showContentDialog = ref(false)
const selectedFile = ref(null)
const fileContent = ref('')

onMounted(async () => {
  await store.loadServers()
})

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

function getScoreType(score) {
  if (score > 0.8) return 'success'
  if (score > 0.5) return 'warning'
  return 'info'
}

async function searchFilename() {
  if (!filenameQuery.value.trim()) return

  searching.value = true
  try {
    await store.searchFiles(filenameQuery.value.trim(), selectedServerId.value || null)
    filenameResults.value = store.searchResults
  } finally {
    searching.value = false
  }
}

async function searchContent() {
  if (!contentQuery.value.trim()) return

  searching.value = true
  try {
    await store.searchContent(contentQuery.value.trim(), selectedServerId.value || null)
    contentResults.value = store.contentSearchResults
  } finally {
    searching.value = false
  }
}

function navigateToFile(row) {
  if (row.is_dir) {
    router.push('/explorer')
    setTimeout(() => {
      if (store.servers.length > 0) {
        store.setCurrentServer(store.servers[0])
        store.listFiles(row.path)
      }
    }, 100)
  }
}

async function viewContent(row) {
  selectedFile.value = row
  showContentDialog.value = true

  try {
    const content = await store.getFileContent({
      path: row.path,
      name: row.name
    })
    fileContent.value = content || ''
  } catch (e) {
    fileContent.value = '加载内容失败'
  }
}
</script>

<style scoped>
.search-panel {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-container {
  flex: 1;
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
}

.search-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.search-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.search-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.search-tip {
  margin-bottom: 12px;
}

.search-results {
  flex: 1;
  overflow: auto;
}

.folder {
  color: #409eff;
  font-weight: 500;
}

.dir-label {
  color: #909399;
  font-size: 12px;
}

.content-preview {
  font-size: 13px;
  color: #606266;
}

.content-viewer {
  display: flex;
  flex-direction: column;
  height: 70vh;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 12px;
}

.content-path {
  font-size: 12px;
  color: #909399;
}

.content-body {
  flex: 1;
  overflow: auto;
  background: #fafafa;
  padding: 16px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
}

.content-body pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
}
</style>
