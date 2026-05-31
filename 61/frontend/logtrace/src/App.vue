<template>
  <div class="logtrace-container">
    <div class="page-header">
      <h2 class="page-title">
        <el-icon size="24" color="#409eff"><Document /></el-icon>
        日志溯源系统
      </h2>
      <div class="header-actions">
        <el-button type="primary" @click="exportLogs">
          <el-icon><Download /></el-icon>
          导出日志
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="log-tabs">
      <el-tab-pane label="设备运行日志" name="device">
        <div class="filter-bar">
          <el-form :inline="true" :model="deviceFilter" class="filter-form">
            <el-form-item label="设备编号">
              <el-input v-model="deviceFilter.deviceId" placeholder="请输入设备编号" clearable />
            </el-form-item>
            <el-form-item label="日志级别">
              <el-select v-model="deviceFilter.level" placeholder="全部级别" clearable>
                <el-option label="信息" value="info" />
                <el-option label="警告" value="warning" />
                <el-option label="错误" value="error" />
                <el-option label="致命" value="fatal" />
              </el-select>
            </el-form-item>
            <el-form-item label="时间范围">
              <el-date-picker
                v-model="deviceFilter.timeRange"
                type="datetimerange"
                range-separator="至"
                start-placeholder="开始时间"
                end-placeholder="结束时间"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="searchDeviceLogs">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
              <el-button @click="resetDeviceFilter">重置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="log-card">
          <el-table :data="deviceLogs" stripe v-loading="deviceLoading" height="500">
            <el-table-column prop="timestamp" label="时间" width="180" />
            <el-table-column prop="deviceId" label="设备编号" width="140" />
            <el-table-column prop="deviceName" label="设备名称" width="160" />
            <el-table-column prop="level" label="级别" width="80">
              <template #default="{ row }">
                <el-tag :type="getLevelTagType(row.level)" effect="dark" size="small">
                  {{ getLevelText(row.level) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="module" label="模块" width="120" />
            <el-table-column prop="content" label="日志内容" min-width="300" show-overflow-tooltip />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" text @click="viewLogDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-model:current-page="devicePagination.page"
            v-model:page-size="devicePagination.pageSize"
            :total="devicePagination.total"
            class="pagination"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="searchDeviceLogs"
            @current-change="searchDeviceLogs"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="离线溯源记录" name="offline">
        <div class="filter-bar">
          <el-form :inline="true" :model="offlineFilter" class="filter-form">
            <el-form-item label="设备编号">
              <el-input v-model="offlineFilter.deviceId" placeholder="请输入设备编号" clearable />
            </el-form-item>
            <el-form-item label="所属厂区">
              <el-select v-model="offlineFilter.factory" placeholder="全部厂区" clearable>
                <el-option label="厂区A" value="factory-a" />
                <el-option label="厂区B" value="factory-b" />
                <el-option label="厂区C" value="factory-c" />
              </el-select>
            </el-form-item>
            <el-form-item label="离线时长">
              <el-select v-model="offlineFilter.duration" placeholder="全部时长" clearable>
                <el-option label="30分钟内" value="30" />
                <el-option label="1小时内" value="60" />
                <el-option label="24小时内" value="1440" />
                <el-option label="超过24小时" value="1440+" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="searchOfflineLogs">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
              <el-button @click="resetOfflineFilter">重置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="log-card">
          <el-table :data="offlineLogs" stripe v-loading="offlineLoading" height="500">
            <el-table-column prop="deviceId" label="设备编号" width="140" />
            <el-table-column prop="deviceName" label="设备名称" width="160" />
            <el-table-column prop="factory" label="所属厂区" width="120">
              <template #default="{ row }">
                <el-tag :type="getFactoryTagType(row.factory)">{{ getFactoryName(row.factory) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="offlineTime" label="离线时间" width="180" />
            <el-table-column prop="lastOnlineTime" label="最后在线时间" width="180" />
            <el-table-column prop="offlineDuration" label="离线时长" width="120" />
            <el-table-column prop="lastHeartbeat" label="最后心跳" width="180" />
            <el-table-column prop="offlineReason" label="离线原因" min-width="150" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'recovered' ? 'success' : 'warning'" effect="dark" size="small">
                  {{ row.status === 'recovered' ? '已恢复' : '离线中' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" text @click="traceOffline(row)">溯源分析</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-model:current-page="offlinePagination.page"
            v-model:page-size="offlinePagination.pageSize"
            :total="offlinePagination.total"
            class="pagination"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="操作审计日志" name="audit">
        <div class="filter-bar">
          <el-form :inline="true" :model="auditFilter" class="filter-form">
            <el-form-item label="操作用户">
              <el-input v-model="auditFilter.username" placeholder="请输入用户名" clearable />
            </el-form-item>
            <el-form-item label="操作类型">
              <el-select v-model="auditFilter.action" placeholder="全部类型" clearable>
                <el-option label="登录" value="login" />
                <el-option label="登出" value="logout" />
                <el-option label="设备控制" value="device_control" />
                <el-option label="权限修改" value="permission_change" />
                <el-option label="配置修改" value="config_change" />
                <el-option label="数据导出" value="data_export" />
              </el-select>
            </el-form-item>
            <el-form-item label="时间范围">
              <el-date-picker
                v-model="auditFilter.timeRange"
                type="datetimerange"
                range-separator="至"
                start-placeholder="开始时间"
                end-placeholder="结束时间"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="searchAuditLogs">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
              <el-button @click="resetAuditFilter">重置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="log-card">
          <el-table :data="auditLogs" stripe v-loading="auditLoading" height="500">
            <el-table-column prop="timestamp" label="操作时间" width="180" />
            <el-table-column prop="username" label="操作用户" width="120" />
            <el-table-column prop="action" label="操作类型" width="140">
              <template #default="{ row }">
                {{ getActionText(row.action) }}
              </template>
            </el-table-column>
            <el-table-column prop="module" label="操作模块" width="140" />
            <el-table-column prop="description" label="操作描述" min-width="250" show-overflow-tooltip />
            <el-table-column prop="ip" label="IP地址" width="140" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.success ? 'success' : 'danger'" effect="dark" size="small">
                  {{ row.success ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-model:current-page="auditPagination.page"
            v-model:page-size="auditPagination.pageSize"
            :total="auditPagination.total"
            class="pagination"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="detailVisible" title="日志详情" width="800px">
      <el-descriptions :column="2" border v-if="selectedLog">
        <el-descriptions-item label="日志时间">{{ selectedLog.timestamp }}</el-descriptions-item>
        <el-descriptions-item label="日志级别">
          <el-tag :type="getLevelTagType(selectedLog.level)" effect="dark">
            {{ getLevelText(selectedLog.level) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="设备编号">{{ selectedLog.deviceId }}</el-descriptions-item>
        <el-descriptions-item label="设备名称">{{ selectedLog.deviceName }}</el-descriptions-item>
        <el-descriptions-item label="所属模块">{{ selectedLog.module }}</el-descriptions-item>
        <el-descriptions-item label="日志来源">{{ selectedLog.source }}</el-descriptions-item>
        <el-descriptions-item label="日志内容" :span="2">
          <pre class="log-content">{{ selectedLog.content }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="原始数据" :span="2" v-if="selectedLog.rawData">
          <pre class="log-content">{{ JSON.stringify(selectedLog.rawData, null, 2) }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-dialog v-model="traceVisible" title="离线溯源分析" width="900px">
      <div class="trace-analysis" v-if="traceData">
        <el-steps :active="3" finish-status="success" process-status="process">
          <el-step title="心跳检测" description="检测心跳包" />
          <el-step title="网络分析" description="分析网络连接" />
          <el-step title="原因诊断" description="诊断离线原因" />
          <el-step title="恢复建议" description="生成恢复方案" />
        </el-steps>

        <div class="trace-details">
          <div class="trace-section">
            <h4>设备基本信息</h4>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="设备编号">{{ traceData.deviceId }}</el-descriptions-item>
              <el-descriptions-item label="设备名称">{{ traceData.deviceName }}</el-descriptions-item>
              <el-descriptions-item label="最后在线">{{ traceData.lastOnlineTime }}</el-descriptions-item>
              <el-descriptions-item label="离线时长">{{ traceData.offlineDuration }}</el-descriptions-item>
            </el-descriptions>
          </div>

          <div class="trace-section">
            <h4>离线原因分析</h4>
            <el-alert
              :title="traceData.analysis.reason"
              :type="traceData.analysis.severity"
              show-icon
            >
              <p>置信度: {{ traceData.analysis.confidence }}%</p>
              <p>{{ traceData.analysis.detail }}</p>
            </el-alert>
          </div>

          <div class="trace-section">
            <h4>恢复建议</h4>
            <el-timeline>
              <el-timeline-item
                v-for="(suggestion, index) in traceData.suggestions"
                :key="index"
                :type="suggestion.type"
              >
                <h5>{{ suggestion.title }}</h5>
                <p>{{ suggestion.description }}</p>
              </el-timeline-item>
            </el-timeline>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getDeviceLogsApi, getOfflineLogsApi, getAuditLogsApi, getTraceAnalysisApi } from './api/log'

const activeTab = ref('device')
const detailVisible = ref(false)
const traceVisible = ref(false)
const selectedLog = ref(null)
const traceData = ref(null)

const deviceFilter = reactive({
  deviceId: '',
  level: '',
  timeRange: []
})
const deviceLogs = ref([])
const deviceLoading = ref(false)
const devicePagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const offlineFilter = reactive({
  deviceId: '',
  factory: '',
  duration: ''
})
const offlineLogs = ref([])
const offlineLoading = ref(false)
const offlinePagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const auditFilter = reactive({
  username: '',
  action: '',
  timeRange: []
})
const auditLogs = ref([])
const auditLoading = ref(false)
const auditPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const getLevelText = (level) => {
  const map = { info: '信息', warning: '警告', error: '错误', fatal: '致命' }
  return map[level] || level
}

const getLevelTagType = (level) => {
  const map = { info: 'info', warning: 'warning', error: 'danger', fatal: 'danger' }
  return map[level] || 'info'
}

const getFactoryName = (factory) => {
  const map = { 'factory-a': '厂区A', 'factory-b': '厂区B', 'factory-c': '厂区C' }
  return map[factory] || factory
}

const getFactoryTagType = (factory) => {
  const map = { 'factory-a': 'primary', 'factory-b': 'success', 'factory-c': 'warning' }
  return map[factory] || 'info'
}

const getActionText = (action) => {
  const map = {
    login: '登录',
    logout: '登出',
    device_control: '设备控制',
    permission_change: '权限修改',
    config_change: '配置修改',
    data_export: '数据导出'
  }
  return map[action] || action
}

const searchDeviceLogs = async () => {
  deviceLoading.value = true
  try {
    const res = await getDeviceLogsApi({
      ...deviceFilter,
      page: devicePagination.page,
      pageSize: devicePagination.pageSize
    })
    deviceLogs.value = res.data.list
    devicePagination.total = res.data.total
  } catch (error) {
    ElMessage.error('查询设备日志失败')
  } finally {
    deviceLoading.value = false
  }
}

const resetDeviceFilter = () => {
  deviceFilter.deviceId = ''
  deviceFilter.level = ''
  deviceFilter.timeRange = []
  devicePagination.page = 1
  searchDeviceLogs()
}

const searchOfflineLogs = async () => {
  offlineLoading.value = true
  try {
    const res = await getOfflineLogsApi({
      ...offlineFilter,
      page: offlinePagination.page,
      pageSize: offlinePagination.pageSize
    })
    offlineLogs.value = res.data.list
    offlinePagination.total = res.data.total
  } catch (error) {
    ElMessage.error('查询离线记录失败')
  } finally {
    offlineLoading.value = false
  }
}

const resetOfflineFilter = () => {
  offlineFilter.deviceId = ''
  offlineFilter.factory = ''
  offlineFilter.duration = ''
  offlinePagination.page = 1
  searchOfflineLogs()
}

const searchAuditLogs = async () => {
  auditLoading.value = true
  try {
    const res = await getAuditLogsApi({
      ...auditFilter,
      page: auditPagination.page,
      pageSize: auditPagination.pageSize
    })
    auditLogs.value = res.data.list
    auditPagination.total = res.data.total
  } catch (error) {
    ElMessage.error('查询审计日志失败')
  } finally {
    auditLoading.value = false
  }
}

const resetAuditFilter = () => {
  auditFilter.username = ''
  auditFilter.action = ''
  auditFilter.timeRange = []
  auditPagination.page = 1
  searchAuditLogs()
}

const viewLogDetail = (row) => {
  selectedLog.value = row
  detailVisible.value = true
}

const traceOffline = async (row) => {
  try {
    const res = await getTraceAnalysisApi(row.deviceId, row.id)
    traceData.value = res.data
    traceVisible.value = true
  } catch (error) {
    ElMessage.error('溯源分析失败')
  }
}

const exportLogs = () => {
  ElMessage.success(`正在导出${activeTab.value === 'device' ? '设备运行' : activeTab.value === 'offline' ? '离线溯源' : '操作审计'}日志...`)
}

onMounted(() => {
  searchDeviceLogs()
  searchOfflineLogs()
  searchAuditLogs()
})
</script>

<style lang="scss" scoped>
.logtrace-container {
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
  }

  .log-tabs {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

    .filter-bar {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;

      .filter-form {
        margin-bottom: 0;
      }
    }

    .log-card {
      .pagination {
        margin-top: 16px;
        justify-content: flex-end;
      }
    }
  }

  .log-content {
    background: #1f2937;
    color: #e5e7eb;
    padding: 12px;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    max-height: 300px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .trace-analysis {
    .trace-details {
      margin-top: 24px;

      .trace-section {
        margin-bottom: 20px;

        h4 {
          margin: 0 0 12px;
          font-size: 14px;
          color: #374151;
        }
      }
    }
  }
}
</style>
