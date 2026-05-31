<template>
  <div class="auth-container">
    <div class="page-header">
      <h2 class="page-title">
        <el-icon size="24" color="#409eff"><Lock /></el-icon>
        权限分发管理
      </h2>
    </div>

    <el-tabs v-model="activeTab" class="auth-tabs">
      <el-tab-pane label="用户管理" name="user">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-input
              v-model="userSearch"
              placeholder="搜索用户名/姓名"
              prefix-icon="Search"
              clearable
              class="search-input"
            />
          </div>
            <el-button type="primary" @click="openUserDialog">
              <el-icon><Plus /></el-icon>
              新增用户
            </el-button>
          </div>
        </div>

        <div class="table-card">
          <el-table :data="filteredUsers" stripe v-loading="userLoading">
            <el-table-column prop="username" label="用户名" width="140" />
            <el-table-column prop="realName" label="姓名" width="120" />
            <el-table-column prop="email" label="邮箱" width="200" />
            <el-table-column prop="phone" label="手机号" width="140" />
            <el-table-column prop="role" label="角色" width="140">
              <template #default="{ row }">
                <el-tag :type="getRoleTagType(row.role)">{{ getRoleName(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="factory" label="所属厂区" width="120">
              <template #default="{ row }">
                <el-tag :type="getFactoryTagType(row.factory)">{{ getFactoryName(row.factory) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-switch
                  v-model="row.status"
                  :active-value="1"
                  :inactive-value="0"
                  @change="toggleUserStatus(row)"
                />
              </template>
            </el-table-column>
            <el-table-column prop="createTime" label="创建时间" width="180" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" text @click="editUser(row)">编辑</el-button>
                <el-button type="warning" text @click="assignRole(row)">分配角色</el-button>
                <el-button type="danger" text @click="deleteUser(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-model:current-page="userPagination.page"
            v-model:page-size="userPagination.pageSize"
            :total="userPagination.total"
            class="pagination"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="角色管理" name="role">
        <div class="toolbar">
          <el-button type="primary" @click="openRoleDialog">
            <el-icon><Plus /></el-icon>
            新增角色
          </el-button>
        </div>

        <el-row :gutter="20">
          <el-col :span="8" v-for="role in roles" :key="role.id">
            <el-card class="role-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <div class="role-info">
                    <el-tag :type="role.type" effect="dark">{{ role.name }}</el-tag>
                    <span class="role-code">{{ role.code }}</span>
                  </div>
                  <el-dropdown @command="(cmd) => handleRoleAction(cmd, role)">
                    <el-button type="primary" text>
                      <el-icon><MoreFilled /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="edit">编辑</el-dropdown-item>
                        <el-dropdown-item command="permission">配置权限</el-dropdown-item>
                        <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
              <p class="role-desc">{{ role.description }}</p>
              <div class="role-stats">
                <span>用户数: {{ role.userCount }}</span>
                <span>权限数: {{ role.permissionCount }}</span>
              </div>
              <div class="role-permissions">
                <el-tag
                  v-for="p in role.permissions.slice(0, 5)"
                  :key="p"
                  size="small"
                  class="perm-tag"
                >
                  {{ p }}
                </el-tag>
                <el-tag v-if="role.permissions.length > 5" size="small" class="perm-tag">
                  +{{ role.permissions.length - 5 }}
                </el-tag>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane label="权限管理" name="permission">
        <el-tree
          :data="permissionTree"
          show-checkbox
          node-key="id"
          default-expand-all
          ref="permissionTreeRef"
          class="permission-tree"
        >
          <template #default="{ node, data }">
            <span class="custom-tree-node">
              <el-icon><component :is="data.icon || 'Menu'" /></el-icon>
              <span class="node-label">{{ data.label }}</span>
              <el-tag v-if="data.type" size="small" type="info">{{ data.type }}</el-tag>
            </span>
          </template>
        </el-tree>
      </el-tab-pane>

      <el-tab-pane label="操作日志" name="log">
        <div class="filter-bar">
          <el-form :inline="true" :model="logFilter" class="filter-form">
            <el-form-item label="操作用户">
              <el-input v-model="logFilter.username" placeholder="请输入用户名" clearable />
            </el-form-item>
            <el-form-item label="操作类型">
              <el-select v-model="logFilter.action" placeholder="全部类型" clearable>
                <el-option label="新增" value="create" />
                <el-option label="修改" value="update" />
                <el-option label="删除" value="delete" />
                <el-option label="查询" value="query" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="searchLogs">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="table-card">
          <el-table :data="authLogs" stripe v-loading="logLoading" height="500">
            <el-table-column prop="timestamp" label="操作时间" width="180" />
            <el-table-column prop="username" label="操作用户" width="120" />
            <el-table-column prop="action" label="操作类型" width="100">
              <template #default="{ row }">
                <el-tag :type="getActionTagType(row.action)">{{ getActionText(row.action) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="target" label="操作对象" width="150" />
            <el-table-column prop="description" label="操作描述" min-width="250" />
            <el-table-column prop="ip" label="IP地址" width="140" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.success ? 'success' : 'danger'" effect="dark" size="small">
                  {{ row.success ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="userDialogVisible" :title="isEditUser ? '编辑用户' : '新增用户" width="600px">
      <el-form :model="userForm" :rules="userRules" ref="userFormRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" :disabled="isEditUser" />
        </el-form-item>
        <el-form-item label="姓名" prop="realName">
          <el-input v-model="userForm.realName" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="userForm.phone" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="userForm.role" placeholder="请选择角色">
            <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属厂区" prop="factory">
          <el-select v-model="userForm.factory" placeholder="请选择厂区">
            <el-option label="厂区A" value="factory-a" />
            <el-option label="厂区B" value="factory-b" />
            <el-option label="厂区C" value="factory-c" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isEditUser" label="密码" prop="password">
          <el-input v-model="userForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveUser">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roleDialogVisible" :title="isEditRole ? '编辑角色' : '新增角色" width="600px">
      <el-form :model="roleForm" :rules="roleRules" ref="roleFormRef" label-width="100px">
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="roleForm.name" />
        </el-form-item>
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="roleForm.code" :disabled="isEditRole" />
        </el-form-item>
        <el-form-item label="角色类型" prop="type">
          <el-select v-model="roleForm.type">
            <el-option label="系统角色" value="primary" />
            <el-option label="业务角色" value="success" />
            <el-option label="自定义角色" value="warning" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色描述" prop="description">
          <el-input v-model="roleForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="权限配置">
          <el-tree
            :data="permissionTree"
            show-checkbox
            node-key="id"
            default-expand-all
            ref="rolePermissionTreeRef"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRole">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getUserListApi, saveUserApi, updateUserApi, deleteUserApi,
  getRoleListApi, saveRoleApi, updateRoleApi, deleteRoleApi,
  getPermissionTreeApi, getAuthLogsApi
} from './api/auth'

const activeTab = ref('user')
const userSearch = ref('')
const userLoading = ref(false)
const logLoading = ref(false)

const users = ref([])
const userPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const roles = ref([])
const permissionTree = ref([])
const authLogs = ref([])

const userDialogVisible = ref(false)
const roleDialogVisible = ref(false)
const isEditUser = ref(false)
const isEditRole = ref(false)

const userForm = reactive({
  id: '',
  username: '',
  realName: '',
  email: '',
  password: '',
  phone: '',
  role: '',
  factory: ''
})

const roleForm = reactive({
  id: '',
  name: '',
  code: '',
  type: '',
  description: '',
  permissions: []
})

const userRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  email: [{ required: true, message: '请输入邮箱', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  factory: [{ required: true, message: '请选择厂区', trigger: 'change' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const roleRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }]
}

const logFilter = reactive({
  username: '',
  action: ''
})

const filteredUsers = computed(() => {
  if (!userSearch.value) {
    const keyword = userSearch.value.toLowerCase()
    return users.value.filter(u =>
      u.username.toLowerCase().includes(keyword) ||
      u.realName.toLowerCase().includes(keyword)
  }
  return users.value
})

const getRoleName = (role) => {
  const map = { admin: '超级管理员', manager: '管理员', operator: '操作员', viewer: '查看员' }
  return map[role] || role
}

const getRoleTagType = (role) => {
  const map = { admin: 'danger', manager: 'warning', operator: 'primary', viewer: 'info' }
  return map[role] || 'info'
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
  const map = { create: '新增', update: '修改', delete: '删除', query: '查询' }
  return map[action] || action
}

const getActionTagType = (action) => {
  const map = { create: 'success', update: 'warning', delete: 'danger', query: 'info' }
  return map[action] || 'info'
}

const loadUsers = async () => {
  userLoading.value = true
  try {
    const res = await getUserListApi({
      page: userPagination.page,
      pageSize: userPagination.pageSize
    })
    users.value = res.data.list
    userPagination.total = res.data.total
  } catch (error) {
    ElMessage.error('加载用户列表失败')
  } finally {
    userLoading.value = false
  }
}

const loadRoles = async () => {
  try {
    const res = await getRoleListApi()
    roles.value = res.data
  } catch (error) {
    ElMessage.error('加载角色列表失败')
  }
}

const loadPermissions = async () => {
  try {
    const res = await getPermissionTreeApi()
    permissionTree.value = res.data
  } catch (error) {
    ElMessage.error('加载权限树失败')
  }
}

const loadLogs = async () => {
  logLoading.value = true
  try {
    const res = await getAuthLogsApi(logFilter)
    authLogs.value = res.data.list
  } catch (error) {
    ElMessage.error('加载操作日志失败')
  } finally {
    logLoading.value = false
  }
}

const searchLogs = () => {
  loadLogs()
}

const openUserDialog = () => {
  isEditUser.value = false
  Object.assign(userForm, {
    id: '',
    username: '',
    realName: '',
    email: '',
    password: '',
    phone: '',
    role: '',
    factory: ''
  })
  userDialogVisible.value = true
}

const editUser = (row) => {
  isEditUser.value = true
  Object.assign(userForm, { ...row })
  userDialogVisible.value = true
}

const saveUser = async () => {
  try {
    if (isEditUser.value) {
      await updateUserApi(userForm.id, userForm)
      ElMessage.success('更新用户成功')
    } else {
      await saveUserApi(userForm)
      ElMessage.success('新增用户成功')
    }
    userDialogVisible.value = false
    loadUsers()
  } catch (error) {
    ElMessage.error('保存用户失败')
  }
}

const deleteUser = (row) => {
  ElMessageBox.confirm(`确定要删除用户 "${row.username}"吗？`, '提示', {
    type: 'warning'
  }).then(async () => {
    try {
      await deleteUserApi(row.id)
      ElMessage.success('删除用户成功')
      loadUsers()
    } catch (error) {
      ElMessage.error('删除用户失败')
    }
  }).catch(() => {})
}

const toggleUserStatus = async (row) => {
  try {
    await updateUserApi(row.id, { status: row.status })
    ElMessage.success('状态更新成功')
  } catch (error) {
    row.status = row.status === 1 ? 0 : 1
    ElMessage.error('状态更新失败')
  }
}

const assignRole = (row) => {
  ElMessage.info(`为用户 "${row.username}" 分配角色功能')
}

const openRoleDialog = () => {
  isEditRole.value = false
  Object.assign(roleForm, {
    id: '',
    name: '',
    code: '',
    type: '',
    description: '',
    permissions: []
  })
  roleDialogVisible.value = true
}

const handleRoleAction = (cmd, role) => {
  if (cmd === 'edit') {
    isEditRole.value = true
    Object.assign(roleForm, { ...role })
    roleDialogVisible.value = true
  } else if (cmd === 'permission') {
    ElMessage.info(`配置角色 "${role.name}" 的权限')
  } else if (cmd === 'delete') {
    ElMessageBox.confirm(`确定要删除角色 "${role.name}"吗？`, '提示', {
      type: 'warning'
    }).then(async () => {
      try {
        await deleteRoleApi(role.id)
        ElMessage.success('删除角色成功')
        loadRoles()
      } catch (error) {
        ElMessage.error('删除角色失败')
      }
    }).catch(() => {})
  }
}

const saveRole = async () => {
  try {
    if (isEditRole.value) {
      await updateRoleApi(roleForm.id, roleForm)
      ElMessage.success('更新角色成功')
    } else {
      await saveRoleApi(roleForm)
      ElMessage.success('新增角色成功')
    }
    roleDialogVisible.value = false
    loadRoles()
  } catch (error) {
    ElMessage.error('保存角色失败')
  }
}

onMounted(() => {
  loadUsers()
  loadRoles()
  loadPermissions()
  loadLogs()
})
</script>

<style lang="scss" scoped>
.auth-container {
  padding: 0;

  .page-header {
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

  .auth-tabs {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      .search-input {
        width: 280px;
      }
    }

    .filter-bar {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;

      .filter-form {
        margin-bottom: 0;
      }
    }

    .table-card {
      .pagination {
        margin-top: 16px;
        justify-content: flex-end;
      }
    }

    .role-card {
      margin-bottom: 20px;

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .role-info {
          display: flex;
          align-items: center;
          gap: 12px;

          .role-code {
            font-size: 12px;
            color: #9ca3af;
          }
        }
      }

      .role-desc {
        color: #6b7280;
        margin: 12px 0;
      }

      .role-stats {
        display: flex;
        gap: 24px;
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 12px 0;
      }

      .role-permissions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;

        .perm-tag {
          margin-right: 0;
        }
      }
    }

    .permission-tree {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;

      .custom-tree-node {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;

        .node-label {
          flex: 1;
        }
      }
    }
  }
}
</style>
