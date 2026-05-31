<template>
  <div class="devices-page">
    <div class="page-header">
      <h2>设备管理</h2>
      <div class="header-actions">
        <el-input v-model="searchKeyword" placeholder="搜索设备名称/ID" style="width: 240px; margin-right: 12px" clearable>
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" :icon="Plus" @click="openDialog">添加设备</el-button>
      </div>
    </div>

    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <div class="stat-box">
          <div class="stat-label">设备总数</div>
          <div class="stat-value">{{ devices.length }}</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-box online">
          <div class="stat-label">在线设备</div>
          <div class="stat-value">{{ onlineCount }}</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-box offline">
          <div class="stat-label">离线设备</div>
          <div class="stat-value">{{ offlineCount }}</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-box error">
          <div class="stat-label">异常设备</div>
          <div class="stat-value">{{ errorCount }}</div>
        </div>
      </el-col>
    </el-row>

    <el-card class="list-card">
      <el-table :data="filteredDevices" v-loading="loading">
        <el-table-column prop="name" label="设备名称" min-width="140" />
        <el-table-column prop="type" label="设备类型" width="120" />
        <el-table-column prop="protocol" label="协议" width="100">
          <template #default="{ row }">
            <el-tag :class="`protocol-${row.protocol}`" size="small">{{ row.protocol }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : row.status === 'offline' ? 'info' : 'danger'" size="small">
              {{ row.status === 'online' ? '在线' : row.status === 'offline' ? '离线' : '异常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP地址" width="130" />
        <el-table-column prop="lastHeartbeat" label="最后心跳" width="180">
          <template #default="{ row }">{{ formatTime(row.lastHeartbeat) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="sendCommand(row)">下发指令</el-button>
            <el-button type="primary" link @click="openDialog(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑设备' : '添加设备'" width="600px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="设备名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入设备名称" />
        </el-form-item>
        <el-form-item label="设备类型" prop="type">
          <el-input v-model="form.type" placeholder="如: 传感器、控制器" />
        </el-form-item>
        <el-form-item label="协议类型" prop="protocol">
          <el-select v-model="form.protocol" style="width: 100%">
            <el-option v-for="p in protocolTypes" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="IP地址" prop="ip">
          <el-input v-model="form.ip" placeholder="请输入设备IP" />
        </el-form-item>
        <el-form-item label="元数据">
          <el-input v-model="metadataStr" type="textarea" :rows="4" placeholder="JSON格式的元数据" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="commandDialogVisible" title="下发指令" width="500px">
      <el-form label-width="100px">
        <el-form-item label="目标设备">
          <el-input :value="selectedDevice?.name" disabled />
        </el-form-item>
        <el-form-item label="指令内容">
          <el-input v-model="commandContent" type="textarea" :rows="4" placeholder="请输入指令内容" />
        </el-form-item>
        <el-form-item label="指令格式">
          <el-radio-group v-model="commandFormat">
            <el-radio value="hex">HEX</el-radio>
            <el-radio value="text">文本</el-radio>
            <el-radio value="json">JSON</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="commandDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSendCommand" :loading="sending">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { getDevices, createDevice, updateDevice, deleteDevice, sendCommand } from '@/api/protocol';
import type { Device } from '@/types';
import dayjs from 'dayjs';

const loading = ref(false);
const saving = ref(false);
const sending = ref(false);
const dialogVisible = ref(false);
const commandDialogVisible = ref(false);
const editing = ref(false);
const formRef = ref<FormInstance>();
const devices = ref<Device[]>([]);
const searchKeyword = ref('');
const metadataStr = ref('');
const selectedDevice = ref<Device | null>(null);
const commandContent = ref('');
const commandFormat = ref('text');

const protocolTypes = ['MQTT', 'HTTP', 'TCP', 'UDP', 'WebSocket', 'Modbus', 'BACnet'];

const form = reactive({
  id: '',
  name: '',
  type: '',
  protocol: 'MQTT' as Device['protocol'],
  ip: '',
  metadata: {} as Record<string, any>
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  type: [{ required: true, message: '请输入设备类型', trigger: 'blur' }],
  protocol: [{ required: true, message: '请选择协议类型', trigger: 'change' }]
};

const filteredDevices = computed(() => {
  if (!searchKeyword.value) return devices.value;
  const kw = searchKeyword.value.toLowerCase();
  return devices.value.filter(d =>
    d.name.toLowerCase().includes(kw) || d.id.toLowerCase().includes(kw)
  );
});

const onlineCount = computed(() => devices.value.filter(d => d.status === 'online').length);
const offlineCount = computed(() => devices.value.filter(d => d.status === 'offline').length);
const errorCount = computed(() => devices.value.filter(d => d.status === 'error').length);

const formatTime = (ts?: number) => ts ? dayjs(ts).format('YYYY-MM-DD HH:mm:ss') : '-';

const loadData = async () => {
  loading.value = true;
  try {
    const res = await getDevices();
    devices.value = res.list;
  } finally {
    loading.value = false;
  }
};

const openDialog = (row?: Device) => {
  editing.value = !!row;
  if (row) {
    Object.assign(form, row);
    metadataStr.value = JSON.stringify(row.metadata || {}, null, 2);
  } else {
    Object.assign(form, {
      id: '',
      name: '',
      type: '',
      protocol: 'MQTT',
      ip: '',
      metadata: {}
    });
    metadataStr.value = '{}';
  }
  dialogVisible.value = true;
};

const handleSave = async () => {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
    saving.value = true;
    const data = {
      ...form,
      metadata: JSON.parse(metadataStr.value || '{}')
    };
    if (editing.value) {
      await updateDevice(form.id, data);
      ElMessage.success('更新成功');
    } else {
      await createDevice(data);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    loadData();
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (row: Device) => {
  try {
    await ElMessageBox.confirm(`确定删除设备 "${row.name}" 吗？`, '提示', { type: 'warning' });
    await deleteDevice(row.id);
    ElMessage.success('删除成功');
    loadData();
  } catch {}
};

const sendCommand = (row: Device) => {
  selectedDevice.value = row;
  commandContent.value = '';
  commandDialogVisible.value = true;
};

const handleSendCommand = async () => {
  if (!selectedDevice.value || !commandContent.value) {
    ElMessage.warning('请输入指令内容');
    return;
  }
  sending.value = true;
  try {
    await sendCommand(selectedDevice.value.id, commandContent.value);
    ElMessage.success('指令已发送');
    commandDialogVisible.value = false;
  } finally {
    sending.value = false;
  }
};

onMounted(loadData);
</script>

<style scoped>
.devices-page {
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

.header-actions {
  display: flex;
  align-items: center;
}

.stats-row {
  margin: 0;
}

.stat-box {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  border-left: 4px solid #409eff;
}

.stat-box.online { border-left-color: #67c23a; }
.stat-box.offline { border-left-color: #909399; }
.stat-box.error { border-left-color: #f56c6c; }

.stat-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.list-card {
  padding: 0;
}
</style>
