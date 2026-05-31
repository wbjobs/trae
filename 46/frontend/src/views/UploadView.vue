<template>
  <div class="upload-page">
    <div class="page-container">
      <h2 class="page-title">文档上传与解析</h2>

      <el-card class="upload-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon :size="20" color="#409EFF"><UploadFilled /></el-icon>
            <span>上传文档</span>
          </div>
        </template>

        <el-upload
          class="upload-area"
          drag
          :auto-upload="false"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          :file-list="fileList"
          :accept="acceptTypes"
          multiple
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="upload-text">
            将文件拖到此处，或<em>点击上传</em>
          </div>
          <template #tip>
            <div class="upload-tip">
              支持 PDF、Word、Excel、图片等格式，单个文件不超过 {{ maxFileSize }}MB
            </div>
          </template>
        </el-upload>

        <div class="options-row">
          <el-form label-position="left">
            <el-form-item label="知识提取">
              <el-switch
                v-model="extractKnowledge"
                active-text="启用"
                inactive-text="禁用"
              />
              <span class="option-desc">
                启用后将使用 LLM 从文档中提取实体和关系，构建知识图谱
              </span>
            </el-form-item>
          </el-form>
        </div>

        <div class="action-row">
          <el-button
            type="primary"
            :disabled="fileList.length === 0 || uploading"
            :loading="uploading"
            size="large"
            @click="handleUpload"
          >
            {{ uploading ? '解析中...' : '开始解析' }}
          </el-button>
          <el-button size="large" @click="handleClear" :disabled="fileList.length === 0">
            清空
          </el-button>
        </div>
      </el-card>

      <el-card v-if="parseResults.length > 0" class="results-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon :size="20" color="#67C23A"><CircleCheckFilled /></el-icon>
            <span>解析结果</span>
          </div>
        </template>

        <el-tabs v-model="activeResult">
          <el-tab-pane
            v-for="result in parseResults"
            :key="result.document.document_id"
            :label="result.document.filename"
            :name="result.document.document_id"
          >
            <ResultDisplay :result="result" />
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type UploadFile, type UploadFiles } from 'element-plus'
import { api } from '@/api'
import type { DocumentParseResponse, AppConfig } from '@/types'
import ResultDisplay from '@/components/ResultDisplay.vue'

const router = useRouter()

const fileList = ref<UploadFile[]>([])
const uploading = ref(false)
const extractKnowledge = ref(true)
const parseResults = ref<DocumentParseResponse[]>([])
const activeResult = ref('')
const acceptTypes = ref('')
const maxFileSize = ref(50)

onMounted(async () => {
  try {
    const config: AppConfig = await api.getConfig()
    acceptTypes.value = config.allowed_extensions.map((ext) => `.${ext}`).join(',')
    maxFileSize.value = config.max_file_size_mb
  } catch (e) {
    acceptTypes.value = '.pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.bmp,.tiff'
  }
})

const handleFileChange = (_file: UploadFile, files: UploadFiles) => {
  fileList.value = files
}

const handleFileRemove = (_file: UploadFile, files: UploadFiles) => {
  fileList.value = files
}

const handleUpload = async () => {
  if (fileList.value.length === 0) return

  uploading.value = true
  const results: DocumentParseResponse[] = []

  try {
    for (const file of fileList.value) {
      if (!file.raw) continue

      try {
        const result = await api.uploadDocument(file.raw, extractKnowledge.value)
        results.push(result)
        ElMessage.success(`${file.name} 解析成功`)
      } catch (error: any) {
        ElMessage.error(`${file.name} 解析失败: ${error.message || '未知错误'}`)
      }
    }

    parseResults.value = results
    if (results.length > 0) {
      activeResult.value = results[0].document.document_id
    }
  } finally {
    uploading.value = false
  }
}

const handleClear = () => {
  fileList.value = []
  parseResults.value = []
  activeResult.value = ''
}
</script>

<style lang="scss" scoped>
.upload-page {
  .upload-card {
    margin-bottom: 24px;

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }

    .upload-area {
      :deep(.el-upload-dragger) {
        padding: 48px 24px;
      }

      .upload-icon {
        font-size: 64px;
        color: #409EFF;
        margin-bottom: 16px;
      }

      .upload-text {
        font-size: 16px;
        color: #606266;
        margin-bottom: 8px;

        em {
          color: #409EFF;
          font-style: normal;
        }
      }

      .upload-tip {
        font-size: 13px;
        color: #909399;
      }
    }

    .options-row {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #ebeef5;

      .option-desc {
        font-size: 13px;
        color: #909399;
        margin-left: 12px;
      }
    }

    .action-row {
      margin-top: 24px;
      display: flex;
      gap: 12px;
    }
  }

  .results-card {
    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }
  }
}
</style>
