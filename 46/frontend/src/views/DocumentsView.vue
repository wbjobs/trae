<template>
  <div class="documents-page">
    <div class="page-container">
      <div class="page-header">
        <h2 class="page-title">文档列表</h2>
        <div class="search-bar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索文档..."
            clearable
            class="search-input"
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" @click="handleSearch">
            搜索
          </el-button>
        </div>
      </div>

      <el-table
        :data="documents"
        v-loading="loading"
        border
        class="documents-table"
      >
        <el-table-column label="文件名" prop="filename" min-width="200">
          <template #default="{ row }">
            <div class="filename-cell">
              <el-icon :color="getFileTypeColor(row.file_type)">
                <component :is="getFileTypeIcon(row.file_type)" />
              </el-icon>
              <span class="filename text-ellipsis" :title="row.filename">
                {{ row.filename }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getFileTypeTag(row.file_type)" size="small">
              {{ row.file_type.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>
        <el-table-column label="上传时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.upload_time) }}
          </template>
        </el-table-column>
        <el-table-column label="页数" width="80" prop="page_count">
          <template #default="{ row }">
            {{ row.page_count || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDocument(row)">
              查看
            </el-button>
            <el-button type="success" link @click="downloadDocument(row)">
              下载
            </el-button>
            <el-button type="danger" link @click="deleteDocument(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchDocuments"
          @current-change="fetchDocuments"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type ElMessageBoxOptions } from 'element-plus'
import { api } from '@/api'
import type { DocumentInfo } from '@/types'

const router = useRouter()

const documents = ref<DocumentInfo[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchQuery = ref('')

const fetchDocuments = async () => {
  loading.value = true
  try {
    const skip = (currentPage.value - 1) * pageSize.value

    if (searchQuery.value.trim()) {
      const result = await api.searchDocuments({
        query: searchQuery.value,
        skip,
        limit: pageSize.value
      })
      documents.value = result.documents
      total.value = result.total
    } else {
      const result = await api.getDocuments(skip, pageSize.value)
      documents.value = result.documents
      total.value = result.total
    }
  } catch (error) {
    ElMessage.error('获取文档列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchDocuments()
}

const viewDocument = (doc: DocumentInfo) => {
  router.push(`/documents/${doc.document_id}`)
}

const downloadDocument = async (doc: DocumentInfo) => {
  try {
    const blob = await api.downloadDocument(doc.document_id) as Blob
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    ElMessage.success('下载成功')
  } catch (error) {
    ElMessage.error('下载失败')
  }
}

const deleteDocument = async (doc: DocumentInfo) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除文档 "${doc.filename}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      }
    )
    await api.deleteDocument(doc.document_id)
    ElMessage.success('删除成功')
    fetchDocuments()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const getFileTypeTag = (type: string) => {
  const tags: Record<string, string> = {
    pdf: 'danger',
    word: 'primary',
    excel: 'success',
    image: 'warning'
  }
  return tags[type] || 'info'
}

const getFileTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    pdf: '#F56C6C',
    word: '#409EFF',
    excel: '#67C23A',
    image: '#E6A23C'
  }
  return colors[type] || '#909399'
}

const getFileTypeIcon = (type: string) => {
  const icons: Record<string, string> = {
    pdf: 'Document',
    word: 'Document',
    excel: 'Grid',
    image: 'Picture'
  }
  return icons[type] || 'Document'
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(() => {
  fetchDocuments()
})
</script>

<style lang="scss" scoped>
.documents-page {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;

    .page-title {
      margin: 0;
    }

    .search-bar {
      display: flex;
      gap: 12px;

      .search-input {
        width: 300px;
      }
    }
  }

  .documents-table {
    .filename-cell {
      display: flex;
      align-items: center;
      gap: 8px;

      .filename {
        flex: 1;
        min-width: 0;
      }
    }
  }

  .pagination {
    margin-top: 24px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
