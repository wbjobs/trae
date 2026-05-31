<template>
  <div class="protocol-config">
    <div class="page-header">
      <h2>协议配置</h2>
      <el-button type="primary" :icon="Plus" @click="openDialog">新建协议</el-button>
    </div>

    <el-card class="list-card">
      <el-table :data="protocols" v-loading="loading">
        <el-table-column prop="name" label="协议名称" min-width="150" />
        <el-table-column prop="type" label="协议类型" width="120">
          <template #default="{ row }">
            <el-tag :class="`protocol-${row.type}`">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="port" label="端口" width="100" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="updatedAt" label="更新时间" width="180">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openDialog(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑协议' : '新建协议'" width="600px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="协议名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入协议名称" />
        </el-form-item>
        <el-form-item label="协议类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择协议类型" style="width: 100%">
            <el-option v-for="t in protocolTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="版本" prop="version">
          <el-input v-model="form.version" placeholder="如: 1.0.0" />
        </el-form-item>
        <el-form-item label="端口" prop="port">
          <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="主机地址" prop="host">
          <el-input v-model="form.host" placeholder="如: 0.0.0.0" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入描述" />
        </el-form-item>
        <el-form-item label="高级配置">
          <el-button type="primary" text @click="showOptions = !showOptions">
            {{ showOptions ? '收起' : '展开' }}
          </el-button>
        </el-form-item>
        <el-form-item v-if="showOptions" label="配置参数">
          <div class="options-editor">
            <div v-for="(opt, key) in form.options" :key="key" class="option-item">
              <el-input v-model="key" placeholder="键名" style="width: 120px" />
              <el-input v-model="form.options[key]" placeholder="值" style="width: 200px" />
              <el-button type="danger" link @click="deleteOption(key)">删除</el-button>
            </div>
            <el-button type="primary" link @click="addOption">+ 添加参数</el-button>
          </div>
        </el-form-item>
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
import { getProtocols, createProtocol, updateProtocol, deleteProtocol } from '@/api/protocol';
import type { ProtocolConfig } from '@/types';
import dayjs from 'dayjs';

const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const showOptions = ref(false);
const editing = ref(false);
const formRef = ref<FormInstance>();
const protocols = ref<ProtocolConfig[]>([]);

const protocolTypes = ['MQTT', 'HTTP', 'TCP', 'UDP', 'WebSocket', 'Modbus', 'BACnet'];

const form = reactive({
  id: '',
  name: '',
  type: 'MQTT' as ProtocolConfig['type'],
  version: '1.0.0',
  description: '',
  port: 1883,
  host: '0.0.0.0',
  options: {} as Record<string, any>
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入协议名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择协议类型', trigger: 'change' }],
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口号', trigger: 'blur' }]
};

const formatTime = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss');

const loadData = async () => {
  loading.value = true;
  try {
    const res = await getProtocols();
    protocols.value = res.list;
  } finally {
    loading.value = false;
  }
};

const openDialog = (row?: ProtocolConfig) => {
  editing.value = !!row;
  showOptions.value = false;
  if (row) {
    Object.assign(form, row);
    form.options = { ...row.options };
  } else {
    Object.assign(form, {
      id: '',
      name: '',
      type: 'MQTT',
      version: '1.0.0',
      description: '',
      port: 1883,
      host: '0.0.0.0',
      options: {}
    });
  }
  dialogVisible.value = true;
};

const addOption = () => {
  form.options[''] = '';
};

const deleteOption = (key: string) => {
  delete form.options[key];
};

const handleSave = async () => {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
    saving.value = true;
    if (editing.value) {
      await updateProtocol(form.id, form);
      ElMessage.success('更新成功');
    } else {
      await createProtocol(form);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    loadData();
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (row: ProtocolConfig) => {
  try {
    await ElMessageBox.confirm(`确定删除协议 "${row.name}" 吗？`, '提示', { type: 'warning' });
    await deleteProtocol(row.id);
    ElMessage.success('删除成功');
    loadData();
  } catch {}
};

onMounted(loadData);
</script>

<style scoped>
.protocol-config {
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

.options-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
