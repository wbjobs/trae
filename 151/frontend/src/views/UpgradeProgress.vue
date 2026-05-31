<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">
        <el-icon><DataLine /></el-icon>
        升级进度总览
      </h1>
      <el-button @click="refreshData" :icon="Refresh">
        刷新
      </el-button>
    </div>

    <div class="stat-cards">
      <StatCard
        label="升级中"
        :value="upgradingCount"
        icon="Upload"
        color="#E6A23C"
      />
      <StatCard
        label="迁移中"
        :value="migratingCount"
        icon="Switch"
        color="#8E44AD"
      />
      <StatCard
        label="受影响玩家"
        :value="affectedPlayers"
        icon="User"
        color="#F56C6C"
      />
      <StatCard
        label="已完成升级"
        :value="completedCount"
        icon="CircleCheck"
        color="#67C23A"
      />
    </div>

    <div class="card">
      <div class="card-header">升级中的游戏服</div>
      <div class="card-body">
        <el-table :data="upgradingServers" v-loading="loading" stripe>
          <el-table-column prop="metadata.name" label="游戏服" min-width="150" />
          <el-table-column prop="metadata.namespace" label="命名空间" width="120" />
          <el-table-column label="当前版本" min-width="180">
            <template #default="{ row }">
              <span class="version">{{ row.status.currentVersion }}</span>
            </template>
          </el-table-column>
          <el-table-column label="目标版本" min-width="180">
            <template #default="{ row }">
              <span class="version highlight">{{ row.status.targetVersion }}</span>
            </template>
          </el-table-column>
          <el-table-column label="升级进度" width="200">
            <template #default="{ row }">
              <el-progress
                :percentage="row.status.upgradeProgress?.percentage || 0"
                :status="getProgressStatus(row.status.upgradeProgress?.percentage || 0)"
                :stroke-width="8"
              />
            </template>
          </el-table-column>
          <el-table-column label="副本进度" width="150">
            <template #default="{ row }">
              <span>
                {{ row.status.upgradeProgress?.upgradedPods || 0 }}/{{ row.status.upgradeProgress?.totalPods || 0 }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="在线玩家" width="120">
            <template #default="{ row }">
              <el-icon color="#409EFF"><User /></el-icon>
              {{ row.status.onlinePlayers || 0 }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button
                type="primary"
                link
                @click="viewDetail(row)"
              >
                详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">玩家迁移影响统计</div>
      <div class="card-body">
        <div class="chart-container">
          <v-chart class="chart" :option="chartOption" autoresize />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataLine, Refresh, User } from '@element-plus/icons-vue'
import StatCard from '@/components/StatCard.vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components'
import { gameServerApi } from '@/api'

use([
  CanvasRenderer,
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
])

const router = useRouter()
const loading = ref(false)
const gameServers = ref([])

let refreshInterval = null

const fetchData = async () => {
  loading.value = true
  try {
    const data = await gameServerApi.list()
    gameServers.value = data.items || []
  } catch (error) {
    console.error('Failed to fetch data:', error)
  } finally {
    loading.value = false
  }
}

const refreshData = () => {
  fetchData()
  ElMessage.success('已刷新')
}

const upgradingServers = computed(() =>
  gameServers.value.filter(
    gs => gs.status?.phase === 'Upgrading' || gs.status?.phase === 'Migrating'
  )
)

const upgradingCount = computed(() =>
  gameServers.value.filter(gs => gs.status?.phase === 'Upgrading').length
)

const migratingCount = computed(() =>
  gameServers.value.filter(gs => gs.status?.phase === 'Migrating').length
)

const completedCount = computed(() =>
  gameServers.value.filter(gs => gs.status?.phase === 'Succeeded').length
)

const affectedPlayers = computed(() =>
  upgradingServers.value.reduce((sum, gs) => {
    return sum + (gs.status?.onlinePlayers || 0)
  }, 0)
)

const chartOption = computed(() => {
  const serverNames = upgradingServers.value.map(gs => gs.metadata.name)
  const onlinePlayers = upgradingServers.value.map(gs => gs.status?.onlinePlayers || 0)
  const migratedPlayers = upgradingServers.value.map(gs => gs.status?.migrationStatus?.migratedPlayers || 0)
  const totalPlayers = upgradingServers.value.map(gs => gs.status?.migrationStatus?.totalPlayers || 0)

  return {
    title: {
      text: '玩家迁移影响统计',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    legend: {
      data: ['在线玩家', '已迁移玩家', '总迁移玩家'],
      bottom: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: serverNames.length > 0 ? serverNames : ['暂无数据'],
      axisLabel: {
        rotate: 30
      }
    },
    yAxis: {
      type: 'value',
      name: '玩家数量'
    },
    series: [
      {
        name: '在线玩家',
        type: 'bar',
        data: onlinePlayers.length > 0 ? onlinePlayers : [0],
        itemStyle: {
          color: '#409EFF'
        }
      },
      {
        name: '已迁移玩家',
        type: 'bar',
        data: migratedPlayers.length > 0 ? migratedPlayers : [0],
        itemStyle: {
          color: '#67C23A'
        }
      },
      {
        name: '总迁移玩家',
        type: 'bar',
        data: totalPlayers.length > 0 ? totalPlayers : [0],
        itemStyle: {
          color: '#E6A23C'
        }
      }
    ]
  }
})

const getProgressStatus = (percentage) => {
  if (percentage >= 100) return 'success'
  if (percentage > 0) return ''
  return 'exception'
}

const viewDetail = (row) => {
  router.push({
    name: 'GameServerDetail',
    params: {
      namespace: row.metadata.namespace,
      name: row.metadata.name
    }
  })
}

onMounted(() => {
  fetchData()
  refreshInterval = setInterval(fetchData, 5000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.version {
  font-family: monospace;
  font-size: 12px;
}

.version.highlight {
  color: #e6a23c;
  font-weight: 600;
}

.chart {
  height: 400px;
  width: 100%;
}
</style>
