<template>
  <div class="graph-page">
    <div class="page-container">
      <h2 class="page-title">知识图谱搜索</h2>

      <el-card class="search-card" shadow="never">
        <el-form :inline="true" :model="searchForm">
          <el-form-item label="搜索关键词">
            <el-input
              v-model="searchForm.query"
              placeholder="输入实体名称或描述..."
              clearable
              style="width: 300px"
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item label="实体类型">
            <el-select
              v-model="searchForm.entity_types"
              multiple
              placeholder="选择实体类型"
              clearable
              style="width: 200px"
            >
              <el-option
                v-for="type in entityTypes"
                :key="type"
                :label="type"
                :value="type"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="关系类型">
            <el-select
              v-model="searchForm.relation_types"
              multiple
              placeholder="选择关系类型"
              clearable
              style="width: 200px"
            >
              <el-option
                v-for="type in relationTypes"
                :key="type"
                :label="type"
                :value="type"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="搜索深度">
            <el-slider
              v-model="searchForm.max_depth"
              :min="1"
              :max="5"
              :step="1"
              show-input
              style="width: 150px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch" :loading="loading">
              搜索
            </el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-row :gutter="24" class="content-row">
        <el-col :span="16">
          <el-card class="graph-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon :size="20" color="#409EFF"><Share /></el-icon>
                <span>图谱可视化</span>
              </div>
            </template>
            <div v-if="loading" class="loading-container">
              <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
              <p>搜索中...</p>
            </div>
            <GraphVisualizer
              v-else-if="graphData.entities.length > 0"
              :entities="graphData.entities"
              :relations="graphData.relations"
              :height="600"
            />
            <el-empty v-else description="暂无图谱数据，请先上传文档并提取知识" />
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="entity-list-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon :size="20" color="#67C23A"><User /></el-icon>
                <span>实体列表 ({{ graphData.entities.length }})</span>
              </div>
            </template>
            <div class="entity-list" v-loading="loading">
              <div
                v-for="entity in graphData.entities"
                :key="entity.entity_id"
                class="entity-item"
              >
                <div class="entity-header">
                  <el-tag :color="getEntityColor(entity.type)" size="small">
                    {{ entity.type }}
                  </el-tag>
                  <span class="entity-name">{{ entity.name }}</span>
                </div>
                <p v-if="entity.description" class="entity-desc">
                  {{ entity.description }}
                </p>
              </div>
              <el-empty v-if="graphData.entities.length === 0 && !loading" description="暂无实体" />
            </div>
          </el-card>

          <el-card class="relation-list-card" shadow="never" style="margin-top: 24px">
            <template #header>
              <div class="card-header">
                <el-icon :size="20" color="#E6A23C"><Connection /></el-icon>
                <span>关系列表 ({{ graphData.relations.length }})</span>
              </div>
            </template>
            <div class="relation-list" v-loading="loading">
              <div
                v-for="relation in graphData.relations"
                :key="relation.relation_id"
                class="relation-item"
              >
                <div class="relation-path">
                  <span class="relation-node">{{ getEntityName(relation.source_id) }}</span>
                  <el-icon class="relation-arrow"><ArrowRight /></el-icon>
                  <el-tag type="info" size="small" class="relation-type">
                    {{ relation.type }}
                  </el-tag>
                  <el-icon class="relation-arrow"><ArrowRight /></el-icon>
                  <span class="relation-node">{{ getEntityName(relation.target_id) }}</span>
                </div>
              </div>
              <el-empty v-if="graphData.relations.length === 0 && !loading" description="暂无关系" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import type { Entity, Relation, GraphSearchResponse } from '@/types'
import GraphVisualizer from '@/components/GraphVisualizer.vue'

const loading = ref(false)
const entityTypes = ref<string[]>([])
const relationTypes = ref<string[]>([])

const searchForm = reactive({
  query: '',
  entity_types: [] as string[],
  relation_types: [] as string[],
  max_depth: 2,
  limit: 100
})

const graphData = reactive<GraphSearchResponse>({
  entities: [] as Entity[],
  relations: [] as Relation[],
  paths: [] as string[][]
})

const entityNameMap = ref<Record<string, string>>({})

const getEntityColor = (type: string) => {
  const colors: Record<string, string> = {
    PERSON: '#67C23A',
    ORGANIZATION: '#409EFF',
    LOCATION: '#E6A23C',
    TIME: '#F56C6C',
    EVENT: '#909399',
    PRODUCT: '#9B59B6',
    TECHNOLOGY: '#1ABC9C',
    CONCEPT: '#34495E',
    PROJECT: '#E74C3C',
    DOCUMENT: '#16A085'
  }
  return colors[type] || '#909399'
}

const getEntityName = (entityId: string) => {
  return entityNameMap.value[entityId] || entityId
}

const fetchTypes = async () => {
  try {
    const [entTypes, relTypes] = await Promise.all([
      api.getEntityTypes(),
      api.getRelationTypes()
    ])
    entityTypes.value = entTypes
    relationTypes.value = relTypes
  } catch (error) {
    console.error('获取类型失败', error)
  }
}

const handleSearch = async () => {
  loading.value = true
  try {
    const result = await api.searchGraph(searchForm)
    graphData.entities = result.entities
    graphData.relations = result.relations
    graphData.paths = result.paths

    entityNameMap.value = {}
    result.entities.forEach((e: Entity) => {
      entityNameMap.value[e.entity_id] = e.name
    })

    ElMessage.success(`找到 ${result.entities.length} 个实体，${result.relations.length} 条关系`)
  } catch (error) {
    ElMessage.error('搜索失败')
  } finally {
    loading.value = false
  }
}

const handleReset = () => {
  searchForm.query = ''
  searchForm.entity_types = []
  searchForm.relation_types = []
  searchForm.max_depth = 2
  graphData.entities = []
  graphData.relations = []
  graphData.paths = []
  entityNameMap.value = {}
}

onMounted(() => {
  fetchTypes()
})
</script>

<style lang="scss" scoped>
.graph-page {
  .search-card {
    margin-bottom: 24px;
  }

  .content-row {
    .graph-card {
      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
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
    }

    .entity-list-card,
    .relation-list-card {
      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }

      .entity-list,
      .relation-list {
        max-height: 300px;
        overflow-y: auto;

        .entity-item {
          padding: 12px;
          border-bottom: 1px solid #f0f0f0;

          &:last-child {
            border-bottom: none;
          }

          .entity-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;

            .entity-name {
              font-weight: 500;
              color: #303133;
            }
          }

          .entity-desc {
            font-size: 12px;
            color: #909399;
            margin: 0;
          }
        }

        .relation-item {
          padding: 12px;
          border-bottom: 1px solid #f0f0f0;

          &:last-child {
            border-bottom: none;
          }

          .relation-path {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;

            .relation-node {
              font-weight: 500;
              color: #409EFF;
            }

            .relation-arrow {
              color: #c0c4cc;
            }

            .relation-type {
              margin: 0 4px;
            }
          }
        }
      }
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
