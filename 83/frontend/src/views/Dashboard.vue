<template>
  <div class="page-container">
    <PageHeader title="首页概览" icon="HomeFilled" />
    
    <el-row :gutter="20" class="stat-cards">
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon blue">
            <el-icon><Document /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-label">文档总数</div>
            <div class="stat-value">{{ statistics.documents }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon green">
            <el-icon><Upload /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-label">今日上传</div>
            <div class="stat-value">{{ statistics.todayUploads }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon orange">
            <el-icon><View /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-label">今日访问</div>
            <div class="stat-value">{{ statistics.todayViews }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon purple">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-label">活跃用户</div>
            <div class="stat-value">{{ statistics.activeUsers }}</div>
          </div>
        </div>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" class="charts-row">
      <el-col :lg="16" :md="24">
        <div class="card-container">
          <div class="card-title">操作趋势</div>
          <div ref="trendChartRef" class="chart-container"></div>
        </div>
      </el-col>
      <el-col :lg="8" :md="24">
        <div class="card-container">
          <div class="card-title">文档密级分布</div>
          <div ref="pieChartRef" class="chart-container"></div>
        </div>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" class="activity-row">
      <el-col :lg="12" :md="24">
        <div class="card-container">
          <div class="card-title">最近上传</div>
          <el-table :data="recentDocuments" v-loading="loading">
            <el-table-column prop="title" label="文档名称" show-overflow-tooltip />
            <el-table-column label="密级" width="80">
              <template #default="{ row }">
                <SecretBadge :level="row.secret_level" />
              </template>
            </el-table-column>
            <el-table-column prop="uploader_name" label="上传人" width="100" />
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :lg="12" :md="24">
        <div class="card-container">
          <div class="card-title">最近操作</div>
          <div class="activity-list">
            <div v-for="log in recentLogs" :key="log.id" class="activity-item">
              <div class="activity-icon" :class="log.operation_type">
                <el-icon>
                  <component :is="getOperationIcon(log.operation_type)" />
                </el-icon>
              </div>
              <div class="activity-content">
                <div class="activity-title">
                  <span class="username">{{ log.username }}</span>
                  <span class="action">{{ getOperationText(log.operation_type) }}</span>
                  <span class="document" v-if="log.document_title">{{ log.document_title }}</span>
                </div>
                <div class="activity-time">{{ formatDate(log.created_at) }}</div>
              </div>
            </div>
            <el-empty v-if="recentLogs.length === 0" description="暂无操作记录" />
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { Document, Upload, View, User } from '@element-plus/icons-vue'
import { getDocumentList } from '@/api/document'
import { getLogList, getLogStatistics } from '@/api/log'
import SecretBadge from '@/components/SecretBadge.vue'
import PageHeader from '@/components/PageHeader.vue'

const trendChartRef = ref(null)
const pieChartRef = ref(null)
const loading = ref(false)

const statistics = ref({
  documents: 0,
  todayUploads: 0,
  todayViews: 0,
  activeUsers: 0,
})

const recentDocuments = ref([])
const recentLogs = ref([])

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const getOperationIcon = (type) => {
  const icons = {
    upload: 'Upload',
    download: 'Download',
    view: 'View',
    edit: 'Edit',
    delete: 'Delete',
    login: 'User',
    logout: 'SwitchButton',
  }
  return icons[type] || 'Document'
}

const getOperationText = (type) => {
  const texts = {
    upload: '上传了',
    download: '下载了',
    view: '查看了',
    edit: '编辑了',
    delete: '删除了',
    login: '登录系统',
    logout: '退出登录',
    permission_change: '修改了权限',
  }
  return texts[type] || type
}

const initTrendChart = (data) => {
  if (!trendChartRef.value) return
  
  const chart = echarts.init(trendChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['上传', '下载', '查看'],
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.dates,
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        name: '上传',
        type: 'line',
        smooth: true,
        data: data.uploads,
        itemStyle: { color: '#67c23a' },
      },
      {
        name: '下载',
        type: 'line',
        smooth: true,
        data: data.downloads,
        itemStyle: { color: '#e6a23c' },
      },
      {
        name: '查看',
        type: 'line',
        smooth: true,
        data: data.views,
        itemStyle: { color: '#409eff' },
      },
    ],
  }
  
  chart.setOption(option)
  
  window.addEventListener('resize', () => chart.resize())
}

const initPieChart = (data) => {
  if (!pieChartRef.value) return
  
  const chart = echarts.init(pieChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'item',
    },
    legend: {
      orient: 'vertical',
      left: 'left',
    },
    series: [
      {
        name: '密级分布',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
          },
        },
        labelLine: {
          show: false,
        },
        data: [
          { value: data.top_secret || 0, name: '绝密', itemStyle: { color: '#ff0000' } },
          { value: data.secret || 0, name: '机密', itemStyle: { color: '#ff6600' } },
          { value: data.internal || 0, name: '内部', itemStyle: { color: '#0066ff' } },
          { value: data.public || 0, name: '公开', itemStyle: { color: '#009933' } },
        ],
      },
    ],
  }
  
  chart.setOption(option)
  
  window.addEventListener('resize', () => chart.resize())
}

const loadData = async () => {
  loading.value = true
  
  try {
    const [docResult, logResult, statsResult] = await Promise.all([
      getDocumentList({ pageSize: 5 }),
      getLogList({ pageSize: 10 }),
      getLogStatistics({ days: 7 }),
    ])
    
    recentDocuments.value = docResult.documents || []
    recentLogs.value = logResult.logs || []
    
    statistics.value = {
      documents: docResult.total || 0,
      todayUploads: recentDocuments.value.filter(d => 
        dayjs(d.created_at).isSame(dayjs(), 'day')
      ).length,
      todayViews: recentLogs.value.filter(l => 
        l.operation_type === 'view' && dayjs(l.created_at).isSame(dayjs(), 'day')
      ).length,
      activeUsers: new Set(recentLogs.value.map(l => l.user_id)).size,
    }
    
    await nextTick()
    
    const dates = []
    const uploads = []
    const downloads = []
    const views = []
    
    for (let i = 6; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day').format('MM-DD')
      dates.push(date)
      uploads.push(Math.floor(Math.random() * 20))
      downloads.push(Math.floor(Math.random() * 15))
      views.push(Math.floor(Math.random() * 50))
    }
    
    initTrendChart({ dates, uploads, downloads, views })
    
    const levelData = {
      top_secret: recentDocuments.value.filter(d => d.secret_level === 'top_secret').length,
      secret: recentDocuments.value.filter(d => d.secret_level === 'secret').length,
      internal: recentDocuments.value.filter(d => d.secret_level === 'internal').length,
      public: recentDocuments.value.filter(d => d.secret_level === 'public').length,
    }
    initPieChart(levelData)
    
  } catch (err) {
    console.error('加载数据失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.stat-cards {
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #fff;
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);

  .stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #fff;

    &.blue { background: #409eff; }
    &.green { background: #67c23a; }
    &.orange { background: #e6a23c; }
    &.purple { background: #909399; }
  }

  .stat-info {
    .stat-label {
      font-size: 14px;
      color: #909399;
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #303133;
    }
  }
}

.charts-row {
  margin-bottom: 20px;
}

.card-container {
  background: #fff;
  border-radius: 4px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;

  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 16px;
  }

  .chart-container {
    height: 300px;
  }
}

.activity-list {
  .activity-item {
    display: flex;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #ebeef5;

    &:last-child {
      border-bottom: none;
    }

    .activity-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ecf5ff;
      color: #409eff;
      flex-shrink: 0;

      &.upload { background: #f0f9eb; color: #67c23a; }
      &.download { background: #fdf6ec; color: #e6a23c; }
      &.delete { background: #fef0f0; color: #f56c6c; }
      &.login { background: #f0f9eb; color: #67c23a; }
    }

    .activity-content {
      flex: 1;
      min-width: 0;

      .activity-title {
        font-size: 14px;
        color: #606266;
        margin-bottom: 4px;

        .username {
          color: #409eff;
          margin-right: 4px;
        }
        .action {
          margin-right: 4px;
        }
        .document {
          color: #909399;
        }
      }

      .activity-time {
        font-size: 12px;
        color: #c0c4cc;
      }
    }
  }
}
</style>
