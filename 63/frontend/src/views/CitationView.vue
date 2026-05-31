<template>
  <div class="citation-view">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="input-card">
          <template #header>
            <div class="card-header">
              <el-icon :size="20" color="#409EFF"><Edit /></el-icon>
              <span>引文输入</span>
            </div>
          </template>

          <el-tabs v-model="activeTab" type="border-card">
            <el-tab-pane label="手动输入" name="manual">
              <el-form :model="manualForm" label-width="80px">
                <el-form-item label="标题">
                  <el-input v-model="manualForm.title" placeholder="文献标题" />
                </el-form-item>
                <el-form-item label="作者">
                  <el-input
                    v-model="manualForm.authors"
                    placeholder="多个作者用逗号分隔"
                  />
                </el-form-item>
                <el-form-item label="期刊">
                  <el-input v-model="manualForm.journal" placeholder="期刊名称" />
                </el-form-item>
                <el-form-item label="年份">
                  <el-input-number v-model="manualForm.year" :min="1900" :max="2100" />
                </el-form-item>
                <el-form-item label="卷期">
                  <el-col :span="11">
                    <el-input v-model="manualForm.volume" placeholder="卷" />
                  </el-col>
                  <el-col :span="2" class="text-center">-</el-col>
                  <el-col :span="11">
                    <el-input v-model="manualForm.issue" placeholder="期" />
                  </el-col>
                </el-form-item>
                <el-form-item label="页码">
                  <el-input v-model="manualForm.pages" placeholder="如: 123-145" />
                </el-form-item>
                <el-form-item label="DOI">
                  <el-input v-model="manualForm.doi" placeholder="DOI编号" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :icon="Plus" @click="addManualCitation">
                    添加到列表
                  </el-button>
                  <el-button :icon="Delete" @click="clearManualForm">清空</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="解析引文" name="parse">
              <div class="parse-section">
                <el-input
                  v-model="rawCitation"
                  type="textarea"
                  :rows="6"
                  placeholder="粘贴原始引文文本，系统将自动识别格式并解析..."
                />
                <div class="parse-actions">
                  <el-button type="primary" :icon="MagicStick" :loading="isParsing" @click="parseCitation">
                    智能解析
                  </el-button>
                  <el-button :icon="InfoFilled" @click="showParseHelp = true">
                    解析说明
                  </el-button>
                </div>
                <div v-if="parseResult" class="parse-result">
                  <el-alert title="解析结果" type="success" :closable="false">
                    <div class="parsed-info">
                      <p><strong>检测格式:</strong> {{ parseResult.format }}</p>
                      <p><strong>置信度:</strong> {{ parseResult.confidence }}%</p>
                      <p><strong>标题:</strong> {{ parseResult.parsed?.title }}</p>
                      <p><strong>作者:</strong> {{ formatAuthors(parseResult.parsed?.authors) }}</p>
                      <p><strong>年份:</strong> {{ parseResult.parsed?.year }}</p>
                    </div>
                    <el-button size="small" type="primary" @click="addParsedCitation">
                      添加到引用列表
                    </el-button>
                  </el-alert>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>

        <el-card class="format-card">
          <template #header>
            <div class="card-header">
              <el-icon :size="20" color="#67C23A"><Setting /></el-icon>
              <span>输出格式</span>
            </div>
          </template>

          <el-radio-group v-model="selectedFormat" class="format-group" @change="generateCitations">
            <el-radio
              v-for="fmt in formats"
              :key="fmt.id"
              :value="fmt.id"
              border
              class="format-radio"
            >
              <div class="format-info">
                <span class="format-name">{{ fmt.name }}</span>
                <span class="format-desc">{{ fmt.description }}</span>
              </div>
            </el-radio>
          </el-radio-group>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card class="list-card">
          <template #header>
            <div class="list-header">
              <div class="header-left">
                <el-icon :size="20" color="#E6A23C"><Collection /></el-icon>
                <span>引用列表</span>
                <el-tag type="info">{{ citationList.length }} 条</el-tag>
              </div>
              <div class="header-right">
                <el-button size="small" :icon="Top" @click="moveUp">上移</el-button>
                <el-button size="small" :icon="Bottom" @click="moveDown">下移</el-button>
                <el-button size="small" type="danger" :icon="Delete" @click="removeSelected">
                  删除选中
                </el-button>
                <el-button size="small" :icon="Delete" @click="clearAll">
                  清空
                </el-button>
              </div>
            </div>
          </template>

          <el-empty v-if="citationList.length === 0" description="暂无引用文献">
            <el-button type="primary" @click="activeTab = 'manual'">手动添加</el-button>
            <el-button @click="$router.push('/search')">去检索</el-button>
          </el-empty>

          <div v-else class="citation-list">
            <div
              v-for="(item, index) in citationList"
              :key="item.id"
              class="citation-item"
              :class="{ 'selected': selectedIndex === index }"
              @click="selectItem(index)"
            >
              <div class="item-left">
                <el-checkbox
                  :model-value="selectedIndex === index"
                  @change="selectItem(index)"
                />
                <span class="item-num">[{{ index + 1 }}]</span>
              </div>
              <div class="item-content">
                <h4 class="item-title">{{ item.title }}</h4>
                <p class="item-authors">{{ formatAuthors(item.authors) }}</p>
                <p class="item-source">
                  {{ item.journal }}
                  <span v-if="item.year">, {{ item.year }}</span>
                  <span v-if="item.volume">, {{ item.volume }}({{ item.issue }})</span>
                  <span v-if="item.pages">: {{ item.pages }}</span>
                </p>
              </div>
              <div class="item-actions">
                <el-button size="small" :icon="Top" @click.stop="moveItem(index, -1)" />
                <el-button size="small" :icon="Bottom" @click.stop="moveItem(index, 1)" />
                <el-button
                  size="small"
                  type="danger"
                  :icon="Delete"
                  @click.stop="removeItem(index)"
                />
              </div>
            </div>
          </div>
        </el-card>

        <el-card class="preview-card">
          <template #header>
            <div class="preview-header">
              <el-icon :size="20" color="#F56C6C"><View /></el-icon>
              <span>引文预览</span>
              <div class="preview-actions">
                <el-button
                  size="small"
                  type="primary"
                  :icon="CopyDocument"
                  :loading="isGenerating"
                  @click="generateCitations"
                >
                  生成引文
                </el-button>
                <el-button
                  size="small"
                  :icon="CopyDocument"
                  :disabled="!generatedCitations"
                  @click="copyAllCitations"
                >
                  复制全部
                </el-button>
                <el-button
                  size="small"
                  :icon="Download"
                  :disabled="!generatedCitations"
                  @click="downloadCitations"
                >
                  导出
                </el-button>
              </div>
            </div>
          </template>

          <div v-if="!generatedCitations" class="empty-preview">
            <el-empty description="点击"生成引文"按钮查看格式化后的引用列表" />
          </div>

          <div v-else class="citation-preview">
            <div
              v-for="(citation, index) in generatedCitations"
              :key="index"
              class="citation-line"
            >
              <span class="line-num">[{{ index + 1 }}]</span>
              <span class="line-content" v-html="citation" />
              <el-button
                size="small"
                text
                :icon="CopyDocument"
                @click="copyCitation(citation)"
              >
                复制
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showParseHelp" title="引文解析说明" width="500px">
      <div class="help-content">
        <h4>支持的格式:</h4>
        <ul>
          <li><strong>APA 格式:</strong> 作者. (年份). 标题. 期刊, 卷(期), 页码.</li>
          <li><strong>GB/T 7714:</strong> [序号] 作者. 标题[J]. 期刊, 年份, 卷(期): 页码.</li>
          <li><strong>IEEE 格式:</strong> [序号] 作者, "标题," 期刊, vol. 卷, no. 期, pp. 页码, 年份.</li>
        </ul>
        <h4>示例:</h4>
        <p style="background: #f5f7fa; padding: 10px; border-radius: 4px; font-family: monospace;">
          Zhang, W., Li, M., &amp; Wang, H. (2024). Deep learning for NLP. Nature Machine Intelligence, 6(3), 245-268.
        </p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Edit, Plus, Delete, MagicStick, InfoFilled, Setting, Collection,
  Top, Bottom, View, CopyDocument, Download
} from '@element-plus/icons-vue';
import { citationApi } from '@/api';
import { useLiteratureStore } from '@/store/literature';
import { formatAuthors, copyToClipboard, downloadFile } from '@/utils/format';

const literatureStore = useLiteratureStore();

const activeTab = ref('manual');
const selectedFormat = ref('GB/T7714');
const formats = ref([]);
const selectedIndex = ref(-1);
const isParsing = ref(false);
const isGenerating = ref(false);
const showParseHelp = ref(false);

const rawCitation = ref('');
const parseResult = ref(null);
const generatedCitations = ref(null);

const manualForm = ref({
  title: '',
  authors: '',
  journal: '',
  year: new Date().getFullYear(),
  volume: '',
  issue: '',
  pages: '',
  doi: ''
});

const citationList = computed(() => literatureStore.citationList);

onMounted(async () => {
  try {
    const res = await citationApi.getFormats();
    formats.value = res.data;
  } catch (e) {
    console.error('获取格式列表失败', e);
  }
});

watch(selectedFormat, () => {
  if (citationList.value.length > 0 && generatedCitations.value) {
    generateCitations();
  }
});

function addManualCitation() {
  if (!manualForm.value.title.trim()) {
    ElMessage.warning('请输入文献标题');
    return;
  }

  const authors = manualForm.value.authors
    .split(/[,，]/)
    .map(name => name.trim())
    .filter(name => name)
    .map(name => {
      const parts = name.split(/\s+/);
      return {
        fullName: name,
        lastName: parts.length > 1 ? parts[parts.length - 1] : name,
        firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : ''
      };
    });

  const literature = {
    id: `manual-${Date.now()}`,
    title: manualForm.value.title.trim(),
    authors,
    journal: manualForm.value.journal.trim(),
    year: manualForm.value.year,
    volume: manualForm.value.volume,
    issue: manualForm.value.issue,
    pages: manualForm.value.pages,
    doi: manualForm.value.doi
  };

  literatureStore.addToCitation(literature);
  ElMessage.success('已添加到引用列表');
  clearManualForm();
}

function clearManualForm() {
  manualForm.value = {
    title: '',
    authors: '',
    journal: '',
    year: new Date().getFullYear(),
    volume: '',
    issue: '',
    pages: '',
    doi: ''
  };
}

async function parseCitation() {
  if (!rawCitation.value.trim()) {
    ElMessage.warning('请输入引文文本');
    return;
  }

  isParsing.value = true;
  try {
    const res = await citationApi.parse({
      citation: rawCitation.value.trim(),
      format: 'auto'
    });
    parseResult.value = res.data;
    ElMessage.success('解析成功');
  } catch (e) {
    ElMessage.error('解析失败，请检查引文格式');
  } finally {
    isParsing.value = false;
  }
}

function addParsedCitation() {
  if (!parseResult.value) return;

  const literature = {
    id: `parsed-${Date.now()}`,
    ...parseResult.value.parsed,
    title: parseResult.value.parsed.title || '未识别标题'
  };

  literatureStore.addToCitation(literature);
  ElMessage.success('已添加到引用列表');
  parseResult.value = null;
  rawCitation.value = '';
}

function selectItem(index) {
  selectedIndex.value = selectedIndex.value === index ? -1 : index;
}

function moveItem(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= citationList.value.length) return;

  const list = [...citationList.value];
  [list[index], list[newIndex]] = [list[newIndex], list[index]];
  literatureStore.citationList = list;
  selectedIndex.value = newIndex;
}

function moveUp() {
  if (selectedIndex.value > 0) {
    moveItem(selectedIndex.value, -1);
  }
}

function moveDown() {
  if (selectedIndex.value < citationList.value.length - 1) {
    moveItem(selectedIndex.value, 1);
  }
}

function removeItem(index) {
  const item = citationList.value[index];
  literatureStore.removeFromCitation(item.id);
  if (selectedIndex.value === index) {
    selectedIndex.value = -1;
  }
  ElMessage.success('已删除');
}

function removeSelected() {
  if (selectedIndex.value >= 0) {
    removeItem(selectedIndex.value);
  } else {
    ElMessage.warning('请先选择要删除的条目');
  }
}

function clearAll() {
  if (citationList.value.length === 0) return;
  ElMessage({
    message: '确定要清空引用列表吗？',
    type: 'warning',
    showCancelButton: true,
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    onConfirm: () => {
      literatureStore.clearCitationList();
      selectedIndex.value = -1;
      generatedCitations.value = null;
      ElMessage.success('已清空');
    }
  });
}

async function generateCitations() {
  if (citationList.value.length === 0) {
    ElMessage.warning('请先添加引用文献');
    return;
  }

  isGenerating.value = true;
  try {
    const res = await citationApi.batchFormat({
      literatures: citationList.value,
      format: selectedFormat.value
    });
    generatedCitations.value = res.data.citations;
    ElMessage.success('生成成功');
  } catch (e) {
    ElMessage.error('生成失败');
  } finally {
    isGenerating.value = false;
  }
}

async function copyCitation(citation) {
  await copyToClipboard(citation.replace(/<[^>]*>/g, ''));
  ElMessage.success('已复制');
}

async function copyAllCitations() {
  const text = generatedCitations.value
    .map((c, i) => `[${i + 1}] ${c.replace(/<[^>]*>/g, '')}`)
    .join('\n');
  await copyToClipboard(text);
  ElMessage.success('已复制全部引文');
}

function downloadCitations() {
  const text = generatedCitations.value
    .map((c, i) => `[${i + 1}] ${c.replace(/<[^>]*>/g, '')}`)
    .join('\n\n');
  
  downloadFile(text, `citations_${selectedFormat.value}.txt`, 'text/plain');
  ElMessage.success('下载成功');
}
</script>

<style scoped>
.citation-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.input-card,
.format-card {
  margin-bottom: 20px;
}

.parse-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.parse-actions {
  display: flex;
  gap: 10px;
}

.parse-result {
  margin-top: 12px;
}

.parsed-info p {
  margin: 4px 0;
  font-size: 13px;
}

.format-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.format-radio {
  margin-right: 0;
}

.format-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.format-name {
  font-weight: 600;
  color: #303133;
}

.format-desc {
  font-size: 12px;
  color: #909399;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.header-right {
  display: flex;
  gap: 8px;
}

.citation-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.citation-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  transition: all 0.2s;
}

.citation-item:hover,
.citation-item.selected {
  border-color: #409EFF;
  background: #ecf5ff;
}

.item-left {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-shrink: 0;
}

.item-num {
  font-weight: 600;
  color: #909399;
  min-width: 40px;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  line-height: 1.4;
}

.item-authors {
  margin: 0 0 4px;
  font-size: 12px;
  color: #606266;
}

.item-source {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.preview-card {
  margin-top: 20px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.empty-preview {
  padding: 40px 0;
}

.citation-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.citation-line {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
  font-size: 13px;
  line-height: 1.6;
}

.line-num {
  color: #909399;
  flex-shrink: 0;
}

.line-content {
  flex: 1;
}

.text-center {
  text-align: center;
}

.help-content ul {
  padding-left: 20px;
  line-height: 1.8;
}

.help-content h4 {
  margin: 16px 0 8px;
}
</style>
