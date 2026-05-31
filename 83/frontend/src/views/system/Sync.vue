<template>
  <div class="page-container">
    <PageHeader title="云端同步" icon="Connection" subtitle="管理本地与云端的数据同步，包括文档、权限、日志等数据的双向同步" />
    
    <div class="card-container">
      <el-row :gutter="16" class="status-row">
        <el-col :span="8">
          <el-card class="status-card" :class="{ 'offline': !syncStatus.cloudConnected }">
            <div class="status-header">
              <el-icon :class="syncStatus.cloudConnected ? 'icon-online' : 'icon-offline'">
                <Connection />
              </el-icon>
              <div class="status-info">
                <div class="status-title">云端连接状态</div>
                <div class="status-value">
                  <el-tag :type="syncStatus.cloudConnected ? 'success' : 'danger'" size="small">
                    {{ syncStatus.cloudConnected ? '已连接' : '未连接' }}
                  </el-tag>
                </div>
              </div>
            </div>
            <div class="status-detail">
              <span v-if="syncStatus.cloudConnected">
                延迟: {{ syncStatus.latency }}ms
              </span>
              <span v-else>
                请检查网络连接或云端服务状态
              </span>
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="8">
          <el-card class="status-card">
            <div class="status-header">
              <el-icon class="icon-blue"><Document /></el-icon>
              <div class="status-info">
                <div class="status-title">待同步文档</div>
                <div class="status-value">{{ syncStatus.pendingDocuments }}</div>
              </div>
            </div>
            <div class="status-detail">
              上次同步: {{ syncStatus.lastDocumentSync || '从未同步' }}
            </div>
          </el-card>
        </el-col>
        
        <el-col :span="8">
          <el-card class="status-card">
            <div class="status-header">
              <el-icon class="icon-orange"><Tickets /></el-icon>
              <div class="status-info">
                <div class="status-title">待同步日志</div>
                <div class="status-value">{{ syncStatus.pendingLogs }}</div>
              </div>
            </div>
            <div class="status-detail">
              上次同步: {{ syncStatus.lastLogSync || '从未同步' }}
            </div>
          </el-card>
        </el-col>
      </el-row>
      
      <el-card>
        <template #header>
          <div class="card-header">
            <span>同步操作</span>
            <div class="header-actions">
              <el-button 
                type="primary" 
                :loading="pushing"
                :disabled="!syncStatus.cloudConnected"
                @click="pushToCloud"
              >
                <el-icon><Top /></el-icon>
                推送至云端
              </el-button>
              <el-button 
                type="success" 
                :loading="pulling"
                :disabled="!syncStatus.cloudConnected"
                @click="pullFromCloud"
              >
                <el-icon><Bottom /></el-icon>
                从云端拉取
              </el-button>
              <el-button 
                type="warning"
                :loading="syncing"
                :disabled="!syncStatus.cloudConnected"
                @click="fullSync"
              >
                <el-icon><Refresh /></el-icon>
                全量同步
              </el-button>
            </div>
          </div>
        </template>
        
        <el-alert 
          title="同步说明" 
          type="info" 
          :closable="false"
          style="margin-bottom: 20px"
        >
          <template #default>
            <ul>
              <li>推送：将本地新增/修改的文档、权限、日志等数据同步到云端</li>
              <li>拉取：将云端最新的数据同步到本地</li>
              <li>全量同步：执行完整的数据同步，包括文档、权限、用户、日志等所有数据</li>
              <li>离线模式下，操作日志将暂存本地，网络恢复后自动同步</li>
            </ul>
          </template>
        </el-alert>
        
        <el-form label-width="120px" style="max-width: 500px">
          <el-form-item label="同步内容">
            <el-checkbox-group v-model="syncOptions">
              <el-checkbox value="documents">文档</el-checkbox>
              <el-checkbox value="permissions">权限</el-checkbox>
              <el-checkbox value="users">用户</el-checkbox>
              <el-checkbox value="logs">操作日志</el-checkbox>
              <el-checkbox value="watermarks">水印配置</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          
          <el-form-item label="冲突处理策略">
            <el-radio-group v-model="conflictStrategy">
              <el-radio value="local">以本地为准</el-radio>
              <el-radio value="cloud">以云端为准</el-radio>
              <el-radio value="merge">自动合并</el-radio>
              <el-radio value="manual">手动处理</el-radio>
            </el-radio-group>
          </el-form-item>
          
          <el-form-item label="自动同步">
            <el-switch v-model="autoSyncEnabled" />
            <span style="margin-left: 10px; color: #909399">启用后，系统将定期自动同步数据</span>
          </el-form-item>
          
          <el-form-item v-if="autoSyncEnabled" label="同步间隔">
            <el-select v-model="syncInterval" style="width: 200px">
              <el-option label="每5分钟" :value="5" />
              <el-option label="每15分钟" :value="15" />
              <el-option label="每30分钟" :value="30" />
              <el-option label="每小时" :value="60" />
              <el-option label="每6小时" :value="360" />
              <el-option label="每天" :value="1440" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-card>
      
      <el-card style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>同步记录</span>
            <el-button size="small" @click="loadSyncRecords">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </template>
        
        <el-table :data="syncRecords" v-loading="recordsLoading" stripe>
          <el-table-column type="index" width="60" label="#" />
          <el-table-column prop="type" label="类型" width="100">
            <template #default="{ row }">
              <el-tag :type="getSyncTypeColor(row.type)" size="small">
                {{ getSyncTypeName(row.type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="direction" label="方向" width="100">
            <template #default="{ row }">
              <span v-if="row.direction === 'push'" style="color: #409eff">
                <el-icon><Top /></el-icon> 推送
              </span>
              <span v-else style="color: #67c23a">
                <el-icon><Bottom /></el-icon> 拉取
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <StatusTag :status="row.status" />
            </template>
          </el-table-column>
          <el-table-column prop="records_count" label="记录数" width="100" />
          <el-table-column prop="duration" label="耗时" width="100">
            <template #default="{ row }">
              {{ row.duration ? row.duration + 'ms' : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="error_message" label="错误信息" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.error_message" style="color: #f56c6c">
                {{ row.error_message }}
              </span>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="operator_name" label="操作人" width="100" />
          <el-table-column prop="created_at" label="时间" width="160">
            <template #default="{ row }">
              {{ formatDateTime(row.created_at) }}
            </template>
          </el-table-column>
        </el-table>
        
        <PaginationWrapper 
          v-model:page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          @change="loadSyncRecords"
        />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  Connection, Document, Tickets, Top, Bottom, Refresh 
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import PaginationWrapper from '@/components/PaginationWrapper.vue'
import StatusTag from '@/components/StatusTag.vue'
import { getSyncStatus, pushToCloud as apiPush, pullFromCloud as apiPull, getSyncRecords as apiGetRecords } from '@/api/sync'

const pushing = ref(false)
const pulling = ref(false)
const syncing = ref(false)
const recordsLoading = ref(false)

const syncStatus = reactive({
  cloudConnected: true,
  latency: 45,
  pendingDocuments: 12,
  pendingLogs: 156,
  lastDocumentSync: '2024-01-15 14:30:00',
  lastLogSync: '2024-01-15 14:00:00',
})

const syncOptions = ref(['documents', 'permissions', 'users', 'logs'])
const conflictStrategy = ref('merge')
const autoSyncEnabled = ref(true)
const syncInterval = ref(30)

const syncRecords = ref([])

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const loadStatus = async () => {
  try {
    const data = await getSyncStatus()
    Object.assign(syncStatus, data)
  } catch (err) {
    console.error('加载同步状态失败:', err)
  }
}

const loadSyncRecords = async () => {
  recordsLoading.value = true
  try {
    const data = await apiGetRecords({
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    syncRecords.value = data.list || []
    pagination.total = data.total || 0
  } catch (err) {
    ElMessage.error(err.message || '加载同步记录失败')
  } finally {
    recordsLoading.value = false
  }
}

const pushToCloud = async () => {
  if (syncOptions.value.length === 0) {
    ElMessage.warning('请选择要同步的内容')
    return
  }
  
  pushing.value = true
  try {
    await apiPush({
      types: syncOptions.value,
      conflictStrategy: conflictStrategy.value,
    })
    ElMessage.success('推送成功')
    loadStatus()
    loadSyncRecords()
  } catch (err) {
    ElMessage.error(err.message || '推送失败')
  } finally {
    pushing.value = false
  }
}

const pullFromCloud = async () => {
  if (syncOptions.value.length === 0) {
    ElMessage.warning('请选择要同步的内容')
    return
  }
  
  pulling.value = true
  try {
    await apiPull({
      types: syncOptions.value,
      conflictStrategy: conflictStrategy.value,
    })
    ElMessage.success('拉取成功')
    loadStatus()
    loadSyncRecords()
  } catch (err) {
    ElMessage.error(err.message || '拉取失败')
  } finally {
    pulling.value = false
  }
}

const fullSync = async () => {
  syncing.value = true
  try {
    await apiPull({
      types: ['documents', 'permissions', 'users', 'logs', 'watermarks'],
      conflictStrategy: conflictStrategy.value,
    })
    await apiPush({
      types: ['documents', 'permissions', 'users', 'logs', 'watermarks'],
      conflictStrategy: conflictStrategy.value,
    })
    ElMessage.success('全量同步成功')
    loadStatus()
    loadSyncRecords()
  } catch (err) {
    ElMessage.error(err.message || '全量同步失败')
  } finally {
    syncing.value = false
  }
}

const getSyncTypeName = (type) => {
  const names = {
    documents: '文档',
    permissions: '权限',
    users: '用户',
    logs: '日志',
    watermarks: '水印',
    full: '全量',
  }
  return names[type] || type
}

const getSyncTypeColor = (type) => {
  const colors = {
    documents: 'primary',
    permissions: 'success',
    users: 'warning',
    logs: 'info',
    watermarks: '',
    full: 'danger',
  }
  return colors[type] || 'info'
}

const formatDateTime = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadStatus()
  loadSyncRecords()
})
</script>

<style scoped>
.status-row {
  margin-bottom: 20px;
}

.status-card {
  &.offline {
    opacity: 0.7;
  }
  
  .status-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    
    .el-icon {
      font-size: 32px;
      
      &.icon-online {
        color: #67c23a;
      }
      
      &.icon-offline {
        color: #f56c6c;
      }
      
      &.icon-blue {
        color: #409eff;
      }
      
      &.icon-orange {
        color: #e6a23c;
      }
    }
    
    .status-info {
      flex: 1;
      
      .status-title {
        font-size: 14px;
        color: #909399;
      }
      
      .status-value {
        font-size: 24px;
        font-weight: 600;
        color: #303133;
        margin-top: 4px;
      }
    }
  }
  
  .status-detail {
    font-size: 13px;
    color: #909399;
    padding-top: 12px;
    border-top: 1px solid #ebeef5;
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  .header-actions {
    display: flex;
    gap: 10px;
  }
}
</style>
