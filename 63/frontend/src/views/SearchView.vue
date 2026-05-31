<template>
  <div class="search-view">
    <el-card class="search-header">
      <div class="search-title">
        <el-icon :size="28" color="#409EFF"><Search /></el-icon>
        <h2>跨库文献检索</h2>
      </div>
      
      <el-form :inline="true" class="search-form" @submit.prevent="handleSearch">
        <el-form-item>
          <el-input
            v-model="searchQuery"
            placeholder="输入关键词、作者、标题或DOI..."
            class="search-input"
            clearable
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        
        <el-form-item>
          <el-select v-model="selectedLibraries" multiple placeholder="选择文库" class="library-select">
            <el-option
              v-for="lib in libraries"
              :key="lib.id"
              :label="lib.name"
              :value="lib.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item>
          <el-select v-model="sortBy" placeholder="排序方式" class="sort-select">
            <el-option label="相关度" value="relevance" />
            <el-option label="被引量" value="citations" />
            <el-option label="最新发表" value="year" />
          </el-select>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" :icon="Search" :loading="isSearching" @click="handleSearch">
            检索
          </el-button>
          <el-button :icon="RefreshRight" @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="search-history" v-if="searchHistory.length > 0">
        <span class="history-label">搜索历史:</span>
        <el-tag
          v-for="(item, index) in searchHistory.slice(0, 5)"
          :key="index"
          class="history-tag"
          @click="searchByHistory(item)"
        >
          {{ item }}
        </el-tag>
      </div>
    </el-card>

    <el-row :gutter="20" class="search-results">
      <el-col :span="16">
        <el-card v-loading="isSearching" class="results-card">
          <template #header>
            <div class="results-header">
              <span>检索结果</span>
              <el-tag v-if="searchResults.length > 0" type="info">
                共 {{ searchResults.length }} 条
              </el-tag>
            </div>
          </template>

          <el-empty v-if="searchResults.length === 0 && !isSearching" description="暂无搜索结果，请尝试其他关键词">
            <el-button type="primary" @click="$router.push('/citation')">手动添加文献</el-button>
          </el-empty>

          <div v-else class="literature-list">
            <div
              v-for="(item, index) in searchResults"
              :key="item.id"
              class="literature-item"
              :class="{ 'selected': selectedItem?.id === item.id }"
              @click="selectLiterature(item)"
            >
              <div class="item-header">
                <span class="item-index">{{ index + 1 }}</span>
                <h3 class="item-title">{{ item.title }}</h3>
                <el-tag
                  v-if="item.weight"
                  :type="getWeightTagType(item.weight.totalScore)"
                  size="small"
                >
                  {{ item.weight.level?.level || 'N/A' }}
                </el-tag>
              </div>

              <div class="item-authors">
                <el-icon><User /></el-icon>
                <span>{{ formatAuthors(item.authors) }}</span>
              </div>

              <div class="item-meta">
                <el-tag size="small" type="success">{{ item.journal }}</el-tag>
                <el-tag size="small" type="info">{{ item.year }}</el-tag>
                <el-tag size="small" v-if="item.citationCount">
                  <el-icon><TrendCharts /></el-icon>
                  {{ formatNumber(item.citationCount) }} 引用
                </el-tag>
                <el-tag size="small" v-if="item.sources?.length > 1" type="warning">
                  多库匹配
                </el-tag>
              </div>

              <p class="item-abstract">{{ truncateText(item.abstract, 150) }}</p>

              <div class="item-keywords" v-if="item.keywords?.length">
                <el-tag
                  v-for="kw in item.keywords.slice(0, 5)"
                  :key="kw"
                  size="small"
                  class="keyword-tag"
                >
                  {{ kw }}
                </el-tag>
              </div>

              <div class="item-actions">
                <el-button size="small" type="primary" :icon="Plus" @click.stop="addToCitation(item)">
                  添加引用
                </el-button>
                <el-button size="small" :icon="Star" @click.stop="addToCollection(item)">
                  收藏
                </el-button>
                <el-button size="small" :icon="Link" @click.stop="crossMatch(item)">
                  跨库匹配
                </el-button>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card class="detail-card" v-if="selectedItem">
          <template #header>
            <div class="detail-header">
              <el-icon :size="20" color="#409EFF"><Document /></el-icon>
              <span>文献详情</span>
            </div>
          </template>

          <h3 class="detail-title">{{ selectedItem.title }}</h3>
          
          <div class="detail-authors">
            <span v-for="(author, idx) in selectedItem.authors" :key="idx" class="author-name">
              {{ author.fullName }}<span v-if="idx < selectedItem.authors.length - 1">, </span>
            </span>
          </div>

          <el-divider />

          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="期刊">{{ selectedItem.journal }}</el-descriptions-item>
            <el-descriptions-item label="发表年份">{{ selectedItem.year }}</el-descriptions-item>
            <el-descriptions-item label="卷期">
              {{ selectedItem.volume }}({{ selectedItem.issue }})
            </el-descriptions-item>
            <el-descriptions-item label="页码">{{ selectedItem.pages }}</el-descriptions-item>
            <el-descriptions-item label="DOI" v-if="selectedItem.doi">
              <el-link type="primary" :href="`https://doi.org/${selectedItem.doi}`" target="_blank">
                {{ selectedItem.doi }}
              </el-link>
            </el-descriptions-item>
            <el-descriptions-item label="被引量" v-if="selectedItem.citationCount">
              {{ formatNumber(selectedItem.citationCount) }}
            </el-descriptions-item>
            <el-descriptions-item label="来源库">
              <el-tag
                v-for="src in selectedItem.sources || [selectedItem.source]"
                :key="src"
                size="small"
                style="margin-right: 5px"
              >
                {{ src }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <div class="weight-section" v-if="selectedItem.weight">
            <h4>学术价值评估</h4>
            <el-progress
              :percentage="selectedItem.weight.totalScore"
              :color="selectedItem.weight.level?.color"
              :stroke-width="12"
            />
            <div class="weight-breakdown">
              <div v-for="(score, key) in selectedItem.weight.breakdown" :key="key" class="weight-item">
                <span>{{ getWeightLabel(key) }}</span>
                <el-progress :percentage="score" :show-text="false" :stroke-width="6" />
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <el-button type="primary" :icon="Plus" @click="addToCitation(selectedItem)">
              添加到引用列表
            </el-button>
            <el-button :icon="View" @click="viewFullText(selectedItem)">
              查看原文
            </el-button>
          </div>
        </el-card>

        <el-card class="quick-stats" v-else>
          <template #header>
            <span>检索说明</span>
          </template>
          <div class="stats-content">
            <el-steps direction="vertical" :active="0">
              <el-step title="输入检索关键词" description="支持标题、作者、DOI、关键词等" />
              <el-step title="选择检索文库" description="可同时选择多个文献数据库" />
              <el-step title="查看检索结果" description="按学术价值智能排序" />
              <el-step title="添加引用或收藏" description="一键生成标准引文格式" />
            </el-steps>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Search, RefreshRight, User, TrendCharts, Plus, Star, Link, Document, View
} from '@element-plus/icons-vue';
import { crawlerApi, userApi, literatureApi } from '@/api';
import { useLiteratureStore, useUserStore } from '@/store/literature';
import { formatAuthors, formatNumber, truncateText } from '@/utils/format';

const router = useRouter();
const literatureStore = useLiteratureStore();
const userStore = useUserStore();

const searchQuery = ref('');
const selectedLibraries = ref([]);
const sortBy = ref('relevance');
const isSearching = ref(false);
const libraries = ref([]);
const selectedItem = ref(null);

const searchResults = computed(() => literatureStore.searchResults);
const searchHistory = computed(() => literatureStore.searchHistory);

onMounted(async () => {
  try {
    const res = await crawlerApi.getLibraries();
    libraries.value = res.data;
    selectedLibraries.value = libraries.value.map(l => l.id);
  } catch (e) {
    console.error('获取文库列表失败', e);
  }
});

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    ElMessage.warning('请输入检索关键词');
    return;
  }

  isSearching.value = true;
  literatureStore.setLoading(true);
  literatureStore.addSearchHistory(searchQuery.value.trim());

  try {
    const res = await crawlerApi.search({
      query: searchQuery.value.trim(),
      libraries: selectedLibraries.value,
      sortBy: sortBy.value,
      limit: 20
    });

    const results = res.results || [];
    
    const resultsWithWeight = await Promise.all(
      results.map(async (item) => {
        try {
          const weightRes = await literatureApi.calculateWeight({
            literature: item,
            context: { query: searchQuery.value }
          });
          return { ...item, weight: weightRes.data };
        } catch {
          return item;
        }
      })
    );

    literatureStore.setSearchResults(resultsWithWeight);
  } catch (e) {
    console.error('检索失败', e);
  } finally {
    isSearching.value = false;
    literatureStore.setLoading(false);
  }
}

function resetSearch() {
  searchQuery.value = '';
  sortBy.value = 'relevance';
  selectedLibraries.value = libraries.value.map(l => l.id);
  selectedItem.value = null;
  literatureStore.clearSearch();
}

function searchByHistory(query) {
  searchQuery.value = query;
  handleSearch();
}

function selectLiterature(item) {
  selectedItem.value = item;
  literatureStore.selectLiterature(item);
}

function addToCitation(item) {
  literatureStore.addToCitation(item);
  ElMessage.success('已添加到引用列表');
}

async function addToCollection(item) {
  try {
    await userApi.addToCollection(userStore.userId, { literature: item });
    userStore.addToCollection(item);
    ElMessage.success('收藏成功');
  } catch (e) {
    ElMessage.error('收藏失败');
  }
}

async function crossMatch(item) {
  try {
    const res = await crawlerApi.crossMatch({ literature: item });
    if (res.data?.totalMatches > 0) {
      ElMessage.success(`找到 ${res.data.totalMatches} 个跨库匹配结果`);
      console.log('跨库匹配结果:', res.data);
    } else {
      ElMessage.info('未找到其他文库的匹配结果');
    }
  } catch (e) {
    ElMessage.error('跨库匹配失败');
  }
}

function viewFullText(item) {
  const url = item.sourceUrl || (item.doi && `https://doi.org/${item.doi}`);
  if (url) {
    window.open(url, '_blank');
  } else {
    ElMessage.info('暂无原文链接');
  }
}

function getWeightTagType(score) {
  if (score >= 80) return 'danger';
  if (score >= 60) return 'warning';
  if (score >= 40) return 'success';
  return 'info';
}

function getWeightLabel(key) {
  const labels = {
    journalImpactFactor: '期刊影响',
    citationCount: '引用情况',
    recency: '时效性',
    authorHIndex: '作者影响力',
    venueQuality: '发表平台',
    relevance: '相关度'
  };
  return labels[key] || key;
}
</script>

<style scoped>
.search-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-header {
  margin-bottom: 20px;
}

.search-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.search-title h2 {
  margin: 0;
  font-size: 22px;
}

.search-form {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  width: 400px;
}

.library-select {
  width: 200px;
}

.sort-select {
  width: 140px;
}

.search-history {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.history-label {
  color: #909399;
  font-size: 13px;
}

.history-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.history-tag:hover {
  transform: translateY(-1px);
}

.results-card {
  min-height: 500px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.literature-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.literature-item {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.literature-item:hover,
.literature-item.selected {
  border-color: #409EFF;
  background: #ecf5ff;
}

.item-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.item-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #f0f2f5;
  border-radius: 50%;
  font-size: 12px;
  color: #606266;
  flex-shrink: 0;
}

.item-title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  line-height: 1.5;
}

.item-authors {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
  font-size: 13px;
  margin-bottom: 8px;
}

.item-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.item-abstract {
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 10px;
}

.item-keywords {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.keyword-tag {
  background: #f0f9eb;
  border-color: #e1f3d8;
  color: #67c23a;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.detail-card {
  position: sticky;
  top: 20px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-title {
  font-size: 18px;
  margin: 0 0 12px;
  line-height: 1.5;
}

.detail-authors {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
}

.author-name {
  color: #409EFF;
}

.weight-section {
  margin-top: 16px;
}

.weight-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
}

.weight-breakdown {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weight-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #606266;
}

.weight-item span {
  width: 70px;
  flex-shrink: 0;
}

.weight-item .el-progress {
  flex: 1;
}

.detail-actions {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}

.quick-stats .stats-content {
  padding: 20px 0;
}
</style>
