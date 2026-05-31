<template>
  <div class="page-container">
    <PageHeader :title="document?.title || '文档详情'" icon="Document">
      <template #actions>
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回列表
        </el-button>
      </template>
    </PageHeader>
    
    <el-row :gutter="20">
      <el-col :lg="16" :md="24">
        <div class="card-container" v-loading="loading">
          <div class="doc-header">
            <h2 class="doc-title">{{ document?.title }}</h2>
            <div class="doc-meta">
              <SecretBadge :level="document?.secret_level" />
              <span class="meta-item">
                <el-icon><User /></el-icon>
                {{ document?.uploader_name }}
              </span>
              <span class="meta-item">
                <el-icon><FolderOpened /></el-icon>
                {{ document?.department }}
              </span>
              <span class="meta-item">
                <el-icon><Clock /></el-icon>
                {{ formatDate(document?.created_at) }}
              </span>
            </div>
          </div>
          
          <el-descriptions :column="2" border style="margin-top: 20px">
            <el-descriptions-item label="文件名">
              {{ document?.file_name }}
            </el-descriptions-item>
            <el-descriptions-item label="文件大小">
              {{ formatFileSize(document?.file_size) }}
            </el-descriptions-item>
            <el-descriptions-item label="文件类型">
              {{ document?.file_type || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="版本">
              v{{ document?.version || 1 }}
            </el-descriptions-item>
            <el-descriptions-item label="文件指纹">
              <el-tag type="info" size="small">{{ document?.fingerprint }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="文档UUID">
              <span class="uuid-text">{{ document?.doc_uuid }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="浏览次数">
              {{ document?.view_count || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="下载次数">
              {{ document?.download_count || 0 }}
            </el-descriptions-item>
            <el-descriptions-item label="描述" :span="2">
              {{ document?.description || '暂无描述' }}
            </el-descriptions-item>
          </el-descriptions>
          
          <div class="action-bar" v-if="document">
            <el-button type="primary" @click="downloadDoc">
              <el-icon><Download /></el-icon>
              下载文档
            </el-button>
            <el-button @click="verifyIntegrity">
              <el-icon><CircleCheck /></el-icon>
              完整性校验
            </el-button>
            <el-button @click="generateWatermark">
              <el-icon><Picture /></el-icon>
              生成水印
            </el-button>
            <el-button @click="showTraceDialog">
              <el-icon><Histogram /></el-icon>
              访问溯源
            </el-button>
          </div>
        </div>
        
        <div v-if="integrityResult" class="card-container" style="margin-top: 20px">
          <div class="card-title">完整性校验结果</div>
          <el-result 
            :icon="integrityResult.isIntact ? 'success' : 'error'"
            :title="integrityResult.isIntact ? '文件完整' : '文件已被篡改'"
            :sub-title="integrityResult.isIntact ? '文档内容未被修改' : '检测到文档内容可能已被篡改'"
          >
            <template #extra v-if="!integrityResult.isIntact && integrityResult.changes.length > 0">
              <div class="changes-list">
                <div v-for="(change, index) in integrityResult.changes" :key="index" class="change-item">
                  <el-icon color="#f56c6c"><Warning /></el-icon>
                  <span>{{ change.message }}</span>
                </div>
              </div>
            </template>
          </el-result>
        </div>
      </el-col>
      
      <el-col :lg="8" :md="24">
        <div class="card-container">
          <div class="card-title">指纹信息</div>
          <div class="fingerprint-info">
            <div class="info-row">
              <span class="label">哈希算法</span>
              <span class="value">SHA-256</span>
            </div>
            <div class="info-row">
              <span class="label">分块大小</span>
              <span class="value">{{ document?.fingerprintData?.blockSize || 0 }} KB</span>
            </div>
            <div class="info-row">
              <span class="label">分块数量</span>
              <span class="value">{{ document?.fingerprintData?.blockCount || 0 }}</span>
            </div>
            <div class="info-row">
              <span class="label">加密状态</span>
              <span class="value">
                <el-tag type="success" size="small">已加密</el-tag>
              </span>
            </div>
          </div>
        </div>
        
        <div class="card-container" style="margin-top: 20px">
          <div class="card-title">水印信息</div>
          <div v-if="watermarkData">
            <div class="watermark-preview-wrapper">
              <WatermarkPreview :config="watermarkConfig" :width="280" :height="180" />
            </div>
            <div class="watermark-info">
              <p><strong>可见水印:</strong> {{ watermarkData.visibleWatermark?.content }}</p>
              <p><strong>隐水印:</strong> <el-tag type="info" size="small">已嵌入</el-tag></p>
            </div>
          </div>
          <el-empty v-else description="点击上方按钮生成水印" />
        </div>
      </el-col>
    </el-row>
    
    <el-dialog 
      v-model="traceDialogVisible" 
      title="文档访问溯源" 
      width="800px"
    >
      <div v-if="traceData">
        <el-descriptions :column="2" size="small" border style="margin-bottom: 20px">
          <el-descriptions-item label="文档标题">
            {{ traceData.document?.title }}
          </el-descriptions-item>
          <el-descriptions-item label="上传者">
            {{ traceData.document?.uploadedBy }}
          </el-descriptions-item>
          <el-descriptions-item label="上传时间">
            {{ formatDate(traceData.document?.uploadedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="溯源级别">
            {{ traceData.traceLevel }}
          </el-descriptions-item>
        </el-descriptions>
        
        <h4 style="margin-bottom: 12px">访问历史</h4>
        <el-table :data="traceData.accessHistory || []" size="small" max-height="300">
          <el-table-column prop="user" label="用户" width="120" />
          <el-table-column prop="operation" label="操作" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ getOperationText(row.operation) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="ip" label="IP地址" width="120" />
          <el-table-column prop="timestamp" label="时间" width="160" />
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { 
  ArrowLeft, User, FolderOpened, Clock, Download, 
  CircleCheck, Picture, Histogram, Warning 
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { 
  getDocumentDetail, 
  downloadDocument, 
  verifyDocumentIntegrity 
} from '@/api/document'
import { generateWatermark as apiGenerateWatermark } from '@/api/watermark'
import { getDocumentTrace } from '@/api/log'
import SecretBadge from '@/components/SecretBadge.vue'
import PageHeader from '@/components/PageHeader.vue'
import WatermarkPreview from '@/components/WatermarkPreview.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const document = ref(null)
const integrityResult = ref(null)
const watermarkData = ref(null)
const traceDialogVisible = ref(false)
const traceData = ref(null)

const watermarkConfig = ref({
  content: '',
  fontSize: 14,
  opacity: 0.3,
  angle: -30,
  color: '#ff0000',
})

const formatFileSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatDate = (date) => {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'
}

const getOperationText = (type) => {
  const texts = {
    view: '查看',
    download: '下载',
    edit: '编辑',
    share: '分享',
  }
  return texts[type] || type
}

const goBack = () => {
  router.push('/documents')
}

const loadDocument = async () => {
  loading.value = true
  try {
    const doc = await getDocumentDetail(route.params.id)
    document.value = doc
  } catch (err) {
    console.error('加载文档详情失败:', err)
    ElMessage.error('加载文档详情失败')
  } finally {
    loading.value = false
  }
}

const downloadDoc = async () => {
  try {
    const blob = await downloadDocument(document.value.id)
    const url = window.URL.createObjectURL(new Blob([blob]))
    const link = document.createElement('a')
    link.href = url
    link.download = document.value.file_name
    link.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('下载成功')
  } catch (err) {
    console.error('下载失败:', err)
  }
}

const verifyIntegrity = async () => {
  try {
    integrityResult.value = await verifyDocumentIntegrity(document.value.id)
  } catch (err) {
    console.error('完整性校验失败:', err)
  }
}

const generateWatermark = async () => {
  try {
    watermarkData.value = await apiGenerateWatermark(document.value.id)
    watermarkConfig.value = {
      content: watermarkData.value.visibleWatermark?.content || '水印内容',
      fontSize: watermarkData.value.config?.font_size || 14,
      opacity: watermarkData.value.config?.opacity || 0.3,
      angle: watermarkData.value.config?.angle || -30,
      color: watermarkData.value.config?.color || '#ff0000',
    }
    ElMessage.success('水印生成成功')
  } catch (err) {
    console.error('生成水印失败:', err)
  }
}

const showTraceDialog = async () => {
  try {
    traceData.value = await getDocumentTrace(document.value.id, 'high')
    traceDialogVisible.value = true
  } catch (err) {
    console.error('加载溯源数据失败:', err)
  }
}

onMounted(() => {
  loadDocument()
})
</script>

<style scoped>
.doc-header {
  border-bottom: 1px solid #ebeef5;
  padding-bottom: 20px;
  margin-bottom: 20px;

  .doc-title {
    font-size: 20px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 12px;
  }

  .doc-meta {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;

    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #909399;
      font-size: 13px;

      .el-icon {
        font-size: 14px;
      }
    }
  }
}

.action-bar {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}

.fingerprint-info {
  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid #ebeef5;

    &:last-child {
      border-bottom: none;
    }

    .label {
      color: #909399;
    }

    .value {
      color: #303133;
    }
  }
}

.uuid-text {
  font-family: monospace;
  font-size: 12px;
  color: #909399;
}

.watermark-preview-wrapper {
  margin-bottom: 16px;
}

.watermark-info {
  p {
    margin-bottom: 8px;
    font-size: 13px;
    color: #606266;
  }
}

.changes-list {
  text-align: left;

  .change-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    color: #606266;
  }
}
</style>
