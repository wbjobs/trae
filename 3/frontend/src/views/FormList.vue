<template>
  <div class="form-list">
    <div class="page-header">
      <h2>表单列表</h2>
      <el-button type="primary" @click="$router.push('/forms/create')">
        <el-icon><Plus /></el-icon>
        新建表单
      </el-button>
    </div>
    
    <el-card>
      <el-table :data="forms" v-loading="loading" style="width: 100%">
        <el-table-column prop="name" label="表单名称" min-width="200">
          <template #default="{ row }">
            <div class="form-name">
              <el-icon><Document /></el-icon>
              <span>{{ row.name }}</span>
              <el-tag v-if="row.isPublic" type="success" size="small">
                已公开
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="currentVersion" label="版本" width="80" />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="420" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text @click="handleFill(row)">填写</el-button>
            <el-button type="primary" text @click="handleEdit(row)">编辑</el-button>
            <el-button type="primary" text @click="handleViewData(row)">数据</el-button>
            <el-button type="success" text @click="handleEmbed(row)">嵌入</el-button>
            <el-button type="warning" text v-if="row.status === 'draft'" @click="handlePublish(row)">发布</el-button>
            <el-button type="warning" text v-else @click="handleUnpublish(row)">取消发布</el-button>
            <el-button type="danger" text @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    
    <el-dialog v-model="embedVisible" title="表单嵌入" width="600px">
      <template v-if="currentForm">
        <div v-if="embedInfo?.isPublic" class="embed-section">
          <el-alert type="success" :closable="false" style="margin-bottom: 20px;">
            表单已公开，可通过以下方式嵌入到第三方网站
          </el-alert>
          
          <div class="embed-section">
            <h4>iframe 嵌入代码：</h4>
            <el-input
              v-model="embedInfo?.iframeCode"
              type="textarea"
              :rows="4"
              readonly
              style="font-family: monospace;"
            />
            <div class="action-buttons">
              <el-button type="primary" @click="copyCode(embedInfo?.iframeCode)">
                <el-icon><DocumentCopy /></el-icon>
                复制代码
              </el-button>
              <el-button type="success" @click="previewEmbed">
                <el-icon><View /></el-icon>
                预览
              </el-button>
              <el-button type="warning" @click="handleRefreshToken(currentForm!.id)">
                <el-icon><Refresh /></el-icon>
                刷新链接
              </el-button>
              <el-button type="danger" @click="handleTogglePublic(currentForm!.id)">
                取消公开
              </el-button>
            </div>
          </div>
          
          <el-divider />
          
          <div class="embed-section">
            <h4>访问链接：</h4>
            <el-input v-model="embedInfo?.iframeUrl" readonly />
            <div class="action-buttons">
              <el-button type="primary" @click="copyCode(embedInfo?.iframeUrl)">
                <el-icon><Link /></el-icon>
                复制链接
              </el-button>
            </div>
          </div>
        </div>
        
        <div v-else>
          <el-alert type="info" :closable="false" style="margin-bottom: 20px;">
            此表单尚未公开，公开后可生成嵌入代码并嵌入到第三方网站
          </el-alert>
          
          <el-checkbox v-model="publicSettings.requireCaptcha">
            需要验证码
          </el-checkbox>
          
          <el-form-item label="每个 IP 每日提交限制" style="margin-top: 12px;">
            <el-input-number
              v-model="publicSettings.limitPerIp"
              :min="0"
              :max="1000"
              :step="1"
              placeholder="0 表示不限制"
            />
            <span style="margin-left: 12px; color: #909399;">0 表示不限制</span>
          </el-form-item>
          
          <el-form-item label="过期时间（可选）" style="margin-top: 12px;">
            <el-date-picker
              v-model="publicSettings.expireAt"
              type="datetime"
              placeholder="选择过期时间"
              style="width: 100%;"
            />
          </el-form-item>
          
          <div class="action-buttons" style="margin-top: 24px;">
            <el-button type="primary" @click="handleTogglePublic(currentForm!.id)">
              <el-icon><Share /></el-icon>
              设为公开并生成代码
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formApi, formSubmissionApi } from '@/api/form';
import type { Form } from '@/types';

const router = useRouter();
const loading = ref(false);
const forms = ref<Form[]>([]);
const embedVisible = ref(false);
const currentForm = ref<Form | null>(null);
const embedInfo = ref<any>(null);

const publicSettings = reactive({
  requireCaptcha: false,
  limitPerIp: 0,
  expireAt: null as Date | null,
});

const getStatusType = (status: string) => {
  const types: Record<string, string> = {
    draft: 'info',
    published: 'success',
    archived: 'warning',
  };
  return types[status] || 'info';
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: '草稿',
    published: '已发布',
    archived: '已归档',
  };
  return labels[status] || status;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN');
};

const loadForms = async () => {
  loading.value = true;
  try {
    forms.value = await formApi.getForms();
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleFill = (row: Form) => {
  if (row.status !== 'published') {
    ElMessage.warning('只有已发布的表单才能填写');
    return;
  }
  router.push(`/forms/${row.id}/fill`);
};

const handleEdit = (row: Form) => {
  router.push(`/forms/${row.id}/edit`);
};

const handleViewData = (row: Form) => {
  router.push(`/forms/${row.id}/data`);
};

const handlePublish = async (row: Form) => {
  try {
    await formApi.publishForm(row.id);
    ElMessage.success('发布成功');
    loadForms();
  } catch (error) {
    console.error(error);
  }
};

const handleUnpublish = async (row: Form) => {
  try {
    await formApi.unpublishForm(row.id);
    ElMessage.success('已取消发布');
    loadForms();
  } catch (error) {
    console.error(error);
  }
};

const handleDelete = async (row: Form) => {
  try {
    await ElMessageBox.confirm('确定要删除该表单吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await formApi.deleteForm(row.id);
    ElMessage.success('删除成功');
    loadForms();
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error);
    }
  }
};

const handleEmbed = async (row: Form) => {
  currentForm.value = row;
  
  if (row.status !== 'published') {
    ElMessage.warning('只有已发布的表单才能公开嵌入');
    return;
  }
  
  try {
    embedInfo.value = await formSubmissionApi.getEmbedCode(row.id);
    embedVisible.value = true;
    
    if (!embedInfo.value.isPublic) {
      publicSettings.requireCaptcha = false;
      publicSettings.limitPerIp = 0;
      publicSettings.expireAt = null;
    }
  } catch (error) {
    console.error(error);
  }
};

const handleTogglePublic = async (formId: string) => {
  try {
    const settings: any = {};
    if (publicSettings.requireCaptcha) {
      settings.requireCaptcha = publicSettings.requireCaptcha;
    }
    if (publicSettings.limitPerIp > 0) {
      settings.limitPerIp = publicSettings.limitPerIp;
    }
    if (publicSettings.expireAt) {
      settings.expireAt = publicSettings.expireAt;
    }
    
    const result = await formSubmissionApi.togglePublic(formId, Object.keys(settings).length > 0 ? settings : undefined);
    embedInfo.value = {
      isPublic: result.form.isPublic,
      publicToken: result.form.publicToken,
      iframeUrl: result.iframeUrl,
      iframeCode: result.iframeCode,
    };
    ElMessage.success(result.form.isPublic ? '已设为公开' : '已取消公开');
    loadForms();
  } catch (error) {
    console.error(error);
  }
};

const handleRefreshToken = async (formId: string) => {
  try {
    await ElMessageBox.confirm(
      '刷新后旧的嵌入链接将失效，确定要刷新吗？',
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    const result = await formSubmissionApi.refreshPublicToken(formId);
    embedInfo.value = {
      isPublic: true,
      publicToken: result.form.publicToken,
      iframeUrl: result.iframeUrl,
      iframeCode: result.iframeCode,
    };
    ElMessage.success('链接已刷新');
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error);
    }
  }
};

const copyCode = async (text?: string) => {
  if (!text) return;
  
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制到剪贴板');
  } catch (error) {
    ElMessage.error('复制失败，请手动复制');
  }
};

const previewEmbed = () => {
  if (embedInfo.value?.iframeUrl) {
    window.open(embedInfo.value.iframeUrl, '_blank');
  }
};

onMounted(() => {
  loadForms();
});
</script>

<style scoped>
.form-list {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.form-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.embed-section {
  margin-bottom: 20px;
}

.embed-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}
</style>
