<template>
  <div class="dashboard">
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon"><el-icon :size="32"><Monitor /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalDevices }}</div>
            <div class="stat-label">设备总数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card success">
          <div class="stat-icon"><el-icon :size="32"><CircleCheck /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.onlineDevices }}</div>
            <div class="stat-label">在线设备</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card warning">
          <div class="stat-icon"><el-icon :size="32"><Message /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.todayMessages }}</div>
            <div class="stat-label">今日报文</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card info">
          <div class="stat-icon"><el-icon :size="32"><Connection /></el-icon></div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.protocols }}</div>
            <div class="stat-label">协议类型</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="16">
        <div class="card">
          <div class="card-header">
            <h3>报文流量趋势</h3>
            <el-radio-group v-model="timeRange" size="small">
              <el-radio-button value="1h">1小时</el-radio-button>
              <el-radio-button value="6h">6小时</el-radio-button>
              <el-radio-button value="24h">24小时</el-radio-button>
            </el-radio-group>
          </div>
          <div ref="chartRef" class="chart-container"></div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="card">
          <div class="card-header">
            <h3>协议分布</h3>
          </div>
          <div ref="pieChartRef" class="pie-chart-container"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <h3>最近解析日志</h3>
            <el-button type="primary" link @click="$router.push('/logs')">查看全部</el-button>
          </div>
          <el-table :data="recentLogs" style="width: 100%" size="small">
            <el-table-column prop="protocol" label="协议" width="100">
              <template #default="{ row }">
                <el-tag :class="`protocol-${row.protocol}`" size="small">{{ row.protocol }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="deviceId" label="设备ID" width="120" />
            <el-table-column prop="success" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.success ? 'success' : 'danger'" size="small">
                  {{ row.success ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="timestamp" label="时间">
              <template #default="{ row }">{{ formatTime(row.timestamp) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <h3>在线设备</h3>
            <el-button type="primary" link @click="$router.push('/devices')">查看全部</el-button>
          </div>
          <el-table :data="onlineDevices" style="width: 100%" size="small">
            <el-table-column prop="name" label="设备名称" width="140" />
            <el-table-column prop="protocol" label="协议" width="100">
              <template #default="{ row }">
                <el-tag :class="`protocol-${row.protocol}`" size="small">{{ row.protocol }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP地址" width="130" />
            <el-table-column prop="lastHeartbeat" label="心跳时间">
              <template #default="{ row }">{{ formatTime(row.lastHeartbeat) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import { Monitor, CircleCheck, Message, Connection } from '@element-plus/icons-vue';
import { getStatistics, getParseLogs, getDevices } from '@/api/protocol';
import type { ParsedMessage, Device } from '@/types';
import dayjs from 'dayjs';

const stats = ref({
  totalDevices: 0,
  onlineDevices: 0,
  totalMessages: 0,
  todayMessages: 0,
  protocols: 0,
  routes: 0
});

const timeRange = ref('1h');
const chartRef = ref<HTMLElement>();
const pieChartRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;
let pieChart: echarts.ECharts | null = null;

const recentLogs = ref<ParsedMessage[]>([]);
const onlineDevices = ref<Device[]>([]);

const formatTime = (ts?: number) => {
  if (!ts) return '-';
  return dayjs(ts).format('HH:mm:ss');
};

const loadData = async () => {
  try {
    const [statData, logData, deviceData] = await Promise.all([
      getStatistics(),
      getParseLogs({ pageSize: 5 }),
      getDevices()
    ]);
    stats.value = statData;
    recentLogs.value = logData.list;
    onlineDevices.value = deviceData.list.filter(d => d.status === 'online').slice(0, 5);
    updateChart();
    updatePieChart();
  } catch (error) {
    console.error('加载数据失败:', error);
  }
};

const updateChart = () => {
  if (!chartRef.value) return;
  const hours = timeRange.value === '1h' ? 1 : timeRange.value === '6h' ? 6 : 24;
  const points = hours * 6;
  const xData = Array.from({ length: points }, (_, i) => {
    return dayjs().subtract(points - i - 1, '10minute').format('HH:mm');
  });
  const yData = Array.from({ length: points }, () => Math.floor(Math.random() * 100) + 20);

  chart!.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: xData },
    yAxis: { type: 'value' },
    series: [{
      name: '报文数',
      type: 'line',
      smooth: true,
      areaStyle: { opacity: 0.3 },
      data: yData,
      itemStyle: { color: '#667eea' }
    }]
  });
};

const updatePieChart = () => {
  if (!pieChartRef.value) return;
  pieChart!.setOption({
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', right: '5%', top: 'center' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      data: [
        { value: 35, name: 'MQTT' },
        { value: 25, name: 'HTTP' },
        { value: 20, name: 'TCP' },
        { value: 12, name: 'Modbus' },
        { value: 8, name: '其他' }
      ]
    }]
  });
};

let timer: NodeJS.Timeout;

onMounted(() => {
  chart = echarts.init(chartRef.value!);
  pieChart = echarts.init(pieChartRef.value!);
  loadData();
  timer = setInterval(loadData, 5000);
});

onUnmounted(() => {
  clearInterval(timer);
  chart?.dispose();
  pieChart?.dispose();
});

watch(timeRange, updateChart);
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stat-row {
  margin-bottom: 0;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stat-card.success {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.stat-card.warning {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.stat-card.info {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.stat-icon {
  opacity: 0.9;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
  margin-top: 4px;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.chart-container {
  height: 300px;
}

.pie-chart-container {
  height: 300px;
}
</style>
