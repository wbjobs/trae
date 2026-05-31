<template>
  <div class="server-manager">
    <div class="header">
      <h2>服务器管理</h2>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        添加服务器
      </el-button>
    </div>

    <el-table :data="servers" v-loading="loading" style="width: 100%" empty-text="暂无服务器">
      <el-table-column prop="name" label="名称" min-width="150">
        <template #default="{ row }">
          <div class="server-name">
            <el-icon :size="20" color="#409eff"><Link /></el-icon>
            <span>{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="url" label="地址" min-width="200" show-overflow-tooltip />

      <el-table-column prop="username" label="用户名" min-width="120" />

      <el-table-column prop="serverType" label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="row.serverType === 'jianguoyun' ? 'warning' : 'primary'">
            {{ row.serverType === 'jianguoyun' ? '坚果云' : 'Nextcloud' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="testConnection(row)">
            测试连接
          </el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showAddDialog" title="添加服务器" width="500px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="服务器显示名称" />
        </el-form-item>

        <el-form-item label="服务器类型" prop="serverType">
          <el-select v-model="form.serverType" style="width: 100%">
            <el-option label="Nextcloud" value="nextcloud" />
            <el-option label="坚果云" value="jianguoyun" />
          </el-select>
        </el-form-item>

        <el-form-item label="WebDAV地址" prop="url">
          <el-input
            v-model="form.url"
            placeholder="例如: https://your-server.com/remote.php/dav/files/username/"
          />
        </el-form-item>

        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="登录用户名" />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="登录密码"
            show-password
          />
        </el-form-item>

        <el-form-item v-if="form.serverType === 'jianguoyun'">
          <div class="jianguoyun-tip">
            <el-icon><InfoFilled /></el-icon>
            <span>坚果云需要在设置中开启 WebDAV 并获取应用专用密码</span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button @click="handleTest">测试连接</el-button>
        <el-button type="primary" @click="handleAdd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWebDAVStore } from '../stores/webdav'

const store = useWebDAVStore()
const servers = ref([])
const loading = ref(false)
const showAddDialog = ref(false)
const formRef = ref(null)

const form = reactive({
  name: '',
  url: '',
  username: '',
  password: '',
  serverType: 'nextcloud'
})

const rules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  url: [{ required: true, message: '请输入WebDAV地址', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

onMounted(async () => {
  await loadServers()
})

async function loadServers() {
  loading.value = true
  try {
    servers.value = await store.servers
    await store.loadServers()
    servers.value = store.servers
  } finally {
    loading.value = false
  }
}

async function handleAdd() {
  try {
    await formRef.value.validate()
    await store.addServer(form)
    ElMessage.success('服务器添加成功')
    showAddDialog.value = false
    resetForm()
    await loadServers()
  } catch (e) {
    if (e !== false) {
      ElMessage.error(e || '添加服务器失败')
    }
  }
}

async function handleTest() {
  try {
    await store.testConnection(form)
    ElMessage.success('连接成功！')
  } catch (e) {
    ElMessage.error(e || '连接失败，请检查配置')
  }
}

async function testConnection(row) {
  try {
    await store.testConnection({
      url: row.url,
      username: row.username,
      password: row.password,
      serverType: row.serverType
    })
    ElMessage.success(`${row.name} 连接成功`)
  } catch (e) {
    ElMessage.error(`${row.name} 连接失败: ${e}`)
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定要删除服务器 "${row.name}" 吗？`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      }
    )

    await store.removeServer(row.id)
    ElMessage.success('删除成功')
    await loadServers()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

function resetForm() {
  form.name = ''
  form.url = ''
  form.username = ''
  form.password = ''
  form.serverType = 'nextcloud'
  formRef.value?.resetFields()
}
</script>

<style scoped>
.server-manager {
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.server-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jianguoyun-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 4px;
  color: #e6a23c;
  font-size: 13px;
}
</style>
