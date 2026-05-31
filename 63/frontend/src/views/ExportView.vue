<template>
  <div class="export-view">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="export-options">
          <template #header>
            <div class="card-header">
              <el-icon :size="20" color="#409EFF"><Setting /></el-icon>
              <span>导出设置</span>
            </div>
          </template>

          <el-form label-width="100px">
            <el-form-item label="选择文献">
              <el-select
                v-model="exportScope"
                placeholder="选择导出范围"
                style="width: 100%"
              >
                <el-option label="全部引用文献" value="all" />
                <el-option label="用户收藏文献" value="collection" />
                <el-option label="手动选择" value="selected" />
              </el-select>
            </el-form-item>

            <el-form-item label="输出格式">
              <el-radio-group v-model="exportFormat">
                <el-radio-button value="text">纯文本</el-radio-button>
                <el-radio-button value="bibtex">BibTeX</el-radio-button>
                <el-radio-button value="ris">RIS</el-radio-button>
                <el-radio-button value="json">JSON</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="引用格式">
              <el-select v-model="citationFormat" style="width: 100%">
                <el-option
                  v-for="fmt in formats"
                  :key="fmt.id"
                  :label="fmt.name"
                  :value="fmt.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="包含内容">
              <el-checkbox-group v-model="includeFields">
                <el-checkbox value="abstract">摘要</el-checkbox>
                <el-checkbox value="keywords">关键词</el-checkbox>
                <el-checkbox value="doi">DOI</el-checkbox>
                <el-checkbox value="url">链接</el-checkbox>
              </el-checkbox-group>
            </el-form-item>

            <el-form-item label="排序方式">
              <el-select v-model="sortBy" style="width: 100%">
                <el-option label="添加顺序" value="order" />
                <el-option label="作者姓名" value="author" />
                <el-option label="发表年份" value="year" />
                <el-option label="期刊名称" value="journal" />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                :icon="Document"
                :loading="isGenerating"
                @click="generateExport"
                style="width: 100%"
              >
                生成导出内容
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card class="format-info">
          <template #header>
            <div class="card-header">
              <el-icon :size="20" color="#67C23A"><InfoFilled /></el-icon>
              <span>格式说明</span>
            </div>
          </template>

          <el-tabs v-model="activeInfoTab">
            <el-tab-pane label="BibTeX" name="bibtex">
              <div class="format-desc">
                <p>BibTeX 是一种用于管理参考文献的文件格式，广泛用于 LaTeX 文档。</p>
                <pre class="code-preview">@article{key,
  author = {Author, A.},
  title = {Title},
  journal = {Journal},
  year = {2024}
}</pre>
              </div>
            </el-tab-pane>
            <el-tab-pane label="RIS" name="ris">
              <div class="format-desc">
                <p>RIS (Research Information Systems) 是一种标准化的标签格式，用于在引用程序之间交换书目数据。</p>
                <pre class="code-preview">TY  - JOUR
AU  - Author, A.
TI  - Title
JO  - Journal
PY  - 2024
ER  -</pre>
              </div>
            </el-tab-pane>
            <el-tab-pane label="纯文本" name="text">
              <div class="format-desc">
                <p>按照指定的引用格式生成纯文本参考文献列表，可直接复制到文档中使用。</p>
                <p class="example">[1] Zhang W, Li M, Wang H. Deep learning for NLP. Nature Machine Intelligence, 2024, 6(3): 245-268.</p>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card class="preview-card">
          <template #header>
            <div class="preview-header">
              <div class="header-left">
                <el-icon :size="20" color="#E6A23C"><View /></el-icon>
                <span>导出预览</span>
                <el-tag type="info" v-if="exportData">
                  {{ exportData.count }} 条文献
                </el-tag>
              </div>
              <div class="header-right">
                <el-button
                  size="small"
                  :icon="CopyDocument"
                  :disabled="!exportContent"
                  @click="handleCopy"
                >
                  复制内容
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  :icon="Download"
                  :disabled="!exportContent"
                  @click="handleDownload"
                >
                  下载文件
                </el-button>
              </div>
            </div>
          </template>

          <div v-if="!exportContent" class="empty-preview">
            <el-empty description="配置导出选项后点击「生成导出内容」预览">
              <el-button type="primary" @click="generateExport">开始生成</el-button>
            </el-empty>
          </div>

          <div v-else class="export-preview">
            <div v-if="exportFormat === 'json'" class="json-preview">
              <pre><code>{{ formatJson(exportContent) }}</code></pre>
            </div>
            <div v-else class="text-preview">
              <pre>{{ exportContent }}</pre>
            </div>
          </div>
        </el-card>

        <el-card class="literature-list-card">
          <template #header>
            <div class="card-header">
              <el-icon :size="20" color="#F56C6C"><Collection /></el-icon>
              <span>待导出文献</span>
              <el-tag type="info">{{ literatureList.length }} 条</el-tag>
            </div>
          </template>

          <el-empty v-if="literatureList.length === 0" description="暂无文献">
            <el-button type="primary" @click="$router.push('/search')">去检索</el-button>
            <el-button @click="$router.push('/citation')">手动添加</el-button>
          </el-empty>

          <div v-else class="literature-table">
            <el-table
              :data="sortedList"
              border
              size="small"
              max-height="300"
              @selection-change="handleSelectionChange"
              ref="tableRef"
            >
              <el-table-column type="selection" width="50" v-if="exportScope === 'selected'" />
              <el-table-column label="序号" width="60" align="center">
                <template #default="{ $index }">
                  {{ $index + 1 }}
                </template>
              </el-table-column>
              <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
              <el-table-column label="作者" width="150" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ formatAuthors(row.authors, 2) }}
                </template>
              </el-table-column>
              <el-table-column prop="journal" label="期刊" width="150" show-overflow-tooltip />
              <el-table-column prop="year" label="年份" width="70" align="center" />
              <el-table-column label="引用数" width="90" align="center">
                <template #default="{ row }">
                  {{ formatNumber(row.citationCount) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Setting, InfoFilled, Document, View, CopyDocument, Download, Collection
} from '@element-plus/icons-vue';
import { citationApi } from '@/api';
import { useLiteratureStore, useUserStore } from '@/store/literature';
import { formatAuthors, formatNumber, copyToClipboard, downloadFile } from '@/utils/format';

const literatureStore = useLiteratureStore();
const userStore = useUserStore();

const exportScope = ref('all');
const exportFormat = ref('text');
const citationFormat = ref('GB/T7714');
const includeFields = ref(['abstract', 'keywords', 'doi', 'url']);
const sortBy = ref('order');
const activeInfoTab = ref('bibtex');
const isGenerating = ref(false);

const formats = ref([]);
const exportContent = ref('');
const exportData = ref(null);
const selectedItems = ref([]);

const literatureList = computed(() => {
  if (exportScope.value === 'collection') {
    return userStore.collection || [];
  }
  return literatureStore.citationList;
});

const sortedList = computed(() => {
  const list = [...literatureList.value];
  
  switch (sortBy.value) {
    case 'author':
      return list.sort((a, b) => {
        const aName = a.authors?.[0]?.lastName || '';
        const bName = b.authors?.[0]?.lastName || '';
        return aName.localeCompare(bName);
      });
    case 'year':
      return list.sort((a, b) => (b.year || 0) - (a.year || 0));
    case 'journal':
      return list.sort((a, b) => (a.journal || '').localeCompare(b.journal || ''));
    default:
      return list;
  }
});

onMounted(async () => {
  try {
    const res = await citationApi.getFormats();
    formats.value = res.data;
  } catch (e) {
    console.error('获取格式列表失败', e);
  }
});

watch(exportScope, () => {
  exportContent.value = '';
  exportData.value = null;
});

async function generateExport() {
  if (literatureList.value.length === 0) {
    ElMessage.warning('没有可导出的文献');
    return;
  }

  isGenerating.value = true;
  try {
    let data = sortedList.value;
    
    if (exportScope.value === 'selected' && selectedItems.value.length > 0) {
      data = selectedItems.value;
    }

    if (exportFormat.value === 'text') {
      const res = await citationApi.batchFormat({
        literatures: data,
        format: citationFormat.value
      });
      
      let content = '';
      res.data.citations.forEach((c, i) => {
        content += `[${i + 1}] ${c.replace(/<[^>]*>/g, '')}\n\n`;
        
        if (includeFields.value.includes('abstract') && data[i]?.abstract) {
          content += `  摘要: ${data[i].abstract}\n`;
        }
        if (includeFields.value.includes('keywords') && data[i]?.keywords?.length) {
          content += `  关键词: ${data[i].keywords.join('; ')}\n`;
        }
        if (includeFields.value.includes('doi') && data[i]?.doi) {
          content += `  DOI: ${data[i].doi}\n`;
        }
        if (includeFields.value.includes('url') && data[i]?.sourceUrl) {
          content += `  链接: ${data[i].sourceUrl}\n`;
        }
        content += '\n';
      });
      
      exportContent.value = content.trim();
    } else if (exportFormat.value === 'bibtex') {
      const entries = data.map((lit, i) => {
        const authors = (lit.authors || [])
          .map(a => `${a.lastName}, ${a.firstName}`)
          .join(' and ');
        
        return `@article{${lit.id || `entry_${i}`},\n` +
          `  author = {${authors}},\n` +
          `  title = {${lit.title || ''}},\n` +
          `  journal = {${lit.journal || ''}},\n` +
          `  year = {${lit.year || ''}},\n` +
          `  volume = {${lit.volume || ''}},\n` +
          `  number = {${lit.issue || ''}},\n` +
          `  pages = {${lit.pages || ''}},\n` +
          (includeFields.value.includes('doi') && lit.doi ? `  doi = {${lit.doi}},\n` : '') +
          (includeFields.value.includes('url') && lit.sourceUrl ? `  url = {${lit.sourceUrl}},\n` : '') +
          (includeFields.value.includes('abstract') && lit.abstract ? `  abstract = {${lit.abstract}},\n` : '') +
          (includeFields.value.includes('keywords') && lit.keywords?.length ? `  keywords = {${lit.keywords.join(', ')}},\n` : '') +
          `}`;
      });
      exportContent.value = entries.join('\n\n');
    } else if (exportFormat.value === 'ris') {
      const entries = data.map(lit => {
        let ris = 'TY  - JOUR\n';
        (lit.authors || []).forEach(a => {
          ris += `AU  - ${a.lastName}, ${a.firstName}\n`;
        });
        ris += `TI  - ${lit.title || ''}\n`;
        ris += `JO  - ${lit.journal || ''}\n`;
        ris += `PY  - ${lit.year || ''}\n`;
        ris += `VL  - ${lit.volume || ''}\n`;
        ris += `IS  - ${lit.issue || ''}\n`;
        if (lit.pages) {
          const pages = lit.pages.split('-');
          ris += `SP  - ${pages[0]}\n`;
          if (pages[1]) ris += `EP  - ${pages[1]}\n`;
        }
        if (includeFields.value.includes('doi') && lit.doi) {
          ris += `DO  - ${lit.doi}\n`;
        }
        if (includeFields.value.includes('url') && lit.sourceUrl) {
          ris += `UR  - ${lit.sourceUrl}\n`;
        }
        if (includeFields.value.includes('abstract') && lit.abstract) {
          ris += `AB  - ${lit.abstract}\n`;
        }
        if (includeFields.value.includes('keywords') && lit.keywords?.length) {
          lit.keywords.forEach(kw => {
            ris += `KW  - ${kw}\n`;
          });
        }
        ris += 'ER  - \n';
        return ris;
      });
      exportContent.value = entries.join('\n');
    } else if (exportFormat.value === 'json') {
      exportContent.value = JSON.stringify(data, null, 2);
    }

    exportData.value = {
      format: exportFormat.value,
      count: data.length,
      generatedAt: new Date().toISOString()
    };

    ElMessage.success('生成成功');
  } catch (e) {
    ElMessage.error('生成失败');
  } finally {
    isGenerating.value = false;
  }
}

function formatJson(jsonStr) {
  try {
    return JSON.stringify(JSON.parse(jsonStr), null, 2);
  } catch {
    return jsonStr;
  }
}

const tableRef = ref(null);

function handleSelectionChange(selection) {
  selectedItems.value = selection;
}

async function handleCopy() {
  await copyToClipboard(exportContent.value);
  ElMessage.success('已复制到剪贴板');
}

function handleDownload() {
  const extensions = {
    text: 'txt',
    bibtex: 'bib',
    ris: 'ris',
    json: 'json'
  };
  
  const mimeTypes = {
    text: 'text/plain',
    bibtex: 'application/x-bibtex',
    ris: 'application/x-research-info-systems',
    json: 'application/json'
  };

  const ext = extensions[exportFormat.value] || 'txt';
  const mimeType = mimeTypes[exportFormat.value] || 'text/plain';
  const filename = `references_${Date.now()}.${ext}`;

  downloadFile(exportContent.value, filename, mimeType);
  ElMessage.success('下载成功');
}
</script>

<style scoped>
.export-view {
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

.export-options {
  margin-bottom: 20px;
}

.format-info .format-desc {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
}

.format-info .format-desc p {
  margin: 0 0 12px;
}

.format-info .code-preview {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
}

.format-info .example {
  background: #f0f9eb;
  padding: 10px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #67c23a;
}

.preview-card {
  margin-bottom: 20px;
}

.preview-header {
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

.empty-preview {
  padding: 60px 0;
}

.export-preview {
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.export-preview pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.json-preview {
  color: #67c23a;
}

.text-preview {
  color: #303133;
}

.literature-table {
  max-height: 300px;
  overflow-y: auto;
}
</style>
