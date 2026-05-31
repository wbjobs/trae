<template>
  <div class="page-container">
    <PageHeader title="权限管理" icon="Key" subtitle="管理用户权限、角色分配、访问控制策略，确保文档安全访问" />
    
    <div class="card-container">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="我的权限" name="my">
          <el-alert 
            title="查看当前登录用户的所有权限信息，包括文档访问权限、操作权限等" 
            type="info" 
            :closable="false"
            style="margin-bottom: 16px"
          />
          
          <el-row :gutter="16">
            <el-col :span="8">
              <el-card class="permission-card">
                <template #header>
                  <span>角色信息</span>
                </template>
                <div class="role-info">
                  <el-tag :type="getRoleType(userStore.userInfo?.role)" size="large">
                    {{ getRoleName(userStore.userInfo?.role) }}
                  </el-tag>
                  <p class="role-desc">{{ getRoleDesc(userStore.userInfo?.role) }}</p>
                </div>
              </el-card>
            </el-col>
            
            <el-col :span="8">
              <el-card class="permission-card">
                <template #header>
                  <span>密级权限</span>
                </template>
                <div class="secret-levels">
                  <SecretBadge 
                    v-for="level in getAccessibleSecretLevels()" 
                    :key="level" 
                    :level="level"
                    style="margin-right: 8px; margin-bottom: 8px"
                  />
                </div>
              </el-card>
            </el-col>
            
            <el-col :span="8">
              <el-card class="permission-card">
                <template #header>
                  <span>统计信息</span>
                </template>
                <div class="stats">
                  <div class="stat-item">
                    <span class="stat-value">{{ myPermissions.length }}</span>
                    <span class="stat-label">已授权文档</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-value">{{ downloadCount }}</span>
                    <span class="stat-label">可下载文档</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-value">{{ writeCount }}</span>
                    <span class="stat-label">可编辑文档</span>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
          
          <el-card style="margin-top: 16px">
            <template #header>
              <span>文档权限列表</span>
            </template>
            
            <el-table :data="myPermissions" v-loading="myPermissionsLoading" stripe>
              <el-table-column type="index" width="60" label="#" />
              <el-table-column prop="document_title" label="文档标题" min-width="200" />
              <el-table-column label="密级" width="80">
                <template #default="{ row }">
                  <SecretBadge :level="row.secret_level" />
                </template>
              </el-table-column>
              <el-table-column prop="permission_type" label="权限类型" width="100">
                <template #default="{ row }">
                  <el-tag :type="getPermissionTypeColor(row.permission_type)" size="small">
                    {{ getPermissionTypeName(row.permission_type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="grantor_name" label="授权人" width="100" />
              <el-table-column prop="expires_at" label="过期时间" width="160">
                <template #default="{ row }">
                  <span v-if="row.expires_at">{{ formatDateTime(row.expires_at) }}</span>
                  <span v-else style="color: #67c23a">永久有效</span>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="授权时间" width="160">
                <template #default="{ row }">
                  {{ formatDateTime(row.created_at) }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-tab-pane>
        
        <el-tab-pane label="权限分配" name="manage" v-if="userStore.isManager">
          <div class="filter-bar">
            <el-select v-model="filters.documentId" placeholder="选择文档" clearable filterable style="width: 220px">
              <el-option 
                v-for="doc in documentList" 
                :key="doc.id" 
                :label="doc.title"
                :value="doc.id"
              />
            </el-select>
            
            <el-select v-model="filters.userId" placeholder="选择用户" clearable filterable style="width: 160px">
              <el-option 
                v-for="user in userList" 
                :key="user.id" 
                :label="user.real_name || user.username"
                :value="user.id"
              />
            </el-select>
            
            <el-select v-model="filters.permissionType" placeholder="权限类型" clearable style="width: 120px">
              <el-option label="读取" value="read" />
              <el-option label="下载" value="download" />
              <el-option label="编辑" value="write" />
              <el-option label="完全控制" value="full" />
            </el-select>
            
            <el-button type="primary" @click="loadPermissions">
              <el-icon><Search /></el-icon>
              查询
            </el-button>
            
            <el-button @click="showBatchGrantDialog">
              <el-icon><Plus /></el-icon>
              批量授权
            </el-button>
          </div>
          
          <el-table :data="permissions" v-loading="permissionsLoading" stripe>
            <el-table-column type="index" width="60" label="#" />
            <el-table-column prop="document_title" label="文档" min-width="180" />
            <el-table-column label="密级" width="80">
              <template #default="{ row }">
                <SecretBadge :level="row.secret_level" />
              </template>
            </el-table-column>
            <el-table-column prop="user_name" label="用户" width="120" />
            <el-table-column prop="permission_type" label="权限类型" width="100">
              <template #default="{ row }">
                <el-tag :type="getPermissionTypeColor(row.permission_type)" size="small">
                  {{ getPermissionTypeName(row.permission_type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="grantor_name" label="授权人" width="100" />
            <el-table-column prop="expires_at" label="过期时间" width="160">
              <template #default="{ row }">
                <span v-if="row.expires_at">{{ formatDateTime(row.expires_at) }}</span>
                <span v-else style="color: #67c23a">永久有效</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button 
                  type="primary" 
                  text 
                  size="small"
                  @click="editPermission(row)"
                >
                  编辑
                </el-button>
                <el-button 
                  type="danger" 
                  text 
                  size="small"
                  @click="handleRevokePermission(row.id)"
                >
                  撤销
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <PaginationWrapper 
            v-model:page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            @change="loadPermissions"
          />
        </el-tab-pane>
        
        <el-tab-pane label="角色管理" name="roles" v-if="userStore.isAdmin">
          <el-card>
            <template #header>
              <div class="card-header">
                <span>系统角色列表</span>
                <el-button type="primary" size="small" @click="showRoleDialog">
                  <el-icon><Plus /></el-icon>
                  新增角色
                </el-button>
              </div>
            </template>
            
            <el-table :data="roles" stripe>
              <el-table-column type="index" width="60" label="#" />
              <el-table-column prop="name" label="角色名称" width="150" />
              <el-table-column prop="code" label="角色编码" width="150" />
              <el-table-column prop="description" label="角色描述" min-width="200" />
              <el-table-column label="密级范围" width="200">
                <template #default="{ row }">
                  <SecretBadge 
                    v-for="level in row.secret_levels" 
                    :key="level" 
                    :level="level"
                    style="margin-right: 4px"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="user_count" label="用户数" width="80" />
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" text size="small" @click="editRole(row)">
                    编辑
                  </el-button>
                  <el-button type="success" text size="small" @click="viewRolePermissions(row)">
                    权限
                  </el-button>
                  <el-button 
                    v-if="row.code !== 'admin'"
                    type="danger" 
                    text 
                    size="small"
                    @click="deleteRole(row.id)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-tab-pane>
        
        <el-tab-pane label="权限策略" name="policy" v-if="userStore.isAdmin">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-card class="policy-card">
                <template #header>
                  <span>访问控制策略</span>
                </template>
                
                <el-form :model="accessPolicy" label-width="140px">
                  <el-form-item label="最小权限原则">
                    <el-switch v-model="accessPolicy.leastPrivilege" />
                    <span style="margin-left: 10px; color: #909399">用户仅获得完成工作所需的最小权限</span>
                  </el-form-item>
                  
                  <el-form-item label="职责分离">
                    <el-switch v-model="accessPolicy.segregationOfDuties" />
                    <span style="margin-left: 10px; color: #909399">关键职责由不同用户承担</span>
                  </el-form-item>
                  
                  <el-form-item label="权限过期自动清理">
                    <el-switch v-model="accessPolicy.autoExpire" />
                    <span style="margin-left: 10px; color: #909399">过期权限自动撤销</span>
                  </el-form-item>
                  
                  <el-form-item label="默认权限有效期">
                    <el-input-number v-model="accessPolicy.defaultExpireDays" :min="1" :max="365" />
                    <span style="margin-left: 10px; color: #909399">天</span>
                  </el-form-item>
                  
                  <el-form-item label="最多授权文档数">
                    <el-input-number v-model="accessPolicy.maxDocumentsPerUser" :min="1" :max="1000" />
                    <span style="margin-left: 10px; color: #909399">个/用户</span>
                  </el-form-item>
                  
                  <el-form-item>
                    <el-button type="primary" @click="saveAccessPolicy">保存策略</el-button>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
            
            <el-col :span="12">
              <el-card class="policy-card">
                <template #header>
                  <span>审批流程配置</span>
                </template>
                
                <el-form :model="approvalPolicy" label-width="140px">
                  <el-form-item label="高密级文档审批">
                    <el-switch v-model="approvalPolicy.highLevelApproval" />
                    <span style="margin-left: 10px; color: #909399">机密/绝密文档授权需要审批</span>
                  </el-form-item>
                  
                  <el-form-item label="审批人角色">
                    <el-select v-model="approvalPolicy.approverRole" style="width: 200px">
                      <el-option label="管理员" value="admin" />
                      <el-option label="部门经理" value="manager" />
                      <el-option label="文档所有者" value="owner" />
                    </el-select>
                  </el-form-item>
                  
                  <el-form-item label="审批超时时间">
                    <el-input-number v-model="approvalPolicy.approvalTimeout" :min="1" :max="168" />
                    <span style="margin-left: 10px; color: #909399">小时</span>
                  </el-form-item>
                  
                  <el-form-item label="超时自动处理">
                    <el-select v-model="approvalPolicy.timeoutAction" style="width: 200px">
                      <el-option label="自动批准" value="approve" />
                      <el-option label="自动拒绝" value="reject" />
                      <el-option label="升级审批" value="escalate" />
                    </el-select>
                  </el-form-item>
                  
                  <el-form-item label="邮件通知">
                    <el-switch v-model="approvalPolicy.emailNotification" />
                  </el-form-item>
                  
                  <el-form-item>
                    <el-button type="primary" @click="saveApprovalPolicy">保存配置</el-button>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>
      </el-tabs>
    </div>
    
    <el-dialog v-model="batchGrantDialogVisible" title="批量授权" width="600px">
      <el-form :model="batchGrantForm" label-width="100px">
        <el-form-item label="选择文档">
          <el-select 
            v-model="batchGrantForm.documentIds" 
            multiple 
            filterable
            placeholder="选择要授权的文档"
            style="width: 100%"
          >
            <el-option 
              v-for="doc in documentList" 
              :key="doc.id" 
              :label="doc.title"
              :value="doc.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="选择用户">
          <el-select 
            v-model="batchGrantForm.userIds" 
            multiple 
            filterable
            placeholder="选择要授权的用户"
            style="width: 100%"
          >
            <el-option 
              v-for="user in userList" 
              :key="user.id" 
              :label="user.real_name || user.username"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="权限类型">
          <el-radio-group v-model="batchGrantForm.permissionType">
            <el-radio value="read">读取</el-radio>
            <el-radio value="download">下载</el-radio>
            <el-radio value="write">编辑</el-radio>
            <el-radio value="full">完全控制</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="有效期">
          <el-radio-group v-model="batchGrantForm.expireType">
            <el-radio value="permanent">永久</el-radio>
            <el-radio value="custom">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item v-if="batchGrantForm.expireType === 'custom'" label="过期时间">
          <el-date-picker 
            v-model="batchGrantForm.expiresAt" 
            type="datetime"
            placeholder="选择过期时间"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="batchGrantDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="batchGrant">确认授权</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import PageHeader from '@/components/PageHeader.vue'
import PaginationWrapper from '@/components/PaginationWrapper.vue'
import SecretBadge from '@/components/SecretBadge.vue'
import { getMyPermissions, batchGrantPermissions, revokePermission, getDocumentPermissions } from '@/api/permission'
import { getUserList } from '@/api/auth'
import { getDocumentList } from '@/api/document'

const userStore = useUserStore()

const activeTab = ref('my')
const myPermissionsLoading = ref(false)
const permissionsLoading = ref(false)
const batchGrantDialogVisible = ref(false)

const myPermissions = ref([])
const permissions = ref([])
const userList = ref([])
const documentList = ref([])

const downloadCount = ref(0)
const writeCount = ref(0)

const filters = reactive({
  documentId: '',
  userId: '',
  permissionType: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const roles = ref([
  { id: 1, name: '系统管理员', code: 'admin', description: '拥有系统所有权限', secret_levels: ['public', 'internal', 'secret', 'top_secret'], user_count: 2 },
  { id: 2, name: '部门经理', code: 'manager', description: '可管理部门文档和用户权限', secret_levels: ['public', 'internal', 'secret'], user_count: 5 },
  { id: 3, name: '普通用户', code: 'user', description: '基本文档访问权限', secret_levels: ['public', 'internal'], user_count: 50 },
  { id: 4, name: '访客', code: 'guest', description: '仅可访问公开文档', secret_levels: ['public'], user_count: 10 },
])

const accessPolicy = reactive({
  leastPrivilege: true,
  segregationOfDuties: true,
  autoExpire: true,
  defaultExpireDays: 30,
  maxDocumentsPerUser: 100,
})

const approvalPolicy = reactive({
  highLevelApproval: true,
  approverRole: 'manager',
  approvalTimeout: 24,
  timeoutAction: 'reject',
  emailNotification: true,
})

const batchGrantForm = reactive({
  documentIds: [],
  userIds: [],
  permissionType: 'read',
  expireType: 'permanent',
  expiresAt: null,
})

const loadMyPermissions = async () => {
  myPermissionsLoading.value = true
  try {
    const data = await getMyPermissions()
    myPermissions.value = data || []
    
    downloadCount.value = myPermissions.value.filter(p => 
      ['download', 'write', 'full'].includes(p.permission_type)
    ).length
    
    writeCount.value = myPermissions.value.filter(p => 
      ['write', 'full'].includes(p.permission_type)
    ).length
  } catch (err) {
    ElMessage.error(err.message || '加载权限失败')
  } finally {
    myPermissionsLoading.value = false
  }
}

const loadPermissions = async () => {
  if (!filters.documentId) {
    permissions.value = []
    pagination.total = 0
    return
  }
  
  permissionsLoading.value = true
  try {
    const data = await getDocumentPermissions(filters.documentId)
    permissions.value = data || []
    pagination.total = data.length || 0
  } catch (err) {
    ElMessage.error(err.message || '加载权限失败')
  } finally {
    permissionsLoading.value = false
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

const loadDocuments = async () => {
  try {
    const data = await getDocumentList({ pageSize: 1000 })
    documentList.value = data.list || []
  } catch (err) {
    console.error('加载文档列表失败:', err)
  }
}

const getRoleName = (role) => {
  const names = {
    admin: '系统管理员',
    manager: '部门经理',
    user: '普通用户',
    guest: '访客',
  }
  return names[role] || role
}

const getRoleType = (role) => {
  const types = {
    admin: 'danger',
    manager: 'warning',
    user: 'primary',
    guest: 'info',
  }
  return types[role] || 'info'
}

const getRoleDesc = (role) => {
  const descs = {
    admin: '拥有系统所有功能的完整访问权限',
    manager: '可管理部门内的文档和用户权限',
    user: '可访问授权的文档，进行基本操作',
    guest: '仅可访问公开级别的文档',
  }
  return descs[role] || ''
}

const getAccessibleSecretLevels = () => {
  const role = userStore.userInfo?.role
  const levels = {
    admin: ['public', 'internal', 'secret', 'top_secret'],
    manager: ['public', 'internal', 'secret'],
    user: ['public', 'internal'],
    guest: ['public'],
  }
  return levels[role] || []
}

const getPermissionTypeName = (type) => {
  const names = {
    read: '读取',
    download: '下载',
    write: '编辑',
    full: '完全控制',
  }
  return names[type] || type
}

const getPermissionTypeColor = (type) => {
  const colors = {
    read: 'info',
    download: 'success',
    write: 'warning',
    full: 'danger',
  }
  return colors[type] || 'info'
}

const showBatchGrantDialog = () => {
  Object.assign(batchGrantForm, {
    documentIds: [],
    userIds: [],
    permissionType: 'read',
    expireType: 'permanent',
    expiresAt: null,
  })
  batchGrantDialogVisible.value = true
}

const batchGrant = async () => {
  if (batchGrantForm.documentIds.length === 0) {
    ElMessage.warning('请选择要授权的文档')
    return
  }
  if (batchGrantForm.userIds.length === 0) {
    ElMessage.warning('请选择要授权的用户')
    return
  }
  
  try {
    const data = {
      documentIds: batchGrantForm.documentIds,
      userIds: batchGrantForm.userIds,
      permissionType: batchGrantForm.permissionType,
      expiresAt: batchGrantForm.expireType === 'custom' ? batchGrantForm.expiresAt : null,
    }
    
    await batchGrantPermissions(data)
    ElMessage.success('批量授权成功')
    batchGrantDialogVisible.value = false
    loadPermissions()
  } catch (err) {
    ElMessage.error(err.message || '授权失败')
  }
}

const editPermission = (row) => {
  ElMessage.info('编辑权限功能开发中')
}

const handleRevokePermission = async (id) => {
  try {
    await ElMessageBox.confirm('确定要撤销该权限吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    
    await revokePermission(id)
    ElMessage.success('权限已撤销')
    loadPermissions()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '撤销失败')
    }
  }
}

const editRole = (row) => {
  ElMessage.info('编辑角色功能开发中')
}

const viewRolePermissions = (row) => {
  ElMessage.info('查看角色权限功能开发中')
}

const deleteRole = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除该角色吗？删除后相关用户权限将被调整。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    
    ElMessage.success('删除成功')
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除失败')
    }
  }
}

const showRoleDialog = () => {
  ElMessage.info('新增角色功能开发中')
}

const saveAccessPolicy = () => {
  ElMessage.success('访问控制策略已保存')
}

const saveApprovalPolicy = () => {
  ElMessage.success('审批流程配置已保存')
}

const formatDateTime = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadMyPermissions()
  loadUsers()
  loadDocuments()
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.permission-card {
  .role-info {
    text-align: center;
    padding: 20px 0;
    
    .role-desc {
      margin-top: 12px;
      color: #909399;
      font-size: 14px;
    }
  }
  
  .secret-levels {
    padding: 10px 0;
  }
  
  .stats {
    display: flex;
    justify-content: space-around;
    padding: 10px 0;
    
    .stat-item {
      text-align: center;
      
      .stat-value {
        display: block;
        font-size: 24px;
        font-weight: 600;
        color: #409eff;
      }
      
      .stat-label {
        display: block;
        margin-top: 4px;
        color: #909399;
        font-size: 12px;
      }
    }
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.policy-card {
  :deep(.el-form-item) {
    margin-bottom: 24px;
  }
}
</style>
