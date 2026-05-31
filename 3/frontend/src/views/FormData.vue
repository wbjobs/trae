<template>
  <div class="form-data">
    <div class="page-header">
      <div class="header-left">
        <el-button @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2>{{ form?.name }} - 数据管理</h2>
      </div>
      <div class="header-right">
        <el-button @click="exportExcel">
          <el-icon><Download /></el-icon>
          导出 Excel
        </el-button>
        <el-button type="primary" @click="exportCSV">
          <el-icon><Download /></el-icon>
          导出 CSV
        </el-button>
      </div>
    </div>
    
    <el-card v-loading="loading">
      <el-table :data="submissions" style="width: 100%">
        <el-table-column label="序号" type="index" width="60" />
        <el-table-column
          v-for="field in form?.fields"
          :key="field.id"
          :label="field.label"
          :prop="field.name"
          min-width="150"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ formatValue(row.data?.[field.name]) }}
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text @click="viewDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end"
        @size-change="loadSubmissions"
        @current-change="loadSubmissions"
      />
    </el-card>
    
    <el-dialog v-model="detailVisible" title="详细数据" width="600px">
      <el-descriptions v-if="currentSubmission" :column="1" border>
        <el-descriptions-item
          v-for="field in form?.fields"
          :key="field.id"
          :label="field.label"
        >
          {{ formatValue(currentSubmission.data?.[field.name]) }}
        </el-descriptions-item>
        <el-descriptions-item label="提交时间">
          {{ formatDate(currentSubmission.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentSubmission.status)">
            {{ getStatusLabel(currentSubmission.status) }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formApi } from '@/api/form';
import type { Form, FormSubmission } from '@/types';

const route = useRoute();
const router = useRouter();
const formId = computed(() => route.params.id as string);

const loading = ref(false);
const form = ref<Form | null>(null);
const submissions = ref<FormSubmission[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const detailVisible = ref(false);
const currentSubmission = ref<FormSubmission | null>(null);

const formatValue = (value: any) => {
  if (value === null || value === undefined) return '-';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN');
};

const getStatusType = (status: string) => {
  const types: Record<string, string> = {
    draft: 'info',
    submitted: 'primary',
    approved: 'success',
    rejected: 'danger',
    pending_approval: 'warning',
  };
  return types[status] || 'info';
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: '草稿',
    submitted: '已提交',
    approved: '已通过',
    rejected: '已拒绝',
    pending_approval: '审批中',
  };
  return labels[status] || status;
};

const loadForm = async () => {
  try {
    form.value = await formApi.getForm(formId.value);
  } catch (error) {
    console.error(error);
  }
};

const loadSubmissions = async () => {
  loading.value = true;
  try {
    const result = await formApi.getSubmissions(formId.value, {
      page: page.value,
      pageSize: pageSize.value,
    });
    submissions.value = result.items;
    total.value = result.total;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const viewDetail = (row: FormSubmission) => {
  currentSubmission.value = row;
  detailVisible.value = true;
};

const exportExcel = async () => {
  try {
    const blob = await formApi.exportSubmissions(formId.value, 'excel');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.value?.name}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
  }
};

const exportCSV = async () => {
  try {
    const blob = await formApi.exportSubmissions(formId.value, 'csv');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.value?.name}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
  }
};

onMounted(() => {
  loadForm();
  loadSubmissions();
});
</script>

<style scoped>
.form-data {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-right {
  display: flex;
  gap: 12px;
}
</style>
