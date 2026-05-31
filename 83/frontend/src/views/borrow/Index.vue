<template>
  <div class="page-container">
    <PageHeader title="文档借阅管理" icon="Tickets" subtitle="管理文档的离线借阅、续借、归还，支持时效管控和审批流程" />
    
    <div class="card-container">
      <el-row :gutter="16" class="stats-row">
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-content">
              <div class="stat-icon icon-blue">
                <el-icon><Reading /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.activeCount }}</div>
                <div class="stat-label">当前借阅</div>
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
                <div class="stat-value">{{ stats.overdueCount }}</div>
                <div class="stat-label">已过期</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-content">
              <div class="stat-icon icon-orange">
                <el-icon><Clock /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.pendingCount }}</div>
                <div class="stat-label">待审批</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-content">
              <div class="stat-icon icon-green">
                <el-icon><Finished /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stats.returnedCount }}</div>
                <div class="stat-label">已归还</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-tabs v-model="activeTab" class="borrow-tabs">
        <el-tab-pane label="我的借阅" name="my">
          <div class="filter-bar">
            <el-select v-model="filters.status" placeholder="借阅状态" clearable style="width: 140px">
              <el-option label="借阅中" value="active" />
              <el-option label="已过期" value="overdue" />
              <el-option label="待审批" value="pending" />
              <el-option label="已归还" value="returned" />
              <el-option label="已拒绝" value="rejected" />
            </el-select>
            
            <el-button type="primary" @click="loadMyBorrows">
              <el-icon><Search /></el-icon>
              查询
            </el-button>
          </div>

          <el-table :data="myBorrows" v-loading="myBorrowsLoading" stripe>
            <el-table-column type="index" width="60" label="#" />
            <el-table-column prop="document_title" label="文档" min-width="180" />
            <el-table-column label="密级" width="80">
              <template #default="{ row }">
                <SecretBadge :level="row.secret_level" />
              </template>
            </el-table-column>
            <el-table-column prop="borrow_type" label="类型" width="80">
              <template #default="{ row }">
                <el-tag :type="row.borrow_type === 'offline' ? 'warning' : 'primary'" size="small">
                  {{ row.borrow_type === 'offline' ? '离线' : '在线' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag 
                  :type="getBorrowStatusType(row.status, row.is_overdue)" 
                  size="small"
                >
                  {{ getBorrowStatusName(row.status, row.is_overdue) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="借阅时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column prop="due_at" label="到期时间" width="160">
              <template #default="{ row }">
                <span :class="{ 'text-danger': row.is_overdue }">
                  {{ formatDateTime(row.due_at) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="剩余时间" width="100">
              <template #default="{ row }">
                <span v-if="row.status === 'active' && !row.is_overdue">
                  {{ row.remaining_hours }}小时
                </span>
                <span v-else-if="row.is_overdue" class="text-danger">
                  已过期
                </span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="access_count" label="访问次数" width="90" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button 
                  v-if="row.status === 'active'"
                  type="primary" 
                  text 
                  size="small"
                  @click="viewDocument(row)"
                >
                  查看
                </el-button>
                <el-button 
                  v-if="row.status === 'active' && !row.is_overdue"
                  type="success" 
                  text 
                  size="small"
                  @click="showExtendDialog(row)"
                >
                  续借
                </el-button>
                <el-button 
                  v-if="row.status === 'active'"
                  type="warning" 
                  text 
                  size="small"
                  @click="returnDocument(row)"
                >
                  归还
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <PaginationWrapper 
            v-model:page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            @change="loadMyBorrows"
          />
        </el-tab-pane>
        
        <el-tab-pane label="借阅规则" name="rules">
          <el-card>
            <template #header>
              <span>文档借阅规则说明</span>
            </template>
            
            <el-table :data="borrowRules" stripe>
              <el-table-column prop="name" label="规则名称" width="180" />
              <el-table-column label="适用密级" width="100">
                <template #default="{ row }">
                  <SecretBadge :level="row.secret_level" />
                </template>
              </el-table-column>
              <el-table-column prop="max_borrow_days" label="最大借阅天数" width="120" align="center" />
              <el-table-column prop="max_borrow_count" label="最大借阅数量" width="120" align="center" />
              <el-table-column label="需要审批" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.require_approval ? 'warning' : 'success'" size="small">
                    {{ row.require_approval ? '是' : '否' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="允许离线" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.allow_offline ? 'success' : 'info'" size="small">
                    {{ row.allow_offline ? '是' : '否' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="max_offline_hours" label="最长离线时长" width="120" align="center">
                <template #default="{ row }">
                  {{ row.allow_offline ? row.max_offline_hours + '小时' : '-' }}
                </template>
              </el-table-column>
              <el-table-column label="允许续借" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.allow_extension ? 'success' : 'info'" size="small">
                    {{ row.allow_extension ? '是' : '否' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="max_extensions" label="最大续借次数" width="120" align="center">
                <template #default="{ row }">
                  {{ row.allow_extension ? row.max_extensions + '次' : '-' }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-tab-pane>
        
        <el-tab-pane label="待审批" name="pending" v-if="userStore.isManager">
          <el-table :data="pendingBorrows" v-loading="pendingLoading" stripe>
            <el-table-column type="index" width="60" label="#" />
            <el-table-column prop="document_title" label="文档" min-width="180" />
            <el-table-column label="密级" width="80">
              <template #default="{ row }">
                <SecretBadge :level="row.secret_level" />
              </template>
            </el-table-column>
            <el-table-column prop="user_real_name" label="申请人" width="120" />
            <el-table-column prop="borrow_type" label="借阅类型" width="80">
              <template #default="{ row }">
                {{ row.borrow_type === 'offline' ? '离线' : '在线' }}
              </template>
            </el-table-column>
            <el-table-column prop="borrow_reason" label="借阅理由" min-width="150" />
            <el-table-column prop="due_at" label="申请到期" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.due_at) }}
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="申请时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button type="success" text size="small" @click="handleApproveBorrow(row, true)">
                  通过
                </el-button>
                <el-button type="danger" text size="small" @click="handleApproveBorrow(row, false)">
                  拒绝
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        
        <el-tab-pane label="过期提醒" name="overdue" v-if="userStore.isAdmin">
          <el-alert 
            title="以下借阅已过期，请及时联系用户归还" 
            type="warning" 
            :closable="false"
            style="margin-bottom: 16px"
          />
          
          <el-table :data="overdueBorrows" v-loading="overdueLoading" stripe>
            <el-table-column type="index" width="60" label="#" />
            <el-table-column prop="document_title" label="文档" min-width="180" />
            <el-table-column label="密级" width="80">
              <template #default="{ row }">
                <SecretBadge :level="row.secret_level" />
              </template>
            </el-table-column>
            <el-table-column prop="user_real_name" label="借阅人" width="120" />
            <el-table-column prop="due_at" label="到期时间" width="160">
              <template #default="{ row }">
                <span class="text-danger">{{ formatDateTime(row.due_at) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="过期时长" width="120">
              <template #default="{ row }">
                <span class="text-danger">
                  {{ getOverdueDays(row.due_at) }}天
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="access_count" label="访问次数" width="90" />
            <el-table-column prop="last_access_at" label="最后访问" width="160">
              <template #default="{ row }">
                {{ row.last_access_at ? formatDateTime(row.last_access_at) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" text size="small">
                  催还
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
    
    <el-dialog v-model="extendDialogVisible" title="续借文档" width="500px">
      <el-form :model="extendForm" label-width="100px">
        <el-form-item label="文档名称">
          <span>{{ currentBorrow?.document_title }}</span>
        </el-form-item>
        <el-form-item label="当前到期">
          <span>{{ currentBorrow ? formatDateTime(currentBorrow.due_at) : '-' }}</span>
        </el-form-item>
        <el-form-item label="续借天数" prop="extendDays">
          <el-select v-model="extendForm.extendDays" style="width: 200px">
            <el-option :value="1" label="1天" />
            <el-option :value="3" label="3天" />
            <el-option :value="7" label="7天" />
            <el-option :value="14" label="14天" />
          </el-select>
        </el-form-item>
        <el-form-item label="续借理由">
          <el-input 
            v-model="extendForm.reason" 
            type="textarea"
            :rows="3"
            placeholder="请输入续借理由"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="extendDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitExtend">确认续借</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { Search, Tickets, Warning, Clock, Finished, Reading } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import PageHeader from '@/components/PageHeader.vue'
import PaginationWrapper from '@/components/PaginationWrapper.vue'
import SecretBadge from '@/components/SecretBadge.vue'
import {
  getMyBorrows,
  returnBorrow,
  extendBorrow,
  getBorrowRules,
  getOverdueBorrows,
  getPendingBorrows,
  approveBorrow,
} from '@/api/borrow'

const router = useRouter()
const userStore = useUserStore()

const activeTab = ref('my')
const myBorrowsLoading = ref(false)
const pendingLoading = ref(false)
const overdueLoading = ref(false)
const extendDialogVisible = ref(false)

const myBorrows = ref([])
const pendingBorrows = ref([])
const overdueBorrows = ref([])
const borrowRules = ref([])
const currentBorrow = ref(null)

const stats = reactive({
  activeCount: 0,
  overdueCount: 0,
  pendingCount: 0,
  returnedCount: 0,
})

const filters = reactive({
  status: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const extendForm = reactive({
  extendDays: 7,
  reason: '',
})

const loadMyBorrows = async () => {
  myBorrowsLoading.value = true
  try {
    const data = await getMyBorrows({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filters.status || undefined,
    })
    myBorrows.value = data.list || []
    pagination.total = data.total || 0
    
    stats.activeCount = myBorrows.value.filter(b => b.status === 'active' && !b.is_overdue).length
    stats.overdueCount = myBorrows.value.filter(b => b.is_overdue).length
    stats.returnedCount = myBorrows.value.filter(b => b.status === 'returned').length
  } catch (err) {
    ElMessage.error(err.message || '加载借阅列表失败')
  } finally {
    myBorrowsLoading.value = false
  }
}

const loadPendingBorrows = async () => {
  pendingLoading.value = true
  try {
    const data = await getPendingBorrows()
    pendingBorrows.value = data.list || []
    stats.pendingCount = data.total || 0
  } catch (err) {
    ElMessage.error(err.message || '加载待审批列表失败')
  } finally {
    pendingLoading.value = false
  }
}

const loadOverdueBorrows = async () => {
  overdueLoading.value = true
  try {
    const data = await getOverdueBorrows()
    overdueBorrows.value = data.list || []
  } catch (err) {
    ElMessage.error(err.message || '加载过期列表失败')
  } finally {
    overdueLoading.value = false
  }
}

const loadBorrowRules = async () => {
  try {
    borrowRules.value = await getBorrowRules()
  } catch (err) {
    ElMessage.error(err.message || '加载借阅规则失败')
  }
}

const viewDocument = (row) => {
  router.push(`/documents/${row.document_id}`)
}

const returnDocument = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要归还文档《${row.document_title}》吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    
    await returnBorrow(row.id)
    ElMessage.success('归还成功')
    loadMyBorrows()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '归还失败')
    }
  }
}

const showExtendDialog = (row) => {
  currentBorrow.value = row
  extendForm.extendDays = 7
  extendForm.reason = ''
  extendDialogVisible.value = true
}

const submitExtend = async () => {
  if (!currentBorrow.value) return
  
  try {
    await extendBorrow(currentBorrow.value.id, {
      extendDays: extendForm.extendDays,
      reason: extendForm.reason,
    })
    ElMessage.success('续借成功')
    extendDialogVisible.value = false
    loadMyBorrows()
  } catch (err) {
    ElMessage.error(err.message || '续借失败')
  }
}

const handleApproveBorrow = async (row, approved) => {
  const action = approved ? '通过' : '拒绝'
  try {
    await ElMessageBox.confirm(`确定要${action}该借阅申请吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    
    await approveBorrow(row.id, { approved })
    ElMessage.success(`已${action}`)
    loadPendingBorrows()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || `${action}失败`)
    }
  }
}

const getBorrowStatusType = (status, isOverdue) => {
  if (status === 'active' && isOverdue) return 'danger'
  const types = {
    active: 'success',
    pending: 'warning',
    returned: 'info',
    rejected: 'danger',
  }
  return types[status] || 'info'
}

const getBorrowStatusName = (status, isOverdue) => {
  if (status === 'active' && isOverdue) return '已过期'
  const names = {
    active: '借阅中',
    pending: '待审批',
    returned: '已归还',
    rejected: '已拒绝',
  }
  return names[status] || status
}

const getOverdueDays = (dueAt) => {
  const now = new Date()
  const due = new Date(dueAt)
  const diff = Math.ceil((now - due) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff)
}

const formatDateTime = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadMyBorrows()
  loadBorrowRules()
  if (userStore.isManager) {
    loadPendingBorrows()
  }
  if (userStore.isAdmin) {
    loadOverdueBorrows()
  }
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
      
      &.icon-red {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      }
      
      &.icon-orange {
        background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
      }
      
      &.icon-green {
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
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
  gap: 12px;
  margin-bottom: 20px;
}

.borrow-tabs {
  :deep(.el-tabs__content) {
    padding-top: 16px;
  }
}

.text-danger {
  color: #f56c6c;
  font-weight: 500;
}
</style>
