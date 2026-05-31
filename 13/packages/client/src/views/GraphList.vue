<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiService } from '@/services/api';

interface GraphInfo {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  edgeCount: number;
  version: number;
  operationCount: number;
  updatedAt: Date;
}

const router = useRouter();

const graphs = ref<GraphInfo[]>([]);
const isLoading = ref(false);
const newGraphName = ref('');
const newGraphDescription = ref('');

async function loadGraphs(): Promise<void> {
  isLoading.value = true;
  try {
    graphs.value = await apiService.listGraphs();
  } catch (error) {
    console.error('Failed to load graphs:', error);
  } finally {
    isLoading.value = false;
  }
}

async function createGraph(): Promise<void> {
  if (!newGraphName.value.trim()) {
    alert('请输入图名称');
    return;
  }

  try {
    const result = await apiService.createGraph({
      name: newGraphName.value.trim(),
      description: newGraphDescription.value.trim() || undefined,
    });
    newGraphName.value = '';
    newGraphDescription.value = '';
    await loadGraphs();
    router.push(`/graph/${result.id}`);
  } catch (error) {
    console.error('Failed to create graph:', error);
    alert('创建图失败');
  }
}

async function deleteGraph(graphId: string, event: Event): Promise<void> {
  event.stopPropagation();
  if (!confirm('确定要删除这个图吗？')) {
    return;
  }

  try {
    await apiService.deleteGraph(graphId);
    await loadGraphs();
  } catch (error) {
    console.error('Failed to delete graph:', error);
    alert('删除图失败');
  }
}

function openGraph(graphId: string): void {
  router.push(`/graph/${graphId}`);
}

onMounted(() => {
  loadGraphs();
});
</script>

<template>
  <div class="graph-list">
    <div class="header">
      <h1>Collaborative Graph Editor</h1>
      <p class="subtitle">多人实时协作编辑知识图谱</p>
    </div>

    <div class="content">
      <div class="create-section card">
        <h2>创建新图</h2>
        <div class="form">
          <input
            v-model="newGraphName"
            type="text"
            placeholder="输入图名称"
            @keyup.enter="createGraph"
          />
          <textarea
            v-model="newGraphDescription"
            placeholder="输入图描述（可选）"
            rows="2"
          ></textarea>
          <button class="btn btn-primary" @click="createGraph">
            创建图
          </button>
        </div>
      </div>

      <div class="list-section">
        <h2>已有的图</h2>
        <div v-if="isLoading" class="loading">加载中...</div>
        <div v-else-if="graphs.length === 0" class="empty">
          暂无图，创建一个新图开始吧！
        </div>
        <div v-else class="graph-cards">
          <div
            v-for="graph in graphs"
            :key="graph.id"
            class="graph-card card"
            @click="openGraph(graph.id)"
          >
            <div class="graph-header">
              <h3>{{ graph.name }}</h3>
              <button class="btn btn-danger btn-sm" @click="deleteGraph(graph.id, $event)">
                删除
              </button>
            </div>
            <p v-if="graph.description" class="description">
              {{ graph.description }}
            </p>
            <div class="stats">
              <span>节点: {{ graph.nodeCount }}</span>
              <span>边: {{ graph.edgeCount }}</span>
              <span>版本: {{ graph.version }}</span>
              <span>操作数: {{ graph.operationCount }}</span>
            </div>
            <div class="updated">
              更新于: {{ new Date(graph.updatedAt).toLocaleString() }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-list {
  padding: 40px;
  height: 100vh;
  overflow-y: auto;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.header h1 {
  font-size: 2.5rem;
  color: #00bcd4;
  margin-bottom: 10px;
}

.subtitle {
  color: #666;
  font-size: 1.1rem;
}

.content {
  max-width: 1000px;
  margin: 0 auto;
}

.create-section {
  margin-bottom: 40px;
}

.create-section h2,
.list-section h2 {
  margin-bottom: 20px;
  color: #333;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form input,
.form textarea {
  width: 100%;
}

.graph-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.graph-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.graph-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.graph-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.description {
  color: #666;
  margin-bottom: 12px;
  font-size: 0.9rem;
}

.stats {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 0.85rem;
  color: #888;
}

.updated {
  font-size: 0.8rem;
  color: #999;
}

.loading,
.empty {
  text-align: center;
  padding: 40px;
  color: #888;
}
</style>
