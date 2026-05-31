<template>
  <div class="result-display">
    <el-descriptions :column="2" border class="info-section">
      <el-descriptions-item label="文件名">
        {{ result.document.filename }}
      </el-descriptions-item>
      <el-descriptions-item label="文件类型">
        <el-tag :type="getFileTypeTag(result.document.file_type)">
          {{ result.document.file_type.toUpperCase() }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="文件大小">
        {{ formatFileSize(result.document.file_size) }}
      </el-descriptions-item>
      <el-descriptions-item label="上传时间">
        {{ formatDate(result.document.upload_time) }}
      </el-descriptions-item>
      <el-descriptions-item v-if="result.document.title" label="标题">
        {{ result.document.title }}
      </el-descriptions-item>
      <el-descriptions-item v-if="result.document.author" label="作者">
        {{ result.document.author }}
      </el-descriptions-item>
      <el-descriptions-item v-if="result.document.page_count" label="页数">
        {{ result.document.page_count }} 页
      </el-descriptions-item>
      <el-descriptions-item label="文档ID">
        <span class="doc-id">{{ result.document.document_id }}</span>
      </el-descriptions-item>
    </el-descriptions>

    <el-tabs v-model="activeTab" class="content-tabs">
      <el-tab-pane label="文本内容" name="text">
        <div class="text-content">
          <pre>{{ result.text_content || '无文本内容' }}</pre>
        </div>
      </el-tab-pane>

      <el-tab-pane label="表格数据" name="tables">
        <div v-if="result.tables.length === 0" class="empty-state">
          <el-empty description="无表格数据" />
        </div>
        <div v-else class="tables-container">
          <el-collapse v-model="activeTables">
            <el-collapse-item
              v-for="(table, index) in result.tables"
              :key="index"
              :name="index"
            >
              <template #title>
                <div class="table-title">
                  <el-icon><Grid /></el-icon>
                  <span>
                    表格 {{ index + 1 }}
                    <span v-if="table.sheet_name" class="sheet-name">({{ table.sheet_name }})</span>
                    <span v-if="table.page_number" class="page-info">第 {{ table.page_number }} 页</span>
                  </span>
                  <el-tag size="small" type="info">
                    {{ table.rows.length }} 行 × {{ table.headers.length }} 列
                  </el-tag>
                </div>
              </template>
              <div class="table-wrapper">
                <el-table :data="table.rows" border size="small" max-height="400">
                  <el-table-column
                    v-for="(header, colIndex) in table.headers"
                    :key="colIndex"
                    :label="header"
                    :prop="String(colIndex)"
                    min-width="120"
                  >
                    <template #default="{ row }">
                      {{ row[colIndex] }}
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-tab-pane>

      <el-tab-pane label="图片" name="images">
        <div v-if="result.images.length === 0" class="empty-state">
          <el-empty description="无图片数据" />
        </div>
        <div v-else class="images-grid">
          <div v-for="image in result.images" :key="image.image_id" class="image-item">
            <el-image
              :src="getImageUrl(image.file_path)"
              :preview-src-list="[getImageUrl(image.file_path)]"
              fit="cover"
              class="preview-image"
            />
            <div class="image-info">
              <div class="image-dimensions" v-if="image.width && image.height">
                {{ image.width }} × {{ image.height }}
              </div>
              <div v-if="image.extracted_text" class="ocr-text">
                <strong>OCR 文本:</strong>
                <p class="text-ellipsis">{{ image.extracted_text }}</p>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="知识图谱" name="graph">
        <div v-if="!result.knowledge_graph" class="empty-state">
          <el-empty description="未生成知识图谱" />
        </div>
        <div v-else class="graph-section">
          <div class="graph-stats">
            <el-statistic title="实体数量" :value="result.knowledge_graph.entities.length" />
            <el-statistic title="关系数量" :value="result.knowledge_graph.relations.length" />
          </div>
          <GraphVisualizer
            :entities="result.knowledge_graph.entities"
            :relations="result.knowledge_graph.relations"
            :height="500"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DocumentParseResponse } from '@/types'
import GraphVisualizer from './GraphVisualizer.vue'

const props = defineProps<{
  result: DocumentParseResponse
}>()

const activeTab = ref('text')
const activeTables = ref<number[]>([0])

const getFileTypeTag = (type: string) => {
  const tags: Record<string, string> = {
    pdf: 'danger',
    word: 'primary',
    excel: 'success',
    image: 'warning'
  }
  return tags[type] || 'info'
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

const getImageUrl = (filePath: string) => {
  const filename = filePath.split(/[\\/]/).pop()
  return `/images/${filename}`
}
</script>

<style lang="scss" scoped>
.result-display {
  .info-section {
    margin-bottom: 24px;

    .doc-id {
      font-family: monospace;
      font-size: 12px;
      color: #909399;
    }
  }

  .content-tabs {
    :deep(.el-tabs__content) {
      padding-top: 16px;
    }

    .text-content {
      background: #f5f7fa;
      border-radius: 4px;
      padding: 16px;
      max-height: 500px;
      overflow-y: auto;

      pre {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.8;
        color: #303133;
        margin: 0;
      }
    }

    .empty-state {
      padding: 48px 0;
    }

    .tables-container {
      .table-title {
        display: flex;
        align-items: center;
        gap: 8px;

        .sheet-name {
          color: #409EFF;
          margin-left: 4px;
        }

        .page-info {
          color: #909399;
          margin-left: 4px;
        }
      }

      .table-wrapper {
        margin-top: 12px;
      }
    }

    .images-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 16px;

      .image-item {
        border: 1px solid #ebeef5;
        border-radius: 4px;
        overflow: hidden;

        .preview-image {
          width: 100%;
          height: 180px;
        }

        .image-info {
          padding: 12px;
          background: #fafafa;

          .image-dimensions {
            font-size: 12px;
            color: #909399;
            margin-bottom: 8px;
          }

          .ocr-text {
            font-size: 12px;

            p {
              margin: 4px 0 0 0;
              color: #606266;
            }
          }
        }
      }
    }

    .graph-section {
      .graph-stats {
        display: flex;
        gap: 48px;
        margin-bottom: 24px;
      }
    }
  }
}
</style>
