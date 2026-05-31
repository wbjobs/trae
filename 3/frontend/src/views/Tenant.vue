<template>
  <div class="tenant-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="租户信息" name="info">
        <el-card>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="租户名称">{{ tenant?.name }}</el-descriptions-item>
            <el-descriptions-item label="租户标识">{{ tenant?.slug }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="tenant?.status === 'active' ? 'success' : 'danger'">
                {{ tenant?.status === 'active' ? '正常' : '禁用' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatDate(tenant?.createdAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-tab-pane>
      
      <el-tab-pane label="用户管理" name="users" v-if="isAdmin">
        <div class="page-header">
          <h3>租户用户</h3>
          <el-button type="primary" @click="addUserVisible = true">
            <el-icon><Plus /></el-icon>
            添加用户
          </el-button>
        </div>
        
        <el-card>
          <el-table :data="users" v-loading="loading" style="width: 100%">
            <el-table-column prop="email" label="邮箱" min-width="200" />
            <el-table-column prop="name" label="姓名" width="120" />
            <el-table-column prop="role" label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="row.role === 'tenant_admin' ? 'danger' : 'info'">
                  {{ row.role === 'tenant_admin' ? '管理员' : '普通用户' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
                  {{ row.status === 'active' ? '正常' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" text @click="editUser(row)">编辑</el-button>
                <el-button type="warning" text @click="resetPassword(row)">重置密码</el-button>
                <el-button
                  type="danger"
                  text
                  v-if="row.id !== currentUserId"
                  @click="deleteUser(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
    
    <el-dialog v-model="addUserVisible" title="添加用户" width="500px">
      <el-form :model="userForm" :rules="userRules" ref="userFormRef" label-width="80px">
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="userForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="userForm.password"
            type="password"
            placeholder="请输入密码"
            show-password
          />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-radio-group v-model="userForm.role">
            <el-radio value="regular_user">普通用户</el-radio>
            <el-radio value="tenant_admin">管理员</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addUserVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAddUser">确定</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="editUserVisible" title="编辑用户" width="500px">
      <el-form :model="editForm" ref="editFormRef" label-width="80px">
        <el-form-item label="邮箱">
          <el-input v-model="editForm.email" disabled />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="editForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="editForm.role">
            <el-radio value="regular_user">普通用户</el-radio>
            <el-radio value="tenant_admin">管理员</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="editForm.status">
            <el-radio value="active">正常</el-radio>
            <el-radio value="disabled">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editUserVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEditUser">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { tenantApi } from '@/api/tenant';
import { useUserStore } from '@/stores/user';
import type { Tenant, User } from '@/types';

const userStore = useUserStore();
const isAdmin = computed(() => userStore.userInfo?.role === 'tenant_admin');
const currentUserId = computed(() => userStore.userInfo?.id);

const activeTab = ref('info');
const loading = ref(false);
const tenant = ref<Tenant | null>(null);
const users = ref<User[]>([]);

const addUserVisible = ref(false);
const editUserVisible = ref(false);
const userFormRef = ref<FormInstance>();
const editFormRef = ref<FormInstance>();

const userForm = ref({
  email: '',
  name: '',
  password: '',
  role: 'regular_user' as 'regular_user' | 'tenant_admin',
});

const editForm = ref<Partial<User>>({});
const editingUserId = ref<string>('');

const userRules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' },
  ],
};

const formatDate = (dateStr?: string) => {
  return dateStr ? new Date(dateStr).toLocaleString('zh-CN') : '-';
};

const loadTenant = async () => {
  try {
    tenant.value = await tenantApi.getTenantInfo();
  } catch (error) {
    console.error(error);
  }
};

const loadUsers = async () => {
  if (!isAdmin.value) return;
  loading.value = true;
  try {
    users.value = await tenantApi.getUsers();
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const editUser = (row: User) => {
  editingUserId.value = row.id;
  editForm.value = { ...row };
  editUserVisible.value = true;
};

const submitAddUser = async () => {
  if (!userFormRef.value) return;
  
  await userFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        await tenantApi.createUser(userForm.value);
        ElMessage.success('添加成功');
        addUserVisible.value = false;
        userFormRef.value?.resetFields();
        loadUsers();
      } catch (error) {
        console.error(error);
      }
    }
  });
};

const submitEditUser = async () => {
  try {
    await tenantApi.updateUser(editingUserId.value, editForm.value);
    ElMessage.success('更新成功');
    editUserVisible.value = false;
    loadUsers();
  } catch (error) {
    console.error(error);
  }
};

const resetPassword = async (row: User) => {
  try {
    await ElMessageBox.confirm(
      `确定要重置用户 ${row.email} 的密码吗？新密码将是 "123456"`,
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    await tenantApi.resetPassword(row.id);
    ElMessage.success('密码已重置为 123456');
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error);
    }
  }
};

const deleteUser = async (row: User) => {
  try {
    await ElMessageBox.confirm('确定要删除该用户吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await tenantApi.deleteUser(row.id);
    ElMessage.success('删除成功');
    loadUsers();
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error);
    }
  }
};

onMounted(() => {
  loadTenant();
  loadUsers();
});
</script>

<style scoped>
.tenant-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
</style>
