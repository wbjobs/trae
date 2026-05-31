<template>
  <div class="dashboard-container">
    <div class="page-header">
      <h2 class="page-title">
        <el-icon size="24" color="#409eff"><Odometer /></el-icon>
        设备运行看板
      </h2>
      <div class="header-actions">
        <el-select v-model="factoryFilter" placeholder="选择厂区" class="filter-select" @change="handleFactoryChange">
          <el-option label="全部厂区" value="" />
          <el-option label="厂区A" value="factory-a" />
          <el-option label="厂区B" value="factory-b" />
          <el-option label="厂区C" value="factory-c" />
        </el-select>
        <el-button type="primary" @click="refreshData">
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
      </div>
    </div>

    <div class="stats-cards">
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="stat-card online">
            <div class="stat-icon">
              <el-icon :size="32"><Connection /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.onlineCount }}</div>
              <div class="stat-label">在线设备</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card offline">
            <div class="stat-icon">
              <el-icon :size="32"><Close /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.offlineCount }}</div>
              <div class="stat-label">离线设备</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card warning">
            <div class="stat-icon">
              <el-icon :size="32"><Warning /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.warningCount }}</div>
              <div class="stat-label">告警设备</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card total">
            <div class="stat-icon">
              <el-icon :size="32"><Cpu /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats.totalCount }}</div>
              <div class="stat-label">设备总数</div>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="12">
        <div class="chart-card">
          <div class="chart-header">
            <h3>设备运行状态分布</h3>
          </div>
          <div ref="statusChartRef" class="chart-container"></div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="chart-card">
          <div class="chart-header">
            <h3>数据上报趋势 (24h)</h3>
          </div>
          <div ref="trendChartRef" class="chart-container"></div>
        </div>
      </el-col>
    </el-row>

    <div class="device-list-card">
      <div class="card-header">
        <h3>设备列表</h3>
        <div class="search-box">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索设备名称/编号"
            prefix-icon="Search"
            clearable
            class="search-input"
          />
        </div>
      </div>
      <el-table :data="filteredDevices" stripe v-loading="loading">
        <el-table-column prop="deviceId" label="设备编号" width="140" />
        <el-table-column prop="deviceName" label="设备名称" min-width="160" />
        <el-table-column prop="factory" label="所属厂区" width="120">
          <template #default="{ row }">
            <el-tag :type="getFactoryTagType(row.factory)">{{ getFactoryName(row.factory) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="运行状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)" effect="dark">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="temperature" label="温度(°C)" width="100">
          <template #default="{ row }">
            <span :class="getValueClass(row.temperature, 80)">{{ row.temperature?.toFixed(1) || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="pressure" label="压力(MPa)" width="100">
          <template #default="{ row }">
            <span :class="getValueClass(row.pressure, 1.6)">{{ row.pressure?.toFixed(2) || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="lastReport" label="最后上报" width="180">
          <template #default="{ row }">
            {{ formatTime(row.lastReport) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text @click="viewDetail(row)">详情</el-button>
            <el-button type="danger" text @click="controlDevice(row)">控制</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="filteredDevices.length"
        class="pagination"
        layout="total, sizes, prev, pager, next, jumper"
      />
    </div>

    <el-dialog v-model="detailVisible" title="设备详情" width="800px">
      <el-tabs v-model="detailTab" class="detail-tabs">
        <el-tab-pane label="基本信息" name="basic">
          <el-descriptions :column="2" border v-if="selectedDevice">
            <el-descriptions-item label="设备编号">{{ selectedDevice.deviceId }}</el-descriptions-item>
            <el-descriptions-item label="设备名称">{{ selectedDevice.deviceName }}</el-descriptions-item>
            <el-descriptions-item label="所属厂区">{{ getFactoryName(selectedDevice.factory) }}</el-descriptions-item>
            <el-descriptions-item label="运行状态">
              <el-tag :type="getStatusTagType(selectedDevice.status)" effect="dark">
                {{ getStatusText(selectedDevice.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="当前温度">{{ selectedDevice.temperature?.toFixed(1) }} °C</el-descriptions-item>
            <el-descriptions-item label="当前压力">{{ selectedDevice.pressure?.toFixed(2) }} MPa</el-descriptions-item>
            <el-descriptions-item label="运行时长">{{ selectedDevice.runtime || '0' }} 小时</el-descriptions-item>
            <el-descriptions-item label="最后上报">{{ formatTime(selectedDevice.lastReport) }}</el-descriptions-item>
          </el-descriptions>
          <div ref="detailChartRef" class="detail-chart"></div>
        </el-tab-pane>

        <el-tab-pane label="协议数据" name="protocol">
          <ProtocolDataViewer
            ref="protocolViewerRef"
            :raw-data="protocolRawData"
            :protocol-data="protocolData"
            :device-id="selectedDevice?.deviceId"
          />
        </el-tab-pane>

        <el-tab-pane label="缓存状态" name="cache">
          <div class="cache-status" v-if="cacheStats">
            <el-row :gutter="20">
              <el-col :span="8">
                <el-card shadow="hover">
                  <div class="cache-stat">
                    <div class="stat-label">内存缓存</div>
                    <div class="stat-value">{{ cacheStats.memoryCount }}</div>
                    <div class="stat-desc">条消息</div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card shadow="hover">
                  <div class="cache-stat">
                    <div class="stat-label">文件缓存</div>
                    <div class="stat-value">{{ cacheStats.fileCount }}</div>
                    <div class="stat-desc">条消息</div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card shadow="hover">
                  <div class="cache-stat">
                    <div class="stat-label">总计</div>
                    <div class="stat-value">{{ cacheStats.totalCount }}</div>
                    <div class="stat-desc">条消息</div>
                  </div>
                </el-card>
              </el-col>
            </el-row>
            <div class="cache-actions">
              <el-button type="primary" @click="resendCache" :loading="resending">
                <el-icon><RefreshRight /></el-icon>
                补发缓存消息
              </el-button>
              <el-button type="danger" @click="clearCache" :loading="clearing">
                <el-icon><Delete /></el-icon>
                清理缓存
              </el-button>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { getDeviceListApi, getDeviceStatsApi, getDeviceMetricsApi, getDeviceCacheApi, clearDeviceCacheApi, resendDeviceCacheApi } from './api/device'
import { io } from 'socket.io-client'
import dayjs from 'dayjs'
import ProtocolDataViewer from './components/ProtocolDataViewer.vue'

const loading = ref(false)
const factoryFilter = ref('')
const searchKeyword = ref('')
const stats = ref({
  onlineCount: 0,
  offlineCount: 0,
  warningCount: 0,
  totalCount: 0
})
const devices = ref([])
const pagination = ref({
  page: 1,
  pageSize: 10
})
const detailVisible = ref(false)
const detailTab = ref('basic')
const selectedDevice = ref(null)
const statusChartRef = ref(null)
const trendChartRef = ref(null)
const detailChartRef = ref(null)
const protocolViewerRef = ref(null)

const protocolRawData = ref(null)
const protocolData = ref(null)
const cacheStats = ref(null)
const resending = ref(false)
const clearing = ref(false)

let statusChart = null
let trendChart = null
let detailChart = null
let socket = null

const filteredDevices = computed(() => {
  let result = devices.value
  if (factoryFilter.value) {
    result = result.filter(d => d.factory === factoryFilter.value)
  }
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(d =>
      d.deviceId.toLowerCase().includes(keyword) ||
      d.deviceName.toLowerCase().includes(keyword)
    )
  }
  return result
})

const getFactoryName = (factory) => {
  const map = { 'factory-a': '厂区A', 'factory-b': '厂区B', 'factory-c': '厂区C' }
  return map[factory] || factory
}

const getFactoryTagType = (factory) => {
  const map = { 'factory-a': 'primary', 'factory-b': 'success', 'factory-c': 'warning' }
  return map[factory] || 'info'
}

const getStatusText = (status) => {
  const map = { online: '在线', offline: '离线', warning: '告警' }
  return map[status] || status
}

const getStatusTagType = (status) => {
  const map = { online: 'success', offline: 'danger', warning: 'warning' }
  return map[status] || 'info'
}

const getValueClass = (value, threshold) => {
  if (value > threshold) return 'text-red-500 font-bold'
  return ''
}

const formatTime = (time) => {
  if (!time) return '--'
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

const initCharts = () => {
  if (statusChartRef.value) {
    statusChart = echarts.init(statusChartRef.value)
    statusChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: '5%', left: 'center' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        data: [
          { value: stats.value.onlineCount, name: '在线', itemStyle: { color: '#67c23a' } },
          { value: stats.value.offlineCount, name: '离线', itemStyle: { color: '#f56c6c' } },
          { value: stats.value.warningCount, name: '告警', itemStyle: { color: '#e6a23c' } }
        ]
      }]
    })
  }

  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value)
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`)
    trendChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['数据上报量', '告警数'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: hours },
      yAxis: { type: 'value' },
      series: [
        {
          name: '数据上报量',
          type: 'line',
          smooth: true,
          data: Array.from({ length: 24 }, () => Math.floor(Math.random() * 500 + 200)),
          areaStyle: { opacity: 0.3 }
        },
        {
          name: '告警数',
          type: 'line',
          smooth: true,
          data: Array.from({ length: 24 }, () => Math.floor(Math.random() * 20)),
          itemStyle: { color: '#f56c6c' }
        }
      ]
    })
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const [statsRes, devicesRes] = await Promise.all([
      getDeviceStatsApi(),
      getDeviceListApi()
    ])
    stats.value = statsRes.data
    devices.value = devicesRes.data
    nextTick(() => {
      initCharts()
    })
  } catch (error) {
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const refreshData = () => {
  loadData()
  ElMessage.success('数据已刷新')
}

const handleFactoryChange = () => {
  pagination.value.page = 1
}

const viewDetail = async (row) => {
  selectedDevice.value = row
  detailVisible.value = true
  detailTab.value = 'basic'

  protocolRawData.value = null
  protocolData.value = null
  cacheStats.value = null

  try {
    const [metricsRes, cacheRes] = await Promise.all([
      getDeviceMetricsApi(row.deviceId),
      getDeviceCacheApi(row.deviceId)
    ])
    
    cacheStats.value = cacheRes.data

    await nextTick()
    if (detailChartRef.value) {
      detailChart = echarts.init(detailChartRef.value)
      detailChart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['温度(°C)', '压力(MPa)'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: metricsRes.data.timestamps },
        yAxis: [
          { type: 'value', name: '温度', position: 'left' },
          { type: 'value', name: '压力', position: 'right' }
        ],
        series: [
          {
            name: '温度(°C)',
            type: 'line',
            smooth: true,
            data: metricsRes.data.temperatures,
            itemStyle: { color: '#f56c6c' }
          },
          {
            name: '压力(MPa)',
            type: 'line',
            smooth: true,
            yAxisIndex: 1,
            data: metricsRes.data.pressures,
            itemStyle: { color: '#409eff' }
          }
        ]
      })
    }
  } catch (error) {
    console.error('加载指标数据失败', error)
  }
}

const resendCache = async () => {
  if (!selectedDevice.value) return
  resending.value = true
  try {
    await resendDeviceCacheApi(selectedDevice.value.deviceId)
    ElMessage.success('补发指令已发送')
    const res = await getDeviceCacheApi(selectedDevice.value.deviceId)
    cacheStats.value = res.data
  } catch (error) {
    ElMessage.error('补发失败')
  } finally {
    resending.value = false
  }
}

const clearCache = async () => {
  if (!selectedDevice.value) return
  clearing.value = true
  try {
    await clearDeviceCacheApi(selectedDevice.value.deviceId)
    ElMessage.success('缓存已清理')
    cacheStats.value = { memoryCount: 0, fileCount: 0, totalCount: 0 }
  } catch (error) {
    ElMessage.error('清理失败')
  } finally {
    clearing.value = false
  }
}

const controlDevice = (row) => {
  ElMessage.info(`设备控制功能: ${row.deviceName}`)
}

const initWebSocket = () => {
  socket = io('ws://localhost:3001', {
    transports: ['websocket']
  })

  socket.on('device:update', (data) => {
    const device = devices.value.find(d => d.deviceId === data.deviceId)
    if (device) {
      Object.assign(device, data)
    }
  })
}

onMounted(() => {
  loadData()
  initWebSocket()

  window.addEventListener('resize', () => {
    statusChart?.resize()
    trendChart?.resize()
    detailChart?.resize()
  })
})

onUnmounted(() => {
  statusChart?.dispose()
  trendChart?.dispose()
  detailChart?.dispose()
  socket?.disconnect()
})
</script>

<style lang="scss" scoped>
.dashboard-container {
  padding: 0;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .page-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 20px;
      color: #1f2937;
    }

    .header-actions {
      display: flex;
      gap: 12px;

      .filter-select {
        width: 160px;
      }
    }
  }

  .stats-cards {
    margin-bottom: 20px;

    .stat-card {
      display: flex;
      align-items: center;
      padding: 24px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

      &.online {
        border-left: 4px solid #67c23a;
        .stat-icon { color: #67c23a; }
      }
      &.offline {
        border-left: 4px solid #f56c6c;
        .stat-icon { color: #f56c6c; }
      }
      &.warning {
        border-left: 4px solid #e6a23c;
        .stat-icon { color: #e6a23c; }
      }
      &.total {
        border-left: 4px solid #409eff;
        .stat-icon { color: #409eff; }
      }

      .stat-icon {
        margin-right: 16px;
      }

      .stat-content {
        .stat-value {
          font-size: 28px;
          font-weight: bold;
          color: #1f2937;
        }
        .stat-label {
          font-size: 14px;
          color: #6b7280;
          margin-top: 4px;
        }
      }
    }
  }

  .charts-row {
    margin-bottom: 20px;

    .chart-card {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

      .chart-header {
        margin-bottom: 16px;

        h3 {
          margin: 0;
          font-size: 16px;
          color: #1f2937;
        }
      }

      .chart-container {
        height: 300px;
      }
    }
  }

  .device-list-card {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 16px;
        color: #1f2937;
      }

      .search-input {
        width: 280px;
      }
    }

    .pagination {
      margin-top: 16px;
      justify-content: flex-end;
    }
  }

  .detail-chart {
    height: 280px;
    margin-top: 20px;
  }

  .detail-tabs {
    :deep(.el-tabs__content) {
      padding-top: 16px;
    }
  }

  .cache-status {
    .cache-stat {
      text-align: center;
      padding: 20px 0;

      .stat-label {
        font-size: 14px;
        color: #6b7280;
        margin-bottom: 8px;
      }

      .stat-value {
        font-size: 32px;
        font-weight: bold;
        color: #409eff;
      }

      .stat-desc {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
      }
    }

    .cache-actions {
      margin-top: 24px;
      display: flex;
      justify-content: center;
      gap: 16px;
    }
  }
}
</style>
