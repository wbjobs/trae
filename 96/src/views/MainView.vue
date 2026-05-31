<template>
  <div class="main-container">
    <header class="header">
      <div class="header-left">
        <h1>Markdown 全文搜索</h1>
        <span class="doc-count">共 {{ documentCount }} 个文档</span>
        <div class="watcher-status" :class="{ active: watcherStatus.isWatching }" @click="toggleWatcher">
          <span class="status-dot"></span>
          <span class="status-text">{{ watcherStatus.isWatching ? '自动同步已开启' : '自动同步已关闭' }}</span>
          <span v-if="watcherStatus.isWatching" class="watching-count">({{ watcherStatus.watchedCount }})</span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-primary" @click="handleImport" :disabled="isImporting">
          <span class="icon">📁</span>
          {{ isImporting ? '导入中...' : '导入文件' }}
        </button>
      </div>
    </header>

    <div v-if="isImporting" class="import-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <div class="progress-info">
        <span>正在导入: {{ importProgress.processed }} / {{ importProgress.total }}</span>
        <span class="progress-detail">成功: {{ importProgress.success }} | 失败: {{ importProgress.failed }}</span>
      </div>
      <div v-if="importProgress.currentFile" class="progress-file">
        {{ importProgress.currentFile }}
      </div>
    </div>

    <div class="content">
      <div class="search-section">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索文档内容..."
          @input="handleSearch"
        />
      </div>

      <div class="main-content">
        <div class="document-list" v-if="!searchQuery">
          <div class="list-header">
            <h2>所有文档</h2>
            <button class="btn btn-refresh" @click="loadDocuments">
              刷新
            </button>
          </div>
          <div class="list-content">
            <div
              v-for="doc in documents"
              :key="doc.id"
              class="document-item"
              @click="openDocument(doc)"
            >
              <div class="item-header">
                <span class="item-title">{{ doc.title }}</span>
                <button
                  class="btn-delete"
                  @click.stop="handleDelete(doc.id)"
                >
                  删除
                </button>
              </div>
              <div class="item-path">{{ doc.path }}</div>
              <div class="item-meta">
                更新于 {{ formatDate(doc.updated_at) }}
              </div>
            </div>
            <div v-if="documents.length === 0" class="empty-state">
              <p>暂无文档</p>
              <p class="hint">点击上方 "导入文件" 按钮添加 Markdown 文档</p>
            </div>
          </div>
        </div>

        <div class="search-results" v-else>
          <div class="results-header">
            <h2>搜索结果</h2>
            <span class="result-count">找到 {{ searchResults.length }} 个结果</span>
          </div>
          <div class="results-content">
            <div
              v-for="result in searchResults"
              :key="result.id"
              class="result-item"
              @click="openSearchResult(result)"
            >
              <div class="result-title" v-html="highlightText(result.title, searchQuery)"></div>
              <div
                class="result-preview"
                v-html="highlightText(getPreviewText(result.content, searchQuery), searchQuery)"
              ></div>
              <div class="result-path">{{ result.path }}</div>
            </div>
            <div v-if="searchResults.length === 0" class="empty-state">
              <p>未找到相关结果</p>
              <p class="hint">尝试使用其他关键词搜索</p>
            </div>
          </div>
        </div>

        <div class="document-preview" v-if="selectedDocument">
          <div class="preview-header">
            <h2>{{ selectedDocument.title }}</h2>
            <button class="btn-close" @click="selectedDocument = null">×</button>
          </div>
          <div class="preview-content">
            <pre class="markdown-content" v-html="renderMarkdown(selectedDocument.content)"></pre>
          </div>
        </div>
      </div>
    </div>

    <input
      type="file"
      ref="fileInput"
      multiple
      accept=".md,.markdown"
      style="display: none"
      @change="handleFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { Document, SearchResult } from '../types'
import { highlightText, getPreviewText } from '../utils/highlight'

const searchQuery = ref('')
const documents = ref<Document[]>([])
const searchResults = ref<SearchResult[]>([])
const documentCount = ref(0)
const selectedDocument = ref<Document | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)
const importProgress = ref({
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
  currentFile: ''
})
const watcherStatus = ref({
  isWatching: false,
  watchedCount: 0,
  watchedFiles: [] as string[]
})

const progressPercent = computed(() => {
  if (importProgress.value.total === 0) return 0
  return Math.round((importProgress.value.processed / importProgress.value.total) * 100)
})

async function loadWatcherStatus() {
  if (window.api?.getWatcherStatus) {
    watcherStatus.value = await window.api.getWatcherStatus()
  }
}

async function toggleWatcher() {
  if (watcherStatus.value.isWatching) {
    if (window.api?.stopWatcher) {
      watcherStatus.value = await window.api.stopWatcher()
    }
  } else {
    if (window.api?.startWatcher) {
      watcherStatus.value = await window.api.startWatcher()
    }
  }
}

onMounted(async () => {
  await loadDocuments()
  await loadDocumentCount()
  await loadWatcherStatus()
  
  if (window.api?.onOpenDocument) {
    window.api.onOpenDocument(async (id: number) => {
      const doc = documents.value.find(d => d.id === id)
      if (doc) {
        selectedDocument.value = doc
      }
    })
  }

  if (window.api?.onImportProgress) {
    window.api.onImportProgress((progress: any) => {
      importProgress.value = progress
    })
  }

  if (window.api?.onWatcherStatusChange) {
    window.api.onWatcherStatusChange((status: any) => {
      watcherStatus.value = status
    })
  }
})

onBeforeUnmount(() => {
  if (window.api?.removeImportProgressListener) {
    window.api.removeImportProgressListener()
  }
  if (window.api?.removeWatcherStatusListener) {
    window.api.removeWatcherStatusListener()
  }
})

async function loadDocuments() {
  if (window.api?.getDocuments) {
    documents.value = await window.api.getDocuments()
  }
}

async function loadDocumentCount() {
  if (window.api?.getDocumentCount) {
    documentCount.value = await window.api.getDocumentCount()
  }
}

function handleImport() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return

  const filePaths = Array.from(files).map(f => (f as any).path)
  
  if (window.api?.importFiles) {
    isImporting.value = true
    importProgress.value = {
      total: filePaths.length,
      processed: 0,
      success: 0,
      failed: 0,
      currentFile: ''
    }
    
    try {
      const result = await window.api.importFiles(filePaths)
      alert(`导入完成：成功 ${result.success} 个，失败 ${result.failed} 个`)
      await loadDocuments()
      await loadDocumentCount()
    } finally {
      isImporting.value = false
    }
  }

  target.value = ''
}

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  if (window.api?.search) {
    searchResults.value = await window.api.search(searchQuery.value)
  }
}

async function handleDelete(id: number) {
  if (!confirm('确定要删除这个文档吗？')) return

  if (window.api?.deleteDocument) {
    const success = await window.api.deleteDocument(id)
    if (success) {
      await loadDocuments()
      await loadDocumentCount()
      if (selectedDocument.value?.id === id) {
        selectedDocument.value = null
      }
    }
  }
}

function openDocument(doc: Document) {
  selectedDocument.value = doc
}

function openSearchResult(result: SearchResult) {
  const doc = documents.value.find(d => d.id === result.id)
  if (doc) {
    selectedDocument.value = doc
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function renderMarkdown(content: string): string {
  return escapeHtml(content)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
</script>

<style scoped>
.main-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h1 {
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.doc-count {
  font-size: 13px;
  color: #999;
  background: #f0f0f0;
  padding: 4px 12px;
  border-radius: 12px;
}

.watcher-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #999;
  background: #fff7e6;
  padding: 4px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.watcher-status.active {
  background: #f6ffed;
  color: #52c41a;
}

.watcher-status:hover {
  opacity: 0.8;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #faad14;
  animation: pulse 2s infinite;
}

.watcher-status.active .status-dot {
  background: #52c41a;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.watching-count {
  color: #666;
  font-size: 11px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #1890ff;
  color: #fff;
}

.btn-primary:hover {
  background: #40a9ff;
}

.btn-primary:disabled {
  background: #91d5ff;
  cursor: not-allowed;
}

.import-progress {
  padding: 12px 24px;
  background: #e6f7ff;
  border-bottom: 1px solid #91d5ff;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: #1890ff;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #666;
}

.progress-detail {
  color: #999;
}

.progress-file {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-refresh {
  background: #f0f0f0;
  color: #666;
  padding: 6px 12px;
  font-size: 13px;
}

.btn-refresh:hover {
  background: #e0e0e0;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-section {
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.document-list,
.search-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #f0f0f0;
}

.list-header,
.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #f5f5f5;
}

.list-header h2,
.results-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.result-count {
  font-size: 13px;
  color: #999;
}

.list-content,
.results-content {
  flex: 1;
  overflow-y: auto;
}

.document-item,
.result-item {
  padding: 16px 24px;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
  transition: background 0.2s;
}

.document-item:hover,
.result-item:hover {
  background: #f9f9f9;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.item-path,
.result-path {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 12px;
  color: #bbb;
  margin-top: 4px;
}

.result-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  margin-bottom: 8px;
}

.result-preview {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}

.btn-delete {
  background: #fff1f0;
  color: #ff4d4f;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-delete:hover {
  background: #ffccc7;
}

.document-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.preview-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f0f0f0;
  color: #666;
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.markdown-content {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  font-size: 14px;
  line-height: 1.8;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.markdown-content h1 {
  font-size: 24px;
  margin: 16px 0 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #f0f0f0;
}

.markdown-content h2 {
  font-size: 20px;
  margin: 14px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0f0f0;
}

.markdown-content h3 {
  font-size: 17px;
  margin: 12px 0 8px;
}

.markdown-content code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: #999;
}

.empty-state p {
  margin: 4px 0;
}

.empty-state .hint {
  font-size: 13px;
  color: #bbb;
}

.icon {
  font-size: 16px;
}
</style>
