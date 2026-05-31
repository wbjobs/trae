<template>
  <div class="page-container">
    <PageHeader title="用户管理" icon="UserFilled" subtitle="管理系统用户、角色分配、账号状态，支持批量操作和用户审计" />
    
    <div class="card-container">
      <div class="filter-bar">
        <el-input 
          v-model="filters.keyword" 
          placeholder="搜索用户名、真实姓名、邮箱" 
          style="width: 240px"
          clearable
          @keyup.enter="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-select v-model="filters.role" placeholder="角色" clearable style="width: 120px">
          <el-option label="管理员" value="admin" />
          <el-option label="经理" value="manager" />
          <el-option label="用户" value="user" />
          <el-option label="访客" value="guest" />
        </el-select>
        
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px">
          <el-option label="正常" value="active" />
          <el-option label="禁用" value="disabled" />
          <el-option label="锁定" value="locked" />
        </el-select>
        
        <el-select v-model="filters.department" placeholder="部门" clearable filterable style="width: 140px">
          <el-option label="技术部" value="tech" />
          <el-option label="财务部" value="finance" />
          <el-option label="人事部" value="hr" />
          <el-option label="市场部" value="marketing" />
          <el-option label="运营部" value="operation" />
        </el-select>
        
        <el-button type="primary" @click="loadData">
          <el-icon><Search /></el-icon>
          查询
        </el-button>
        
        <el-button @click="resetFilters">
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
        
        <el-button type="success" @click="showCreateDialog">
          <el-icon><Plus /></el-icon>
          新增用户
        </el-button>
        
        <el-button type="warning" @click="batchImport" :disabled="selectedUsers.length === 0">
          <el-icon><Upload /></el-icon>
          批量导入
        </el-button>
      </div>
      
      <el-table 
        :data="users" 
        v-loading="loading" 
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column type="index" width="60" label="#" />
        <el-table-column label="用户信息" min-width="180">
          <template #default="{ row }">
            <div class="user-info-cell">
              <el-avatar :size="40" :icon="UserFilled" />
              <div class="user-details">
                <div class="username">{{ row.real_name || row.username }}</div>
                <div class="user-account">@{{ row.username }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="department" label="部门" width="100">
          <template #default="{ row }">
            {{ getDepartmentName(row.department) }}
          </template>
        </el-table-column>
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="getRoleType(row.role)" size="small">
              {{ getRoleName(row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="密级权限" width="150">
          <template #default="{ row }">
            <SecretBadge 
              v-for="level in getSecretLevelsByRole(row.role)" 
              :key="level" 
              :level="level"
              style="margin-right: 4px"
            />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusName(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_login_at" label="最后登录" width="160">
          <template #default="{ row }">
            {{ row.last_login_at ? formatDateTime(row.last_login_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="editUser(row)">
              编辑
            </el-button>
            <el-button 
              v-if="row.status === 'active'"
              type="warning" 
              text 
              size="small"
              @click="toggleUserStatus(row, 'disabled')"
            >
              禁用
            </el-button>
            <el-button 
              v-else
              type="success" 
              text 
              size="small"
              @click="toggleUserStatus(row, 'active')"
            >
              启用
            </el-button>
            <el-button 
              v-if="row.username !== 'admin'"
              type="danger" 
              text 
              size="small"
              @click="handleDeleteUser(row.id)"
            >
              删除
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
    </div>
    
    <el-dialog 
      v-model="userDialogVisible" 
      :title="isEdit ? '编辑用户' : '新增用户'" 
      width="600px"
    >
      <el-form :model="userForm" :rules="userRules" ref="userFormRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" :disabled="isEdit" placeholder="请输入用户名" />
        </el-form-item>
        
        <el-form-item label="真实姓名" prop="realName">
          <el-input v-model="userForm.realName" placeholder="请输入真实姓名" />
        </el-form-item>
        
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input v-model="userForm.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="userForm.phone" placeholder="请输入手机号" />
        </el-form-item>
        
        <el-form-item label="部门" prop="department">
          <el-select v-model="userForm.department" placeholder="请选择部门" style="width: 100%">
            <el-option label="技术部" value="tech" />
            <el-option label="财务部" value="finance" />
            <el-option label="人事部" value="hr" />
            <el-option label="市场部" value="marketing" />
            <el-option label="运营部" value="operation" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="角色" prop="role">
          <el-radio-group v-model="userForm.role">
            <el-radio value="admin">管理员</el-radio>
            <el-radio value="manager">经理</el-radio>
            <el-radio value="user">用户</el-radio>
            <el-radio value="guest">访客</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="状态">
          <el-radio-group v-model="userForm.status">
            <el-radio value="active">正常</el-radio>
            <el-radio value="disabled">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="备注">
          <el-input 
            v-model="userForm.remark" 
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, Upload, UserFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import PaginationWrapper from '@/components/PaginationWrapper.vue'
import SecretBadge from '@/components/SecretBadge.vue'
import { getUserList, createUser, updateUser, deleteUser } from '@/api/auth'

const loading = ref(false)
const userDialogVisible = ref(false)
const isEdit = ref(false)
const userFormRef = ref(null)
const selectedUsers = ref([])

const users = ref([])

const filters = reactive({
  keyword: '',
  role: '',
  status: '',
  department: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const userForm = reactive({
  id: null,
  username: '',
  realName: '',
  password: '',
  email: '',
  phone: '',
  department: '',
  role: 'user',
  status: 'active',
  remark: '',
})

const userRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  realName: [{ required: true, message: '请输入真实姓名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' },
  ],
  department: [{ required: true, message: '请选择部门', trigger: 'change' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filters.keyword || undefined,
      role: filters.role || undefined,
      status: filters.status || undefined,
      department: filters.department || undefined,
    }
    
    const data = await getUserList(params)
    users.value = data.list || []
    pagination.total = data.total || 0
  } catch (err) {
    ElMessage.error(err.message || '加载用户列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.role = ''
  filters.status = ''
  filters.department = ''
  pagination.page = 1
  loadData()
}

const handleSelectionChange = (selection) => {
  selectedUsers.value = selection
}

const showCreateDialog = () => {
  isEdit.value = false
  Object.assign(userForm, {
    id: null,
    username: '',
    realName: '',
    password: '',
    email: '',
    phone: '',
    department: '',
    role: 'user',
    status: 'active',
    remark: '',
  })
  userDialogVisible.value = true
}

const editUser = (row) => {
  isEdit.value = true
  Object.assign(userForm, {
    id: row.id,
    username: row.username,
    realName: row.real_name,
    password: '',
    email: row.email,
    phone: row.phone,
    department: row.department,
    role: row.role,
    status: row.status,
    remark: row.remark || '',
  })
  userDialogVisible.value = true
}

const saveUser = async () => {
  if (!userFormRef.value) return
  
  try {
    await userFormRef.value.validate()
    
    const data = {
      username: userForm.username,
      real_name: userForm.realName,
      email: userForm.email,
      phone: userForm.phone,
      department: userForm.department,
      role: userForm.role,
      status: userForm.status,
      remark: userForm.remark,
    }
    
    if (isEdit.value) {
      if (userForm.password) {
        data.password = userForm.password
      }
      await updateUser(userForm.id, data)
      ElMessage.success('更新成功')
    } else {
      data.password = userForm.password
      await createUser(data)
      ElMessage.success('创建成功')
    }
    
    userDialogVisible.value = false
    loadData()
  } catch (err) {
    if (err !== false) {
      ElMessage.error(err.message || '保存失败')
    }
  }
}

const toggleUserStatus = async (row, status) => {
  const action = status === 'disabled' ? '禁用' : '启用'
  try {
    await ElMessageBox.confirm(`确定要${action}该用户吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    
    await updateUser(row.id, { status })
    ElMessage.success(`${action}成功`)
    loadData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || `${action}失败`)
    }
  }
}

const handleDeleteUser = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除该用户吗？删除后不可恢复。', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    
    await deleteUser(id)
    ElMessage.success('删除成功')
    loadData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除失败')
    }
  }
}

const batchImport = () => {
  ElMessage.info('批量导入功能开发中')
}

const getDepartmentName = (dept) => {
  const names = {
    tech: '技术部',
    finance: '财务部',
    hr: '人事部',
    marketing: '市场部',
    operation: '运营部',
  }
  return names[dept] || dept || '-'
}

const getRoleName = (role) => {
  const names = {
    admin: '管理员',
    manager: '经理',
    user: '用户',
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

const getSecretLevelsByRole = (role) => {
  const levels = {
    admin: ['public', 'internal', 'secret', 'top_secret'],
    manager: ['public', 'internal', 'secret'],
    user: ['public', 'internal'],
    guest: ['public'],
  }
  return levels[role] || []
}

const getStatusName = (status) => {
  const names = {
    active: '正常',
    disabled: '禁用',
    locked: '锁定',
  }
  return names[status] || status
}

const getStatusType = (status) => {
  const types = {
    active: 'success',
    disabled: 'danger',
    locked: 'warning',
  }
  return types[status] || 'info'
}

const formatDateTime = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.user-info-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .user-details {
    .username {
      font-weight: 500;
      color: #303133;
    }
    
    .user-account {
      font-size: 12px;
      color: #909399;
    }
  }
}
</style>
