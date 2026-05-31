<template>
  <div class="dashboard">
    <div class="page-header">
      <h2>数据看板</h2>
      <div class="time-range">
        <el-select v-model="days" @change="loadCharts" style="width: 150px;">
          <el-option label="近7天" :value="7" />
          <el-option label="近30天" :value="30" />
          <el-option label="近90天" :value="90" />
        </el-select>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.totalForms }}</div>
            <div class="stat-label">表单总数</div>
          </div>
          <div class="stat-icon blue">
            <el-icon><Document /></el-icon>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.totalSubmissions }}</div>
            <div class="stat-label">提交数据</div>
          </div>
          <div class="stat-icon green">
            <el-icon><DataAnalysis /></el-icon>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.todaySubmissions }}</div>
            <div class="stat-label">今日提交</div>
          </div>
          <div class="stat-icon orange">
            <el-icon><Promotion /></el-icon>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.pendingApprovals }}</div>
            <div class="stat-label">待办审批</div>
          </div>
          <div class="stat-icon purple">
            <el-icon><User /></el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>提交趋势</span>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container" style="height: 350px;"></div>
        </el-card>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>表单选择</span>
            </div>
          </template>
          <el-select
            v-model="selectedFormId"
            placeholder="请选择表单查看详细统计"
            style="width: 100%"
            @change="loadFormStats"
            clearable
          >
            <el-option
              v-for="form in forms"
              :key="form.id"
              :label="form.name"
              :value="form.id"
            />
          </el-select>
        </el-card>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" style="margin-top: 20px;" v-if="selectedFormId">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>状态分布</span>
            </div>
          </template>
          <div ref="statusChartRef" class="chart-container" style="height: 300px;"></div>
        </el-card>
      </el-col>
      
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>字段分布</span>
            </div>
          </template>
          <div v-if="Object.keys(fieldDistribution).length > 0">
            <div
              v-for="(data, fieldName) in fieldDistribution"
              :key="fieldName"
              class="field-distribution"
            >
              <h4>{{ getFieldLabel(fieldName) }}</h4>
              <div class="bar-list">
                <div
                  v-for="item in data"
                  :key="item.value"
                  class="bar-item"
                >
                  <span class="bar-label">{{ getOptionLabel(fieldName, item.value) }}</span>
                  <div class="bar-wrapper">
                    <div
                      class="bar-fill"
                      :style="{ width: getBarWidth(item.count, data) + '%' }"
                    ></div>
                  </div>
                  <span class="bar-count">{{ item.count }}</span>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无字段分布数据" />
        </el-card>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近表单</span>
              <el-button type="primary" text @click="$router.push('/forms')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentForms" style="width: 100%">
            <el-table-column prop="name" label="表单名称" />
            <el-table-column prop="status" label="状态">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近提交</span>
            </div>
          </template>
          <el-table :data="recentSubmissions" style="width: 100%">
            <el-table-column prop="form" label="表单">
              <template #default="{ row }">
                {{ row.form?.name || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态">
              <template #default="{ row }">
                <el-tag :type="getSubmissionStatusType(row.status)">
                  {{ getSubmissionStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="提交时间">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import * as echarts from 'echarts';
import { formApi, formSubmissionApi } from '@/api/form';
import { approvalApi } from '@/api/approval';
import type { Form, FormSubmission } from '@/types';

const days = ref(30);
const selectedFormId = ref<string>('');
const forms = ref<Form[]>([]);
const recentForms = ref<Form[]>([]);
const recentSubmissions = ref<FormSubmission[]>([]);
const fieldDistribution = ref<Record<string, { value: string; count: number }[]>>({});
const selectedFormFields = ref<any[]>([]);

const stats = reactive({
  totalForms: 0,
  totalSubmissions: 0,
  todaySubmissions: 0,
  pendingApprovals: 0,
});

const trendChartRef = ref<HTMLElement>();
const statusChartRef = ref<HTMLElement>();
let trendChart: echarts.ECharts | null = null;
let statusChart: echarts.ECharts | null = null;

const getStatusType = (status: string) => {
  const types: Record<string, string> = {
    draft: 'info',
    published: 'success',
    archived: 'warning',
  };
  return types[status] || 'info';
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: '草稿',
    published: '已发布',
    archived: '已归档',
  };
  return labels[status] || status;
};

const getSubmissionStatusType = (status: string) => {
  const types: Record<string, string> = {
    draft: 'info',
    submitted: 'primary',
    pending_approval: 'warning',
    approved: 'success',
    rejected: 'danger',
    archived: 'info',
  };
  return types[status] || 'info';
};

const getSubmissionStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: '草稿',
    submitted: '已提交',
    pending_approval: '审批中',
    approved: '已通过',
    rejected: '已拒绝',
    archived: '已归档',
  };
  return labels[status] || status;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN');
};

const getFieldLabel = (fieldName: string) => {
  const field = selectedFormFields.value.find(f => f.name === fieldName);
  return field?.label || fieldName;
};

const getOptionLabel = (fieldName: string, value: string) => {
  const field = selectedFormFields.value.find(f => f.name === fieldName);
  if (field?.options) {
    const option = field.options.find((o: any) => o.value === value);
    return option?.label || value;
  }
  return value;
};

const getBarWidth = (count: number, data: { count: number }[]) => {
  const max = Math.max(...data.map(d => d.count));
  return max > 0 ? (count / max) * 100 : 0;
};

const loadStats = async () => {
  try {
    const tenantStats = await formSubmissionApi.getTenantStats();
    Object.assign(stats, tenantStats);
  } catch (error) {
    console.error(error);
  }
};

const loadForms = async () => {
  try {
    const formList = await formApi.getForms();
    forms.value = formList;
    recentForms.value = formList.slice(0, 5);
  } catch (error) {
    console.error(error);
  }
};

const loadCharts = async () => {
  try {
    const trendData = await formSubmissionApi.getTenantTrend(days.value);
    
    if (trendChart) {
      trendChart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: '{b}: {c} 条提交',
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
          data: trendData.map(d => d.date),
          axisLabel: {
            rotate: 45,
            fontSize: 11,
          },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
        },
        series: [
          {
            name: '提交数',
            type: 'line',
            smooth: true,
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(64, 158, 255, 0.5)' },
                { offset: 1, color: 'rgba(64, 158, 255, 0.05)' },
              ]),
            },
            lineStyle: {
              color: '#409eff',
              width: 2,
            },
            itemStyle: {
              color: '#409eff',
            },
            data: trendData.map(d => d.count),
          },
        ],
      });
    }
  } catch (error) {
    console.error(error);
  }
};

const loadFormStats = async () => {
  if (!selectedFormId.value) {
    fieldDistribution.value = {};
    selectedFormFields.value = [];
    if (statusChart) {
      statusChart.setOption({
        series: [{ data: [] }],
      });
    }
    return;
  }

  try {
    const [form, statusData, fieldData] = await Promise.all([
      formApi.getForm(selectedFormId.value),
      formSubmissionApi.getStatusDistribution(selectedFormId.value),
      formSubmissionApi.getFieldDistribution(selectedFormId.value),
    ]);

    selectedFormFields.value = form.fields || [];
    fieldDistribution.value = fieldData;

    const statusChartData = statusData
      .filter(s => s.count > 0)
      .map(s => ({ value: s.count, name: s.label }));

    if (statusChart && statusChartData.length > 0) {
      statusChart.setOption({
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: {c} ({d}%)',
        },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center',
        },
        series: [
          {
            name: '状态分布',
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
                fontSize: 18,
                fontWeight: 'bold',
              },
            },
            labelLine: {
              show: false,
            },
            data: statusChartData,
          },
        ],
      });
    }
  } catch (error) {
    console.error(error);
  }
};

const loadRecentSubmissions = async () => {
  try {
    const submissions = await formSubmissionApi.getMySubmissions();
    recentSubmissions.value = submissions.slice(0, 5);
  } catch (error) {
    console.error(error);
  }
};

const initCharts = async () => {
  await nextTick();
  
  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value);
  }
  
  if (statusChartRef.value) {
    statusChart = echarts.init(statusChartRef.value);
  }

  window.addEventListener('resize', handleResize);
};

const handleResize = () => {
  trendChart?.resize();
  statusChart?.resize();
};

onMounted(async () => {
  await initCharts();
  await loadStats();
  await loadForms();
  await loadCharts();
  await loadRecentSubmissions();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  trendChart?.dispose();
  statusChart?.dispose();
});
</script>

<style scoped>
.dashboard {
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

.stat-card {
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-number {
  font-size: 32px;
  font-weight: bold;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

.stat-icon {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: white;
}

.stat-icon.blue {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stat-icon.green {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.stat-icon.orange {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.stat-icon.purple {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  width: 100%;
}

.field-distribution {
  margin-bottom: 20px;
}

.field-distribution:last-child {
  margin-bottom: 0;
}

.field-distribution h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.bar-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bar-label {
  min-width: 80px;
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-wrapper {
  flex: 1;
  height: 20px;
  background: #f0f2f5;
  border-radius: 10px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #667eea);
  border-radius: 10px;
  transition: width 0.3s ease;
}

.bar-count {
  min-width: 40px;
  text-align: right;
  font-size: 13px;
  color: #909399;
}
</style>
