<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">
        <el-icon><Grid /></el-icon>
        游戏服列表
      </h1>
      <el-button type="primary" @click="refreshData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <div class="stat-cards">
      <StatCard
        label="游戏服总数"
        :value="totalCount"
        icon="Grid"
        color="#409EFF"
      />
      <StatCard
        label="运行中"
        :value="runningCount"
        icon="CircleCheck"
        color="#67C23A"
      />
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
        label="金丝雀中"
        :value="canaryCount"
        icon="Promotion"
        color="#1890FF"
      />
    </div>

    <div class="table-container">
      <el-table
        :data="gameServers"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="metadata.name" label="名称" min-width="180">
          <template #default="{ row }">
            <span class="server-name">{{ row.metadata.name }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="metadata.namespace" label="命名空间" width="120" />

        <el-table-column prop="spec.gameName" label="游戏名称" width="150">
          <template #default="{ row }">
            <el-tag size="small">{{ row.spec.gameName }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="spec.replicas" label="副本数" width="100">
          <template #default="{ row }">
            <span class="replica-info">
              {{ row.status.readyReplicas || 0 }}/{{ row.spec.replicas }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="status.phase" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getPhaseTagType(row.status.phase)" size="small">
              {{ getPhaseText(row.status.phase) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="当前版本" min-width="200">
          <template #default="{ row }">
            <div class="version-info">
              <div class="current-version">
                <span class="label">当前:</span>
                <span class="value">{{ getCurrentVersion(row) }}</span>
              </div>
              <div v-if="row.status.targetVersion && row.status.targetVersion !== row.status.currentVersion" class="target-version">
                <span class="label">目标:</span>
                <span class="value highlight">{{ row.status.targetVersion }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="status.onlinePlayers" label="在线玩家" width="120">
          <template #default="{ row }">
            <el-icon color="#409EFF"><User /></el-icon>
            {{ row.status.onlinePlayers || 0 }}
          </template>
        </el-table-column>

        <el-table-column v-if="hasCanary" label="金丝雀决策" width="140">
          <template #default="{ row }">
            <span v-if="row.status.canaryStatus?.decision" :style="{ color: getDecisionColor(row.status.canaryStatus.decision) }">
              {{ getDecisionText(row.status.canaryStatus.decision) }}
            </span>
            <span v-else style="color: #909399;">-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              @click="viewDetail(row)"
            >
              详情
            </el-button>
            <el-button
              type="warning"
              size="small"
              @click="showUpgradeDialog(row)"
            >
              升级
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="upgradeDialogVisible"
      title="升级游戏服"
      width="500px"
    >
      <el-form :model="upgradeForm" label-width="100px">
        <el-form-item label="游戏服">
          <span>{{ selectedServer?.metadata.name }}</span>
        </el-form-item>
        <el-form-item label="当前版本">
          <span>{{ getCurrentVersion(selectedServer) }}</span>
        </el-form-item>
        <el-form-item label="新镜像" required>
          <el-input
            v-model="upgradeForm.image"
            placeholder="请输入新的镜像地址"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="upgradeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmUpgrade" :loading="upgrading">
          确认升级
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Grid, Refresh, User } from '@element-plus/icons-vue'
import StatCard from '@/components/StatCard.vue'
import { gameServerApi } from '@/api'
import { getPhaseText, getCanaryDecisionText } from '@/types'

const router = useRouter()
const loading = ref(false)
const gameServers = ref([])
const upgradeDialogVisible = ref(false)
const selectedServer = ref(null)
const upgrading = ref(false)
const upgradeForm = ref({
  image: ''
})

const totalCount = computed(() => gameServers.value.length)
const runningCount = computed(() => 
  gameServers.value.filter(gs => gs.status?.phase === 'Running').length
)
const upgradingCount = computed(() => 
  gameServers.value.filter(gs => gs.status?.phase === 'Upgrading' || gs.status?.phase === 'Migrating').length
)
const migratingCount = computed(() => 
  gameServers.value.filter(gs => gs.status?.phase === 'Migrating').length
)
const canaryCount = computed(() => 
  gameServers.value.filter(gs => gs.status?.phase === 'Canary' || gs.status?.phase === 'RollingBack').length
)
const hasCanary = computed(() => 
  gameServers.value.some(gs => gs.status?.canaryStatus)
)

const getDecisionColor = (decision) => {
  const colors = {
    Promote: '#52C41A',
    Rollback: '#F5222D',
    Observe: '#FAAD14',
    Pending: '#8C8C8C'
  }
  return colors[decision] || '#8C8C8C'
}

const getDecisionText = (decision) => {
  return getCanaryDecisionText(decision)
}

const fetchData = async () => {
  loading.value = true
  try {
    const data = await gameServerApi.list()
    gameServers.value = data.items || []
  } catch (error) {
    ElMessage.error('获取游戏服列表失败')
  } finally {
    loading.value = false
  }
}

const refreshData = () => {
  fetchData()
  ElMessage.success('已刷新')
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

const showUpgradeDialog = (row) => {
  selectedServer.value = row
  upgradeForm.value.image = getCurrentVersion(row)
  upgradeDialogVisible.value = true
}

const confirmUpgrade = async () => {
  if (!upgradeForm.value.image) {
    ElMessage.warning('请输入新的镜像地址')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要将游戏服 ${selectedServer.value.metadata.name} 升级到 ${upgradeForm.value.image} 吗？`,
      '确认升级',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  upgrading.value = true
  try {
    await gameServerApi.upgrade(
      selectedServer.value.metadata.namespace,
      selectedServer.value.metadata.name,
      upgradeForm.value.image
    )
    ElMessage.success('升级请求已提交')
    upgradeDialogVisible.value = false
    fetchData()
  } catch (error) {
    ElMessage.error('升级请求失败')
  } finally {
    upgrading.value = false
  }
}

const getPhaseTagType = (phase) => {
  const types = {
    Running: 'success',
    Upgrading: 'warning',
    Migrating: 'primary',
    Draining: 'info',
    Canary: '',
    RollingBack: 'warning',
    Succeeded: 'success',
    Failed: 'danger'
  }
  return types[phase] || 'info'
}

const getCurrentVersion = (gs) => {
  return gs.spec?.template?.containers?.[0]?.image || '-'
}

onMounted(() => {
  fetchData()
  const interval = setInterval(fetchData, 10000)
  return () => clearInterval(interval)
})
</script>

<style scoped>
.server-name {
  font-weight: 600;
  color: #303133;
}

.replica-info {
  font-weight: 500;
}

.version-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.current-version,
.target-version {
  display: flex;
  align-items: center;
  gap: 6px;
}

.current-version .label,
.target-version .label {
  color: #909399;
  font-size: 12px;
}

.current-version .value {
  font-family: monospace;
  font-size: 12px;
}

.target-version .value.highlight {
  color: #e6a23c;
  font-weight: 600;
  font-family: monospace;
  font-size: 12px;
}
</style>
