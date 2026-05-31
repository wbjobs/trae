<template>
  <div class="logs-page">
    <div class="page-header">
      <h2>日志中心</h2>
      <div class="header-actions">
        <el-radio-group v-model="logType" size="default">
          <el-radio-button value="parse">解析日志</el-radio-button>
          <el-radio-button value="forward">转发日志</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <el-card class="filter-card">
      <el-form :inline="true" :model="filterForm" label-width="80px">
        <el-form-item label="协议">
          <el-select v-model="filterForm.protocol" clearable placeholder="全部">
            <el-option v-for="p in protocols" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" clearable placeholder="全部">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="设备ID">
          <el-input v-model="filterForm.deviceId" placeholder="请输入设备ID" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">查询</el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="list-card">
      <el-table :data="logs" v-loading="loading" max-height="500">
        <template v-if="logType === 'parse'">
          <el-table-column prop="protocol" label="协议" width="100">
            <template #default="{ row }">
              <el-tag :class="`protocol-${row.protocol}`" size="small">{{ row.protocol }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="deviceId" label="设备ID" width="140" />
          <el-table-column prop="success" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'" size="small">
                {{ row.success ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="原始数据" min-width="200">
            <template #default="{ row }">
              <span class="raw-data">{{ row.rawData }}</span>
            </template>
          </el-table-column>
          <el-table-column label="解析结果" min-width="250">
            <template #default="{ row }">
              <div class="parsed-data">
                <pre v-if="row.success">{{ JSON.stringify(row.parsedData, null, 2) }}</pre>
                <span v-else class="error-text">{{ row.error }}</span>
              </div>
            </template>
          </el-table-column>
        </template>
        <template v-else>
          <el-table-column prop="messageId" label="消息ID" width="200" />
          <el-table-column prop="sourceDevice" label="源设备" width="140" />
          <el-table-column label="目标" min-width="150">
            <template #default="{ row }">
              <el-tag size="small">{{ row.targetType }}:{{ row.targetValue }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="success" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'" size="small">
                {{ row.success ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="error" label="错误信息" min-width="150">
            <template #default="{ row }">
              <span v-if="row.error" class="error-text">{{ row.error }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </template>
        <el-table-column prop="timestamp" label="时间" width="180" fixed="right">
          <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { getParseLogs, getForwardLogs } from '@/api/protocol';
import type { ParsedMessage, ForwardLog } from '@/types';
import dayjs from 'dayjs';

const loading = ref(false);
const logType = ref<'parse' | 'forward'>('parse');
const logs = ref<(ParsedMessage | ForwardLog)[]>([]);
const protocols = ['MQTT', 'HTTP', 'TCP', 'UDP', 'WebSocket', 'Modbus', 'BACnet'];

const filterForm = reactive({
  protocol: '',
  status: '',
  deviceId: ''
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

const formatTime = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss');

const loadData = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      protocol: filterForm.protocol,
      deviceId: filterForm.deviceId
    };
    const res = logType.value === 'parse' ? await getParseLogs(params) : await getForwardLogs(params);
    logs.value = res.list;
    pagination.total = res.total;
  } finally {
    loading.value = false;
  }
};

const resetFilter = () => {
  filterForm.protocol = '';
  filterForm.status = '';
  filterForm.deviceId = '';
  pagination.page = 1;
  loadData();
};

watch(logType, () => {
  pagination.page = 1;
  loadData();
});

onMounted(loadData);
</script>

<style scoped>
.logs-page {
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

.filter-card {
  padding: 16px 20px;
}

.list-card {
  padding: 0;
}

.raw-data {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #606266;
}

.parsed-data pre {
  margin: 0;
  font-size: 11px;
  max-height: 80px;
  overflow: auto;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
}

.error-text {
  color: #f56c6c;
  font-size: 12px;
}

.pagination {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
