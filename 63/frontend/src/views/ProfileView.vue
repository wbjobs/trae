<template>
  <div class="profile-view">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="profile-card">
          <div class="profile-header">
            <el-avatar :size="100" class="avatar">
              {{ profile?.name?.charAt(0) || 'U' }}
            </el-avatar>
            <h2 class="user-name">{{ profile?.name || '未登录' }}</h2>
            <p class="user-affiliation">{{ profile?.affiliation }}</p>
            <div class="user-fields">
              <el-tag
                v-for="field in profile?.researchFields || []"
                :key="field"
                size="small"
                class="field-tag"
              >
                {{ field }}
              </el-tag>
            </div>
          </div>

          <el-divider />

          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">{{ statistics?.hIndex || 0 }}</div>
              <div class="stat-label">H指数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ formatNumber(statistics?.totalCitations) }}</div>
              <div class="stat-label">总引用</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ statistics?.publicationCount || 0 }}</div>
              <div class="stat-label">发文量</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ statistics?.totalCollected || 0 }}</div>
              <div class="stat-label">收藏数</div>
            </div>
          </div>

          <el-divider />

          <div class="profile-actions">
            <el-button type="primary" :icon="Refresh" :loading="isSyncing" @click="syncProfile">
              同步学术档案
            </el-button>
            <el-button :icon="Edit" @click="showEditDialog = true">
              编辑资料
            </el-button>
          </div>

          <div v-if="profile?.lastSyncAt" class="sync-info">
            <el-icon><Clock /></el-icon>
            <span>上次同步: {{ formatDate(profile.lastSyncAt) }}</span>
          </div>
        </el-card>

        <el-card class="social-card">
          <template #header>
            <div class="card-header">
              <el-icon :size="18" color="#409EFF"><Link /></el-icon>
              <span>学术主页</span>
            </div>
          </template>

          <div class="social-links">
            <div class="link-item" v-if="profile?.orcid">
              <el-icon color="#A6CE39"><User /></el-icon>
              <span>ORCID</span>
              <el-link :href="`https://orcid.org/${profile.orcid}`" target="_blank">
                {{ profile.orcid }}
              </el-link>
            </div>
            <div class="link-item" v-if="profile?.socialLinks?.googleScholar">
              <el-icon color="#4285F4"><School /></el-icon>
              <span>Google Scholar</span>
              <el-link :href="profile.socialLinks.googleScholar" target="_blank">
                查看主页
              </el-link>
            </div>
            <div class="link-item" v-if="profile?.socialLinks?.github">
              <el-icon color="#333"><Avatar /></el-icon>
              <span>GitHub</span>
              <el-link :href="profile.socialLinks.github" target="_blank">
                查看主页
              </el-link>
            </div>
            <div class="link-item" v-if="profile?.socialLinks?.researchGate">
              <el-icon color="#00CCBB"><Reading /></el-icon>
              <span>ResearchGate</span>
              <el-link :href="profile.socialLinks.researchGate" target="_blank">
                查看主页
              </el-link>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card class="stats-card">
          <template #header>
            <div class="card-header">
              <el-icon :size="18" color="#67C23A"><DataLine /></el-icon>
              <span>学术统计</span>
            </div>
          </template>

          <el-row :gutter="20">
            <el-col :span="12">
              <div class="chart-section">
                <h4>年度发文分布</h4>
                <div class="year-chart">
                  <div
                    v-for="item in yearDistribution"
                    :key="item.year"
                    class="year-bar"
                  >
                    <span class="year-label">{{ item.year }}</span>
                    <div class="bar-wrapper">
                      <div
                        class="bar-fill"
                        :style="{ width: `${(item.count / maxYearCount) * 100}%` }"
                      />
                    </div>
                    <span class="year-count">{{ item.count }}</span>
                  </div>
                </div>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="chart-section">
                <h4>研究方向分布</h4>
                <div class="keywords-chart">
                  <div
                    v-for="item in topKeywords.slice(0, 8)"
                    :key="item.name"
                    class="keyword-bar"
                  >
                    <span class="kw-name">{{ item.name }}</span>
                    <div class="bar-wrapper">
                      <div
                        class="bar-fill kw"
                        :style="{ width: `${(item.count / maxKeywordCount) * 100}%` }"
                      />
                    </div>
                    <span class="kw-count">{{ item.count }}</span>
                  </div>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <el-card class="tags-card" v-if="collection.length > 0">
          <template #header>
            <div class="card-header">
              <el-icon :size="18" color="#909399"><CollectionTag /></el-icon>
              <span>标签管理</span>
              <el-tag type="success" size="small">{{ tagsStore.allTags.length }} 个标签</el-tag>
              <el-button size="small" :icon="Plus" @click="showTagDialog = true">
                新建标签
              </el-button>
            </div>
          </template>

          <div class="tags-filter-bar">
            <div class="filter-tags">
              <el-tag
                :class="['filter-tag', { active: activeTagFilter === 'all' }]"
                size="small"
                effect="plain"
                @click="activeTagFilter = 'all'"
              >
                全部 ({{ collection.length }})
              </el-tag>
              <el-tag
                v-for="tag in tagsStore.getTagsStats"
                :key="tag.id"
                :class="['filter-tag', { active: activeTagFilter === tag.id }]"
                size="small"
                effect="plain"
                :style="{ '--tag-color': tag.color }"
                @click="activeTagFilter = tag.id"
              >
                {{ tag.name }} ({{ tag.usageCount }})
              </el-tag>
            </div>

            <div class="batch-actions" v-if="filteredCollection.length > 0">
              <el-button size="small" :icon="Price" @click="showBatchTagDialog = true">
                批量标签
              </el-button>
              <el-button size="small" type="primary" v-if="selectedLiteratureIds.length > 0">
                已选 {{ selectedLiteratureIds.length }} 项
              </el-button>
            </div>
          </div>

          <div class="tags-management" v-if="tagsStore.customTags.length > 0">
            <h5 class="section-title">自定义标签</h5>
            <div class="custom-tags-list">
              <div
                v-for="tag in tagsStore.customTags"
                :key="tag.id"
                class="custom-tag-item"
              >
                <el-tag
                  :style="{ backgroundColor: tag.color, borderColor: tag.color }"
                  size="small"
                  effect="dark"
                >
                  {{ tag.name }}
                </el-tag>
                <span class="tag-usage">
                  {{ tagsStore.getTagUsageCount(tag.id) }} 篇文献
                </span>
                <div class="tag-actions">
                  <el-button
                    size="small"
                    type="danger"
                    link
                    @click="deleteTag(tag.id)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <el-card class="collection-card">
          <template #header>
            <div class="card-header">
              <el-icon :size="18" color="#E6A23C"><Star /></el-icon>
              <span>我的收藏</span>
              <el-tag type="info">{{ filteredCollection.length }} / {{ collection.length }} 篇</el-tag>
            </div>
          </template>

          <el-empty v-if="filteredCollection.length === 0" description="暂无符合条件的文献">
            <el-button type="primary" @click="activeTagFilter = 'all'">查看全部</el-button>
          </el-empty>

          <div v-else class="collection-list">
            <div
              v-for="item in filteredCollection"
              :key="item.id"
              :class="['collection-item', { selected: selectedLiteratureIds.includes(item.id) }]"
            >
              <div class="item-select">
                <el-checkbox
                  :model-value="selectedLiteratureIds.includes(item.id)"
                  @change="(val) => toggleSelection(item.id, val)"
                />
              </div>
              
              <div class="item-info">
                <h4 class="item-title">{{ item.title }}</h4>
                <p class="item-authors">{{ formatAuthors(item.authors, 3) }}</p>
                <div class="item-meta">
                  <el-tag size="small">{{ item.journal }}</el-tag>
                  <el-tag size="small" type="info">{{ item.year }}</el-tag>
                  <span v-if="item.citationCount" class="citations">
                    {{ formatNumber(item.citationCount) }} 引用
                  </span>
                  <span class="added-time">
                    收藏于 {{ formatDate(item.addedAt) }}
                  </span>
                </div>
                
                <div class="item-tags" v-if="tagsStore.getLiteratureTags(item.id).length > 0">
                  <el-tag
                    v-for="tag in tagsStore.getLiteratureTags(item.id)"
                    :key="tag.id"
                    size="small"
                    effect="dark"
                    :style="{ backgroundColor: tag.color, borderColor: tag.color }"
                    closable
                    @close="removeTagFromLiterature(item.id, tag.id)"
                  >
                    {{ tag.name }}
                  </el-tag>
                  <el-tag
                    size="small"
                    effect="plain"
                    class="add-tag-btn"
                    @click="openTagSelector(item.id)"
                  >
                    + 添加标签
                  </el-tag>
                </div>
                
                <el-tag
                  v-else
                  size="small"
                  effect="plain"
                  class="add-tag-btn"
                  @click="openTagSelector(item.id)"
                >
                  + 添加标签
                </el-tag>
              </div>
              
              <div class="item-actions">
                <el-button
                  size="small"
                  :icon="Plus"
                  @click="addToCitation(item)"
                >
                  添加引用
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  :icon="Delete"
                  @click="removeFromCollection(item.id)"
                >
                  移除
                </el-button>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showEditDialog" title="编辑个人资料" width="500px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="姓名">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="editForm.email" />
        </el-form-item>
        <el-form-item label="机构">
          <el-input v-model="editForm.affiliation" />
        </el-form-item>
        <el-form-item label="研究方向">
          <el-select
            v-model="editForm.researchFields"
            multiple
            filterable
            allow-create
            placeholder="输入研究方向"
            style="width: 100%"
          >
            <el-option
              v-for="field in suggestedFields"
              :key="field"
              :label="field"
              :value="field"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="ORCID">
          <el-input v-model="editForm.orcid" placeholder="如: 0000-0001-2345-6789" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveProfile">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showTagDialog" title="新建标签" width="400px">
      <el-form label-width="80px">
        <el-form-item label="标签名称">
          <el-input v-model="newTagName" placeholder="输入标签名称" maxlength="20" show-word-limit />
        </el-form-item>
        <el-form-item label="标签颜色">
          <el-color-picker v-model="newTagColor" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTagDialog = false">取消</el-button>
        <el-button type="primary" @click="createNewTag" :disabled="!newTagName.trim()">
          创建
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBatchTagDialog" title="批量标签管理" width="500px">
      <el-alert
        v-if="selectedLiteratureIds.length === 0"
        title="请先选择要操作的文献"
        type="warning"
        show-icon
        :closable="false"
        style="margin-bottom: 16px"
      />
      
      <div class="batch-tag-content">
        <div class="batch-info">
          <el-tag type="info">已选择 {{ selectedLiteratureIds.length }} 篇文献</el-tag>
        </div>
        
        <h4>选择要添加的标签</h4>
        <div class="tag-selector">
          <el-tag
            v-for="tag in tagsStore.allTags"
            :key="tag.id"
            :class="['selectable-tag', { selected: selectedTagIds.includes(tag.id) }]"
            :style="{ backgroundColor: selectedTagIds.includes(tag.id) ? tag.color : 'transparent', borderColor: tag.color }"
            size="small"
            @click="toggleTagSelection(tag.id)"
          >
            {{ tag.name }}
          </el-tag>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="showBatchTagDialog = false; selectedTagIds = []">取消</el-button>
        <el-button
          type="primary"
          :disabled="selectedLiteratureIds.length === 0 || selectedTagIds.length === 0"
          @click="applyBatchTags"
        >
          应用标签
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Refresh, Edit, Clock, Link, User, School, Avatar, Reading,
  DataLine, Star, Plus, Delete, Tag, Price,
  MoreFilled, CollectionTag
} from '@element-plus/icons-vue';
import { userApi } from '@/api';
import { useUserStore, useLiteratureStore } from '@/store/literature';
import { useTagsStore } from '@/store/tags';
import { formatAuthors, formatNumber, formatDate } from '@/utils/format';

const userStore = useUserStore();
const literatureStore = useLiteratureStore();
const tagsStore = useTagsStore();

const showTagDialog = ref(false);
const showBatchTagDialog = ref(false);
const selectedLiteratureIds = ref([]);
const selectedTagIds = ref([]);
const activeTagFilter = ref('all');
const newTagName = ref('');
const newTagColor = ref('#409eff');

const showEditDialog = ref(false);
const isSyncing = ref(false);

const profile = computed(() => userStore.profile);
const collection = computed(() => userStore.collection);
const statistics = computed(() => userStore.statistics);

const editForm = ref({
  name: '',
  email: '',
  affiliation: '',
  researchFields: [],
  orcid: ''
});

const suggestedFields = [
  '机器学习', '深度学习', '自然语言处理', '计算机视觉',
  '数据挖掘', '人工智能', '神经网络', '知识图谱',
  '推荐系统', '强化学习'
];

const yearDistribution = computed(() => {
  return statistics.value?.yearDistribution || [
    { year: 2024, count: 0 },
    { year: 2023, count: 0 },
    { year: 2022, count: 0 },
    { year: 2021, count: 0 },
    { year: 2020, count: 0 }
  ];
});

const maxYearCount = computed(() => {
  return Math.max(...yearDistribution.value.map(y => y.count), 1);
});

const topKeywords = computed(() => {
  return statistics.value?.topKeywords || [];
});

const maxKeywordCount = computed(() => {
  return Math.max(...topKeywords.value.map(k => k.count), 1);
});

const filteredCollection = computed(() => {
  if (activeTagFilter.value === 'all') {
    return collection.value;
  }
  return collection.value.filter(item => {
    const tagIds = tagsStore.getLiteratureTagNames(item.id).map(t => t.id);
    return tagsStore.getLiteratureTags(item.id).some(tag => tag.id === activeTagFilter.value);
  });
});

onMounted(async () => {
  await loadUserData();
});

async function loadUserData() {
  try {
    const [profileRes, collectionRes, statsRes] = await Promise.all([
      userApi.getProfile(userStore.userId),
      userApi.getCollection(userStore.userId),
      userApi.getStatistics(userStore.userId)
    ]);

    userStore.setProfile(profileRes.data);
    userStore.setCollection(collectionRes.data.items);
    userStore.setStatistics(statsRes.data);

    editForm.value = {
      name: profileRes.data.name || '',
      email: profileRes.data.email || '',
      affiliation: profileRes.data.affiliation || '',
      researchFields: profileRes.data.researchFields || [],
      orcid: profileRes.data.orcid || ''
    };
  } catch (e) {
    console.error('加载用户数据失败', e);
  }
}

async function syncProfile() {
  isSyncing.value = true;
  try {
    const res = await userApi.syncProfile(userStore.userId, {
      orcid: profile.value?.orcid,
      forceSync: false,
      profile: userStore.profile,
      collection: userStore.collection,
      lastSyncAt: userStore.lastSyncAt,
      pendingChanges: userStore.pendingChanges
    });
    
    userStore.mergeWithServer({
      profile: res.data.profile,
      collection: res.data.collection,
      statistics: userStore.statistics
    });
    
    const stats = res.data.syncStats || {};
    const messages = [];
    if (stats.profileMerged) messages.push('档案数据已合并');
    if (stats.collectionMerged) messages.push('收藏数据已合并');
    if (stats.conflictsResolved > 0) messages.push(`${stats.conflictsResolved} 个冲突已解决`);
    
    ElMessage.success(messages.length > 0 ? messages.join('，') : '同步成功');
    await loadUserData();
  } catch (e) {
    ElMessage.error('同步失败');
  } finally {
    isSyncing.value = false;
  }
}

async function saveProfile() {
  try {
    const res = await userApi.updateProfile(userStore.userId, editForm.value);
    userStore.setProfile(res.data);
    showEditDialog.value = false;
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error('保存失败');
  }
}

async function removeFromCollection(id) {
  try {
    await userApi.removeFromCollection(userStore.userId, id);
    userStore.removeFromCollection(id);
    ElMessage.success('已移除');
  } catch (e) {
    ElMessage.error('移除失败');
  }
}

function addToCitation(item) {
  literatureStore.addToCitation(item);
  ElMessage.success('已添加到引用列表');
}

function toggleSelection(id, checked) {
  if (checked) {
    if (!selectedLiteratureIds.value.includes(id)) {
      selectedLiteratureIds.value.push(id);
    }
  } else {
    selectedLiteratureIds.value = selectedLiteratureIds.value.filter(i => i !== id);
  }
}

function toggleTagSelection(tagId) {
  const index = selectedTagIds.value.indexOf(tagId);
  if (index === -1) {
    selectedTagIds.value.push(tagId);
  } else {
    selectedTagIds.value.splice(index, 1);
  }
}

function createNewTag() {
  if (!newTagName.value.trim()) return;
  
  tagsStore.addTag(newTagName.value.trim(), newTagColor.value);
  ElMessage.success('标签创建成功');
  newTagName.value = '';
  newTagColor.value = '#409eff';
  showTagDialog.value = false;
}

async function deleteTag(tagId) {
  try {
    await ElMessageBox.confirm('删除后该标签将从所有文献中移除，是否继续？', '确认删除', {
      type: 'warning'
    });
    
    if (tagsStore.deleteTag(tagId)) {
      ElMessage.success('标签已删除');
    }
  } catch {
  }
}

function openTagSelector(literatureId) {
  const currentTags = tagsStore.getLiteratureTags(literatureId).map(t => t.id);
  selectedTagIds.value = [...currentTags];
  showBatchTagDialog.value = true;
  selectedLiteratureIds.value = [literatureId];
}

function removeTagFromLiterature(literatureId, tagId) {
  tagsStore.removeTagFromLiterature(literatureId, tagId);
  ElMessage.success('已移除标签');
}

function applyBatchTags() {
  if (selectedLiteratureIds.value.length === 0 || selectedTagIds.value.length === 0) return;
  
  const added = tagsStore.batchAddTags(selectedLiteratureIds.value, selectedTagIds.value);
  ElMessage.success(`已为 ${selectedLiteratureIds.value.length} 篇文献添加标签`);
  
  selectedLiteratureIds.value = [];
  selectedTagIds.value = [];
  showBatchTagDialog.value = false;
}
</script>

<style scoped>
.profile-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-card {
  margin-bottom: 20px;
}

.profile-header {
  text-align: center;
  padding: 20px 0;
}

.avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin-bottom: 12px;
}

.user-name {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  color: #303133;
}

.user-affiliation {
  margin: 0 0 12px;
  color: #606266;
  font-size: 14px;
}

.user-fields {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.field-tag {
  background: #ecf5ff;
  border-color: #d9ecff;
  color: #409EFF;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding: 10px 0;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #409EFF;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.profile-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sync-info {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.social-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.link-item span {
  min-width: 100px;
  color: #606266;
}

.stats-card {
  margin-bottom: 20px;
}

.chart-section h4 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.year-chart,
.keywords-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.year-bar,
.keyword-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.year-label,
.kw-name {
  width: 60px;
  color: #606266;
}

.bar-wrapper {
  flex: 1;
  height: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #409EFF, #667eea);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bar-fill.kw {
  background: linear-gradient(90deg, #67c23a, #85ce61);
}

.year-count,
.kw-count {
  width: 30px;
  text-align: right;
  color: #909399;
}

.collection-card .card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.collection-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.collection-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  transition: all 0.2s;
}

.collection-item:hover {
  border-color: #409EFF;
  background: #fafcff;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  line-height: 1.4;
}

.item-authors {
  margin: 0 0 8px;
  font-size: 12px;
  color: #606266;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.citations {
  color: #e6a23c;
}

.added-time {
  color: #909399;
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 12px;
}

.tags-card {
  margin-bottom: 20px;
}

.tags-filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.filter-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.filter-tag:hover {
  opacity: 0.8;
}

.filter-tag.active {
  background-color: var(--tag-color, #409EFF);
  color: white;
  border-color: var(--tag-color, #409EFF);
}

.batch-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.section-title {
  margin: 16px 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.custom-tags-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-tag-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.custom-tag-item .tag-usage {
  flex: 1;
  font-size: 12px;
  color: #909399;
}

.custom-tag-item .tag-actions {
  flex-shrink: 0;
}

.collection-item.selected {
  border-color: #409EFF;
  background: #ecf5ff;
}

.item-select {
  padding-top: 4px;
  margin-right: 12px;
  flex-shrink: 0;
}

.item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.add-tag-btn {
  cursor: pointer;
  border-style: dashed;
}

.add-tag-btn:hover {
  border-color: #409EFF;
  color: #409EFF;
}

.batch-tag-content {
  padding: 8px 0;
}

.batch-info {
  margin-bottom: 16px;
}

.tag-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.selectable-tag {
  cursor: pointer;
  transition: all 0.2s;
  color: #606266;
}

.selectable-tag:hover {
  opacity: 0.8;
}

.selectable-tag.selected {
  color: white;
}
</style>
