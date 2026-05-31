<template>
  <div class="document-detail-page">
    <div class="page-container">
      <div class="page-header">
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2 class="page-title">文档详情</h2>
      </div>

      <div v-if="loading" class="loading-container">
        <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
        <p>加载中...</p>
      </div>

      <ResultDisplay v-else-if="result" :result="result" />

      <el-empty v-else description="文档不存在" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import type { DocumentParseResponse } from '@/types'
import ResultDisplay from '@/components/ResultDisplay.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const result = ref<DocumentParseResponse | null>(null)

const fetchDocument = async () => {
  const documentId = route.params.id as string
  if (!documentId) return

  loading.value = true
  try {
    result.value = await api.getDocument(documentId)
  } catch (error) {
    ElMessage.error('获取文档详情失败')
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.back()
}

onMounted(() => {
  fetchDocument()
})
</script>

<style lang="scss" scoped>
.document-detail-page {
  .page-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;

    .page-title {
      margin: 0;
    }
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px;
    color: #909399;

    .loading-icon {
      animation: rotate 1s linear infinite;
      margin-bottom: 16px;
    }
  }

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
}
</style>
