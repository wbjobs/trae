<template>
  <div class="approval-flows">
    <div class="page-header">
      <h2>审批流程</h2>
      <el-button type="primary" @click="handleCreate">
        <el-icon><Plus /></el-icon>
        新建流程
      </el-button>
    </div>
    
    <el-card v-loading="loading">
      <el-table :data="flows" style="width: 100%">
        <el-table-column prop="name" label="流程名称" min-width="200" />
        <el-table-column prop="formName" label="关联表单" min-width="200" />
        <el-table-column prop="nodeCount" label="节点数" width="100">
          <template #default="{ row }">
            {{ row.nodes?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text @click="handleEdit(row)">编辑</el-button>
            <el-button type="success" text v-if="row.status !== 'active'" @click="toggleStatus(row)">启用</el-button>
            <el-button type="warning" text v-else @click="toggleStatus(row)">禁用</el-button>
            <el-button type="danger" text @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    
    <el-dialog v-model="formVisible" title="选择关联表单" width="500px">
      <el-form label-width="80px">
        <el-form-item label="流程名称">
          <el-input v-model="flowForm.name" placeholder="请输入流程名称" />
        </el-form-item>
        <el-form-item label="关联表单">
          <el-select v-model="flowForm.formId" placeholder="请选择表单" style="width: 100%">
            <el-option
              v-for="form in forms"
              :key="form.id"
              :label="form.name"
              :value="form.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="submitFlowForm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { approvalApi } from '@/api/approval';
import { formApi } from '@/api/form';
import type { ApprovalFlow, Form } from '@/types';

const router = useRouter();
const loading = ref(false);
const flows = ref<ApprovalFlow[]>([]);
const forms = ref<Form[]>([]);
const formVisible = ref(false);

const flowForm = ref({
  name: '',
  formId: '',
});

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN');
};

const loadFlows = async () => {
  loading.value = true;
  try {
    flows.value = await approvalApi.getFlows();
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const loadForms = async () => {
  try {
    forms.value = await formApi.getForms();
  } catch (error) {
    console.error(error);
  }
};

const handleCreate = () => {
  flowForm.value = { name: '', formId: '' };
  formVisible.value = true;
};

const submitFlowForm = async () => {
  if (!flowForm.value.name) {
    ElMessage.warning('请输入流程名称');
    return;
  }
  if (!flowForm.value.formId) {
    ElMessage.warning('请选择关联表单');
    return;
  }
  
  try {
    const result = await approvalApi.createFlow({
      name: flowForm.value.name,
      formId: flowForm.value.formId,
    });
    formVisible.value = false;
    router.push(`/approval/flows/${result.id}/design`);
  } catch (error) {
    console.error(error);
  }
};

const handleEdit = (row: ApprovalFlow) => {
  router.push(`/approval/flows/${row.id}/design`);
};

const toggleStatus = async (row: ApprovalFlow) => {
  try {
    if (row.status === 'active') {
      await approvalApi.disableFlow(row.id);
      ElMessage.success('已禁用');
    } else {
      await approvalApi.enableFlow(row.id);
      ElMessage.success('已启用');
    }
    loadFlows();
  } catch (error) {
    console.error(error);
  }
};

const handleDelete = async (row: ApprovalFlow) => {
  try {
    await ElMessageBox.confirm('确定要删除该流程吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await approvalApi.deleteFlow(row.id);
    ElMessage.success('删除成功');
    loadFlows();
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error);
    }
  }
};

onMounted(() => {
  loadFlows();
  loadForms();
});
</script>

<style scoped>
.approval-flows {
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
</style>
