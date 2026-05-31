<template>
  <div class="route-rules">
    <div class="page-header">
      <h2>路由规则</h2>
      <el-button type="primary" :icon="Plus" @click="openDialog">新建规则</el-button>
    </div>

    <el-card class="list-card">
      <el-table :data="rules" v-loading="loading" row-key="id">
        <el-table-column prop="priority" label="优先级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="getPriorityTag(row.priority)" size="small">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="规则名称" min-width="150" />
        <el-table-column prop="enabled" label="状态" width="80">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="toggleRule(row)" />
          </template>
        </el-table-column>
        <el-table-column label="匹配条件" min-width="250">
          <template #default="{ row }">
            <div class="conditions-preview">
              <el-tag v-for="(cond, i) in row.conditions" :key="i" size="small" style="margin-right: 4px; margin-bottom: 4px">
                {{ cond.type }}:{{ cond.field }} {{ cond.operator }} {{ cond.value }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="转发目标" min-width="200">
          <template #default="{ row }">
            <div class="targets-preview">
              <el-tag v-for="(target, i) in row.targets" :key="i" type="success" size="small" style="margin-right: 4px; margin-bottom: 4px">
                {{ target.type }}:{{ target.value }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openDialog(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑规则' : '新建规则'" width="800px" class="route-dialog">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="规则名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入规则名称" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="优先级" prop="priority">
              <el-input-number v-model="form.priority" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="启用状态">
              <el-switch v-model="form.enabled" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="请输入规则描述" />
        </el-form-item>

        <el-divider content-position="left">匹配条件</el-divider>
        <div class="conditions-builder">
          <div v-for="(cond, index) in form.conditions" :key="index" class="condition-item">
            <el-select v-model="cond.type" placeholder="类型" style="width: 120px">
              <el-option value="protocol" label="协议" />
              <el-option value="topic" label="主题" />
              <el-option value="content" label="内容" />
              <el-option value="device" label="设备" />
              <el-option value="time" label="时间" />
            </el-select>
            <el-input v-model="cond.field" placeholder="字段" style="width: 150px" />
            <el-select v-model="cond.operator" placeholder="操作符" style="width: 100px">
              <el-option value="eq" label="等于" />
              <el-option value="ne" label="不等于" />
              <el-option value="contains" label="包含" />
              <el-option value="regex" label="正则" />
              <el-option value="gt" label="大于" />
              <el-option value="lt" label="小于" />
            </el-select>
            <el-input v-model="cond.value" placeholder="值" style="width: 200px" />
            <el-button type="danger" link @click="removeCondition(index)">删除</el-button>
          </div>
          <el-button type="primary" link @click="addCondition">+ 添加条件</el-button>
        </div>

        <el-divider content-position="left">转发目标</el-divider>
        <div class="targets-builder">
          <div v-for="(target, index) in form.targets" :key="index" class="target-item">
            <el-select v-model="target.type" placeholder="类型" style="width: 120px">
              <el-option value="device" label="设备" />
              <el-option value="group" label="设备组" />
              <el-option value="topic" label="主题" />
              <el-option value="webhook" label="Webhook" />
            </el-select>
            <el-input v-model="target.value" placeholder="目标值" style="width: 250px" />
            <el-input v-model="target.transform" placeholder="转换脚本(可选)" style="width: 200px" />
            <el-button type="danger" link @click="removeTarget(index)">删除</el-button>
          </div>
          <el-button type="primary" link @click="addTarget">+ 添加目标</el-button>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getRouteRules, createRouteRule, updateRouteRule, deleteRouteRule } from '@/api/protocol';
import type { RouteRule, RouteCondition, RouteTarget } from '@/types';
import dayjs from 'dayjs';

const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editing = ref(false);
const formRef = ref<FormInstance>();
const rules = ref<RouteRule[]>([]);

const form = reactive({
  id: '',
  name: '',
  priority: 10,
  enabled: true,
  description: '',
  conditions: [] as RouteCondition[],
  targets: [] as RouteTarget[]
});

const formRules: FormRules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  priority: [{ required: true, message: '请输入优先级', trigger: 'blur' }]
};

const getPriorityTag = (p: number) => {
  if (p <= 30) return 'danger';
  if (p <= 60) return 'warning';
  return 'info';
};

const formatTime = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss');

const loadData = async () => {
  loading.value = true;
  try {
    const res = await getRouteRules();
    rules.value = res.list.sort((a, b) => a.priority - b.priority);
  } finally {
    loading.value = false;
  }
};

const addCondition = () => {
  form.conditions.push({ type: 'protocol', operator: 'eq', field: '', value: '' });
};

const removeCondition = (index: number) => {
  form.conditions.splice(index, 1);
};

const addTarget = () => {
  form.targets.push({ type: 'device', value: '', transform: '' });
};

const removeTarget = (index: number) => {
  form.targets.splice(index, 1);
};

const openDialog = (row?: RouteRule) => {
  editing.value = !!row;
  if (row) {
    Object.assign(form, row);
    form.conditions = JSON.parse(JSON.stringify(row.conditions));
    form.targets = JSON.parse(JSON.stringify(row.targets));
  } else {
    Object.assign(form, {
      id: '',
      name: '',
      priority: 10,
      enabled: true,
      description: '',
      conditions: [],
      targets: []
    });
    addCondition();
    addTarget();
  }
  dialogVisible.value = true;
};

const toggleRule = async (row: RouteRule) => {
  try {
    await updateRouteRule(row.id, { enabled: row.enabled });
    ElMessage.success(row.enabled ? '规则已启用' : '规则已禁用');
  } catch (error) {
    row.enabled = !row.enabled;
  }
};

const handleSave = async () => {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
    if (form.conditions.length === 0) {
      ElMessage.warning('请至少添加一个匹配条件');
      return;
    }
    if (form.targets.length === 0) {
      ElMessage.warning('请至少添加一个转发目标');
      return;
    }
    saving.value = true;
    const data = {
      name: form.name,
      priority: form.priority,
      enabled: form.enabled,
      description: form.description,
      conditions: form.conditions,
      targets: form.targets
    };
    if (editing.value) {
      await updateRouteRule(form.id, data);
      ElMessage.success('更新成功');
    } else {
      await createRouteRule(data);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    loadData();
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (row: RouteRule) => {
  try {
    await ElMessageBox.confirm(`确定删除规则 "${row.name}" 吗？`, '提示', { type: 'warning' });
    await deleteRouteRule(row.id);
    ElMessage.success('删除成功');
    loadData();
  } catch {}
};

onMounted(loadData);
</script>

<style scoped>
.route-rules {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.list-card {
  padding: 0;
}

.conditions-preview,
.targets-preview {
  display: flex;
  flex-wrap: wrap;
}

.conditions-builder,
.targets-builder {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.condition-item,
.target-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.route-dialog :deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}
</style>
