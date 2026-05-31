<template>
  <div class="page-container">
    <PageHeader title="操作轨迹查询" icon="Histogram" subtitle="追溯文档操作历史，分析用户行为轨迹，支持多维度筛选和统计分析" />
    
    <div class="card-container">
      <el-row :gutter="16" class="stats-row">
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-content">
              <div class="stat-icon icon-blue">
                <el-icon><Document /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.totalOperations }}</div>
                <div class="stat-label">总操作次数</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-content">
              <div class="stat-icon icon-green">
                <el-icon><View /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.viewCount }}</div>
                <div class="stat-label">文档浏览</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-content">
              <div class="stat-icon icon-orange">
                <el-icon><Download /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.downloadCount }}</div>
                <div class="stat-label">文件下载</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-content">
              <div class="stat-icon icon-red">
                <el-icon><Warning /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.suspiciousCount }}</div>
                <div class="stat-label">可疑操作</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <div class="filter-bar">
        <el-input 
          v-model="filters.keyword" 
          placeholder="搜索操作描述、用户名、IP地址" 
          style="width: 260px"
          clearable
          @keyup.enter="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-select v-model="filters.operationType" placeholder="操作类型" clearable style="width: 140px">
          <el-option label="登录" value="login" />
          <el-option label="登出" value="logout" />
          <el-option label="上传" value="upload" />
          <el-option label="浏览" value="view" />
          <el-option label="下载" value="download" />
          <el-option label="修改" value="update" />
          <el-option label="删除" value="delete" />
          <el-option label="授权" value="grant" />
          <el-option label="撤销" value="revoke" />
        </el-select>
        
        <el-select v-model="filters.userId" placeholder="操作用户" clearable filterable style="width: 140px">
          <el-option 
            v-for="user in userList" 
            :key="user.id" 
            :label="user.real_name || user.username"
            :value="user.id"
          />
        </el-select>
        
        <el-select v-model="filters.secretLevel" placeholder="文档密级" clearable style="width: 120px">
          <el-option label="公开" value="public" />
          <el-option label="内部" value="internal" />
          <el-option label="机密" value="secret" />
          <el-option label="绝密" value="top_secret" />
        </el-select>
        
        <el-date-picker 
          v-model="filters.dateRange" 
          type="datetimerange" 
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 320px"
        />
        
        <el-button type="primary" @click="loadData">
          <el-icon><Search /></el-icon>
          查询
        </el-button>
        
        <el-button @click="resetFilters">
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
        
        <el-dropdown @command="handleExport" :loading="exporting">
          <el-button type="success">
            <el-icon><Download /></el-icon>
            导出
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="json">导出为 JSON</el-dropdown-item>
              <el-dropdown-item command="csv">导出为 CSV</el-dropdown-item>
              <el-dropdown-item command="html">导出为可视化报告 (HTML)</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <el-tabs v-model="activeTab" class="trajectory-tabs">
        <el-tab-pane label="操作日志列表" name="list">
          <el-table :data="logs" v-loading="loading" stripe>
            <el-table-column type="index" width="60" label="#" />
            <el-table-column prop="operation_type" label="操作类型" width="100">
              <template #default="{ row }">
                <el-tag :type="getOperationTypeColor(row.operation_type)" size="small">
                  {{ getOperationTypeName(row.operation_type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="user_name" label="操作用户" width="120" />
            <el-table-column prop="document_title" label="文档" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.document_title">{{ row.document_title }}</span>
                <span v-else style="color: #c0c4cc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="密级" width="80">
              <template #default="{ row }">
                <SecretBadge v-if="row.secret_level" :level="row.secret_level" />
                <span v-else style="color: #c0c4cc">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="操作描述" min-width="200" show-overflow-tooltip />
            <el-table-column prop="ip_address" label="IP地址" width="130" />
            <el-table-column prop="user_agent" label="设备信息" min-width="150" show-overflow-tooltip />
            <el-table-column prop="created_at" label="操作时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <StatusTag :status="row.status === 'success' ? 'success' : 'error'" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" text size="small" @click="showDetail(row)">
                  详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <PaginationWrapper 
            v-model:page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            @change="loadData"
          />
        </el-tab-pane>
        
        <el-tab-pane label="行为统计分析" name="statistics">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-card title="操作类型分布" class="chart-card">
                <div ref="operationChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card title="每日操作趋势" class="chart-card">
                <div ref="trendChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
          </el-row>
          
          <el-row :gutter="16" style="margin-top: 16px">
            <el-col :span="12">
              <el-card title="用户活跃度排行" class="chart-card">
                <div ref="userChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card title="文档访问排行" class="chart-card">
                <div ref="documentChartRef" class="chart-container"></div>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>
        
        <el-tab-pane label="可疑行为检测" name="suspicious">
          <el-alert 
            title="系统自动检测异常操作行为，包括高频访问、非工作时间操作、跨区域访问等" 
            type="warning" 
            :closable="false"
            style="margin-bottom: 16px"
          />
          
          <el-table :data="suspiciousLogs" v-loading="suspiciousLoading" stripe>
            <el-table-column prop="user_name" label="用户" width="120" />
            <el-table-column prop="operation_type" label="操作类型" width="100">
              <template #default="{ row }">
                {{ getOperationTypeName(row.operation_type) }}
              </template>
            </el-table-column>
            <el-table-column prop="description" label="操作描述" min-width="200" />
            <el-table-column prop="risk_level" label="风险等级" width="100">
              <template #default="{ row }">
                <el-tag :type="getRiskLevelColor(row.risk_level)" size="small">
                  {{ getRiskLevelName(row.risk_level) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="ip_address" label="IP地址" width="130" />
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button type="primary" text size="small">处理</el-button>
                <el-button type="info" text size="small">忽略</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
    
    <el-dialog v-model="detailDialogVisible" title="操作详情" width="600px">
      <el-descriptions v-if="currentLog" :column="2" border>
        <el-descriptions-item label="操作类型">
          <el-tag :type="getOperationTypeColor(currentLog.operation_type)">
            {{ getOperationTypeName(currentLog.operation_type) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <StatusTag :status="currentLog.status === 'success' ? 'success' : 'error'" />
        </el-descriptions-item>
        <el-descriptions-item label="操作用户">{{ currentLog.user_name }}</el-descriptions-item>
        <el-descriptions-item label="用户ID">{{ currentLog.user_id }}</el-descriptions-item>
        <el-descriptions-item label="文档名称" :span="2">
          {{ currentLog.document_title || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="文档ID">{{ currentLog.document_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="密级">
          <SecretBadge v-if="currentLog.secret_level" :level="currentLog.secret_level" />
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="IP地址">{{ currentLog.ip_address }}</el-descriptions-item>
        <el-descriptions-item label="地理位置">{{ currentLog.location || '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作时间" :span="2">
          {{ formatDateTime(currentLog.created_at) }}
        </el-descriptions-item>
        <el-descriptions-item label="操作描述" :span="2">
          {{ currentLog.description }}
        </el-descriptions-item>
        <el-descriptions-item label="请求参数" :span="2">
          <pre style="max-height: 150px; overflow: auto; margin: 0; background: #f5f7fa; padding: 10px; border-radius: 4px;">
            {{ currentLog.request_params ? JSON.stringify(JSON.parse(currentLog.request_params), null, 2) : '{}' }}
          </pre>
        </el-descriptions-item>
        <el-descriptions-item label="设备信息" :span="2">
          {{ currentLog.user_agent }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Search, Refresh, Download, Warning, 
  Document, View, ArrowDown
} from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import PageHeader from '@/components/PageHeader.vue'
import PaginationWrapper from '@/components/PaginationWrapper.vue'
import SecretBadge from '@/components/SecretBadge.vue'
import StatusTag from '@/components/StatusTag.vue'
import { 
  getLogList, getLogStatistics, exportLogsAsFormat, checkSuspiciousActivity 
} from '@/api/log'
import { getUserList } from '@/api/auth'

const loading = ref(false)
const exporting = ref(false)
const suspiciousLoading = ref(false)
const activeTab = ref('list')
const detailDialogVisible = ref(false)
const currentLog = ref(null)

const operationChartRef = ref(null)
const trendChartRef = ref(null)
const userChartRef = ref(null)
const documentChartRef = ref(null)

let operationChart = null
let trendChart = null
let userChart = null
let documentChart = null

const stats = reactive({
  totalOperations: 0,
  viewCount: 0,
  downloadCount: 0,
  suspiciousCount: 0,
})

const filters = reactive({
  keyword: '',
  operationType: '',
  userId: '',
  secretLevel: '',
  dateRange: [],
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const logs = ref([])
const suspiciousLogs = ref([])
const userList = ref([])

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filters.keyword || undefined,
      operationType: filters.operationType || undefined,
      userId: filters.userId || undefined,
      secretLevel: filters.secretLevel || undefined,
      startTime: filters.dateRange?.[0] || undefined,
      endTime: filters.dateRange?.[1] || undefined,
    }
    
    const data = await getLogList(params)
    logs.value = data.list || []
    pagination.total = data.total || 0
  } catch (err) {
    ElMessage.error(err.message || '加载日志失败')
  } finally {
    loading.value = false
  }
}

const loadStatistics = async () => {
  try {
    const data = await getLogStatistics()
    stats.totalOperations = data.totalOperations || 0
    stats.viewCount = data.viewCount || 0
    stats.downloadCount = data.downloadCount || 0
    stats.suspiciousCount = data.suspiciousCount || 0
    
    nextTick(() => {
      initCharts(data)
    })
  } catch (err) {
    console.error('加载统计数据失败:', err)
  }
}

const loadSuspiciousLogs = async () => {
  suspiciousLoading.value = true
  try {
    const data = await checkSuspiciousActivity(null, 24)
    suspiciousLogs.value = data || []
  } catch (err) {
    console.error('加载可疑日志失败:', err)
  } finally {
    suspiciousLoading.value = false
  }
}

const loadUsers = async () => {
  try {
    const data = await getUserList({ pageSize: 1000 })
    userList.value = data.list || []
  } catch (err) {
    console.error('加载用户列表失败:', err)
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.operationType = ''
  filters.userId = ''
  filters.secretLevel = ''
  filters.dateRange = []
  pagination.page = 1
  loadData()
}

const handleExport = async (format) => {
  exporting.value = true
  try {
    const params = {
      keyword: filters.keyword || undefined,
      operationType: filters.operationType || undefined,
      userId: filters.userId || undefined,
      secretLevel: filters.secretLevel || undefined,
      startTime: filters.dateRange?.[0] || undefined,
      endTime: filters.dateRange?.[1] || undefined,
    }
    
    const blob = await exportLogsAsFormat(params, format)
    const url = window.URL.createObjectURL(new Blob([blob]))
    const link = document.createElement('a')
    link.href = url
    
    const extensions = {
      json: 'json',
      csv: 'csv',
      html: 'html',
    }
    
    link.download = `操作日志_${new Date().toISOString().slice(0, 10)}.${extensions[format] || 'json'}`
    link.click()
    window.URL.revokeObjectURL(url)
    
    const formatNames = {
      json: 'JSON',
      csv: 'CSV',
      html: '可视化报告',
    }
    
    ElMessage.success(`已导出为 ${formatNames[format] || '文件'}`)
  } catch (err) {
    ElMessage.error(err.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

const showDetail = (row) => {
  currentLog.value = row
  detailDialogVisible.value = true
}

const getOperationTypeName = (type) => {
  const types = {
    login: '登录',
    logout: '登出',
    upload: '上传',
    view: '浏览',
    download: '下载',
    update: '修改',
    delete: '删除',
    grant: '授权',
    revoke: '撤销',
  }
  return types[type] || type
}

const getOperationTypeColor = (type) => {
  const colors = {
    login: 'success',
    logout: 'info',
    upload: 'primary',
    view: '',
    download: 'success',
    update: 'warning',
    delete: 'danger',
    grant: 'primary',
    revoke: 'info',
  }
  return colors[type] || ''
}

const getRiskLevelColor = (level) => {
  const colors = {
    low: 'success',
    medium: 'warning',
    high: 'danger',
  }
  return colors[level] || 'info'
}

const getRiskLevelName = (level) => {
  const names = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  }
  return names[level] || level
}

const formatDateTime = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const initCharts = (data) => {
  if (operationChartRef.value && !operationChart) {
    operationChart = echarts.init(operationChartRef.value)
    operationChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        data: data.operationTypeDistribution || [],
      }],
    })
  }
  
  if (trendChartRef.value && !trendChart) {
    trendChart = echarts.init(trendChartRef.value)
    trendChart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: data.dailyTrend?.dates || [] },
      yAxis: { type: 'value' },
      series: [{
        data: data.dailyTrend?.values || [],
        type: 'line',
        smooth: true,
        areaStyle: {},
      }],
    })
  }
  
  if (userChartRef.value && !userChart) {
    userChart = echarts.init(userChartRef.value)
    userChart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: data.userActivity?.users || [] },
      series: [{
        type: 'bar',
        data: data.userActivity?.values || [],
      }],
    })
  }
  
  if (documentChartRef.value && !documentChart) {
    documentChart = echarts.init(documentChartRef.value)
    documentChart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: data.documentAccess?.documents || [] },
      series: [{
        type: 'bar',
        data: data.documentAccess?.values || [],
      }],
    })
  }
}

const handleResize = () => {
  operationChart?.resize()
  trendChart?.resize()
  userChart?.resize()
  documentChart?.resize()
}

onMounted(() => {
  loadData()
  loadStatistics()
  loadUsers()
  loadSuspiciousLogs()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  operationChart?.dispose()
  trendChart?.dispose()
  userChart?.dispose()
  documentChart?.dispose()
})
</script>

<style scoped>
.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  .stat-content {
    display: flex;
    align-items: center;
    gap: 16px;
    
    .stat-icon {
      width: 60px;
      height: 60px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      color: #fff;
      
      &.icon-blue {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      
      &.icon-green {
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      }
      
      &.icon-orange {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      }
      
      &.icon-red {
        background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
      }
    }
    
    .stat-info {
      .stat-value {
        font-size: 28px;
        font-weight: 600;
        color: #303133;
        line-height: 1.2;
      }
      
      .stat-label {
        font-size: 14px;
        color: #909399;
        margin-top: 4px;
      }
    }
  }
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.trajectory-tabs {
  :deep(.el-tabs__content) {
    padding-top: 16px;
  }
}

.chart-card {
  .chart-container {
    height: 300px;
  }
}
</style>
