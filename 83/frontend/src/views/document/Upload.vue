<template>
  <div class="page-container">
    <PageHeader title="文档上传溯源" icon="UploadFilled" subtitle="支持多文件批量上传，自动加密并生成溯源指纹" />
    
    <el-row :gutter="20">
      <el-col :lg="16" :md="24">
        <div class="card-container">
          <div class="card-title">上传文档</div>
          
          <el-form :model="uploadForm" label-width="80px">
            <el-form-item label="文档标题">
              <el-input 
                v-model="uploadForm.title" 
                placeholder="可选，不填则使用文件名"
              />
            </el-form-item>
            
            <el-form-item label="密级">
              <el-select v-model="uploadForm.secretLevel" style="width: 200px">
                <el-option label="公开" value="public" />
                <el-option label="内部" value="internal" />
                <el-option label="机密" value="secret" />
                <el-option label="绝密" value="top_secret" />
              </el-select>
            </el-form-item>
            
            <el-form-item label="描述">
              <el-input 
                v-model="uploadForm.description" 
                type="textarea" 
                :rows="3"
                placeholder="可选，文档描述信息"
              />
            </el-form-item>
            
            <el-form-item label="选择文件">
              <div 
                class="upload-area"
                :class="{ dragover: isDragover }"
                @click="triggerFileInput"
                @dragover.prevent="isDragover = true"
                @dragleave="isDragover = false"
                @drop.prevent="handleDrop"
              >
                <el-icon size="48" color="#409eff"><UploadFilled /></el-icon>
                <p class="upload-text">点击或拖拽文件到此处上传</p>
                <p class="upload-hint">支持多文件上传，单个文件最大 100MB</p>
              </div>
              <input 
                ref="fileInput" 
                type="file" 
                multiple 
                hidden 
                @change="handleFileSelect"
              />
            </el-form-item>
          </el-form>
          
          <div v-if="selectedFiles.length > 0" class="file-list">
            <div class="file-list-header">
              <span>已选择 {{ selectedFiles.length }} 个文件</span>
              <el-button type="danger" text @click="clearFiles">清空</el-button>
            </div>
            <div 
              v-for="(file, index) in selectedFiles" 
              :key="index" 
              class="file-item"
            >
              <el-icon><Document /></el-icon>
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatFileSize(file.size) }}</span>
              <el-button 
                type="danger" 
                text 
                size="small"
                @click="removeFile(index)"
              >
                移除
              </el-button>
            </div>
          </div>
          
          <div class="upload-actions">
            <el-button 
              type="primary" 
              :loading="uploading"
              :disabled="selectedFiles.length === 0"
              @click="handleUpload"
            >
              <el-icon><Upload /></el-icon>
              开始上传
            </el-button>
            <el-button @click="resetForm">重置</el-button>
          </div>
        </div>
        
        <div v-if="uploadResults.length > 0" class="card-container" style="margin-top: 20px">
          <div class="card-title">上传结果</div>
          <el-table :data="uploadResults">
            <el-table-column prop="title" label="文档标题" />
            <el-table-column prop="fileName" label="文件名" />
            <el-table-column label="密级" width="80">
              <template #default="{ row }">
                <SecretBadge :level="row.secretLevel" />
              </template>
            </el-table-column>
            <el-table-column prop="fileSize" label="大小" width="100">
              <template #default="{ row }">
                {{ formatFileSize(row.fileSize) }}
              </template>
            </el-table-column>
            <el-table-column prop="fingerprint" label="溯源指纹" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag type="info" size="small">{{ row.fingerprint }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button 
                  type="primary" 
                  text 
                  size="small"
                  @click="viewDocument(row.id)"
                >
                  查看详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      
      <el-col :lg="8" :md="24">
        <div class="card-container">
          <div class="card-title">上传说明</div>
          <div class="info-list">
            <div class="info-item">
              <el-icon color="#67c23a"><CircleCheckFilled /></el-icon>
              <div>
                <h4>自动加密存储</h4>
                <p>所有上传文档采用 AES-256-GCM 高强度加密算法存储</p>
              </div>
            </div>
            <div class="info-item">
              <el-icon color="#67c23a"><CircleCheckFilled /></el-icon>
              <div>
                <h4>生成溯源指纹</h4>
                <p>基于文件内容生成唯一哈希指纹，可检测文档篡改</p>
              </div>
            </div>
            <div class="info-item">
              <el-icon color="#67c23a"><CircleCheckFilled /></el-icon>
              <div>
                <h4>分块哈希校验</h4>
                <p>支持分块哈希记录，精确定位篡改位置</p>
              </div>
            </div>
            <div class="info-item">
              <el-icon color="#e6a23c"><WarningFilled /></el-icon>
              <div>
                <h4>密级说明</h4>
                <p>绝密/机密文档需要管理员审批后才能分享</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="card-container" style="margin-top: 20px">
          <div class="card-title">最近上传</div>
          <div v-if="recentDocuments.length > 0" class="recent-list">
            <div 
              v-for="doc in recentDocuments" 
              :key="doc.id" 
              class="recent-item"
              @click="viewDocument(doc.id)"
            >
              <el-icon><Document /></el-icon>
              <div class="recent-info">
                <span class="recent-title">{{ doc.title }}</span>
                <span class="recent-time">{{ formatDate(doc.created_at) }}</span>
              </div>
              <SecretBadge :level="doc.secret_level" />
            </div>
          </div>
          <el-empty v-else description="暂无上传记录" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { 
  UploadFilled, Document, Upload, 
  CircleCheckFilled, WarningFilled 
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { uploadDocument, getDocumentList } from '@/api/document'
import SecretBadge from '@/components/SecretBadge.vue'
import PageHeader from '@/components/PageHeader.vue'

const router = useRouter()

const fileInput = ref(null)
const isDragover = ref(false)
const uploading = ref(false)
const selectedFiles = ref([])
const uploadResults = ref([])
const recentDocuments = ref([])

const uploadForm = reactive({
  title: '',
  secretLevel: 'internal',
  description: '',
})

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatDate = (date) => {
  return dayjs(date).format('MM-DD HH:mm')
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files)
  addFiles(files)
  e.target.value = ''
}

const handleDrop = (e) => {
  isDragover.value = false
  const files = Array.from(e.dataTransfer.files)
  addFiles(files)
}

const addFiles = (files) => {
  const maxSize = 100 * 1024 * 1024
  const validFiles = files.filter(file => {
    if (file.size > maxSize) {
      ElMessage.warning(`文件 ${file.name} 超过100MB限制`)
      return false
    }
    return true
  })
  selectedFiles.value = [...selectedFiles.value, ...validFiles]
}

const removeFile = (index) => {
  selectedFiles.value.splice(index, 1)
}

const clearFiles = () => {
  selectedFiles.value = []
}

const resetForm = () => {
  uploadForm.title = ''
  uploadForm.secretLevel = 'internal'
  uploadForm.description = ''
  selectedFiles.value = []
  uploadResults.value = []
}

const handleUpload = async () => {
  if (selectedFiles.value.length === 0) {
    ElMessage.warning('请选择要上传的文件')
    return
  }

  uploading.value = true
  
  try {
    const formData = new FormData()
    selectedFiles.value.forEach(file => {
      formData.append('files', file)
    })
    formData.append('title', uploadForm.title)
    formData.append('secretLevel', uploadForm.secretLevel)
    formData.append('description', uploadForm.description)

    const result = await uploadDocument(formData)
    
    uploadResults.value = result.documents || []
    ElMessage.success(result.message || '上传成功')
    
    selectedFiles.value = []
    loadRecentDocuments()
    
  } catch (err) {
    console.error('上传失败:', err)
  } finally {
    uploading.value = false
  }
}

const viewDocument = (id) => {
  router.push(`/documents/${id}`)
}

const loadRecentDocuments = async () => {
  try {
    const result = await getDocumentList({ pageSize: 5 })
    recentDocuments.value = result.documents || []
  } catch (err) {
    console.error('加载最近文档失败:', err)
  }
}

onMounted(() => {
  loadRecentDocuments()
})
</script>

<style scoped>
.upload-area {
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;

  &:hover, &.dragover {
    border-color: #409eff;
    background-color: #f5f7fa;
  }

  .upload-text {
    font-size: 16px;
    color: #606266;
    margin: 12px 0 4px;
  }

  .upload-hint {
    font-size: 12px;
    color: #909399;
  }
}

.file-list {
  margin-top: 20px;

  .file-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 14px;
    color: #606266;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 4px;
    margin-bottom: 8px;

    .file-name {
      flex: 1;
      color: #303133;
    }

    .file-size {
      color: #909399;
      font-size: 12px;
    }
  }
}

.upload-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 20px;
}

.info-list {
  .info-item {
    display: flex;
    gap: 12px;
    padding: 16px 0;
    border-bottom: 1px solid #ebeef5;

    &:last-child {
      border-bottom: none;
    }

    .el-icon {
      font-size: 20px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    h4 {
      font-size: 14px;
      color: #303133;
      margin-bottom: 4px;
    }

    p {
      font-size: 12px;
      color: #909399;
      line-height: 1.5;
    }
  }
}

.recent-list {
  .recent-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.3s;

    &:hover {
      background: #f5f7fa;
    }

    .el-icon {
      font-size: 24px;
      color: #409eff;
    }

    .recent-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .recent-title {
        font-size: 14px;
        color: #303133;
      }

      .recent-time {
        font-size: 12px;
        color: #909399;
      }
    }
  }
}
</style>
