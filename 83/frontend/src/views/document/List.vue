<template>
  <div class="page-container">
    <PageHeader title="权限分级查阅" icon="Document" subtitle="根据权限分级查看文档，支持密级筛选和全文检索" />
    
    <div class="card-container">
      <div class="filter-bar">
        <el-input 
          v-model="filters.keyword" 
          placeholder="搜索文档标题、文件名或描述" 
          style="width: 280px"
          clearable
          @keyup.enter="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        
        <el-select v-model="filters.secretLevel" placeholder="密级" clearable style="width: 120px">
          <el-option label="公开" value="public" />
          <el-option label="内部" value="internal" />
          <el-option label="机密" value="secret" />
          <el-option label="绝密" value="top_secret" />
        </el-select>
        
        <el-date-picker 
          v-model="filters.dateRange" 
          type="daterange" 
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 280px"
        />
        
        <el-button type="primary" @click="loadData">
          <el-icon><Search /></el-icon>
          搜索
        </el-button>
        
        <el-button @click="resetFilters">
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
      </div>
      
      <el-table :data="documents" v-loading="loading" stripe>
        <el-table-column type="index" width="60" label="#" />
        <el-table-column prop="title" label="文档标题" min-width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="viewDetail(row.id)">
              {{ row.title }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="file_name" label="文件名" min-width="150" show-overflow-tooltip />
        <el-table-column label="密级" width="80">
          <template #default="{ row }">
            <SecretBadge :level="row.secret_level" />
          </template>
        </el-table-column>
        <el-table-column prop="file_size" label="大小" width="100">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>
        <el-table-column prop="uploader_name" label="上传人" width="100" />
        <el-table-column prop="department" label="部门" width="120" />
        <el-table-column label="浏览/下载" width="100">
          <template #default="{ row }">
            <span style="color: #909399; font-size: 12px">
              {{ row.view_count || 0 }} / {{ row.download_count || 0 }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="上传时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="viewDetail(row.id)">
              查看
            </el-button>
            <el-button type="success" text size="small" @click="downloadDoc(row.id)">
              下载
            </el-button>
            <el-button 
              v-if="canEdit(row)"
              type="primary" 
              text 
              size="small"
              @click="showPermissionDialog(row)"
            >
              权限
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
      v-model="permissionDialogVisible" 
      title="文档权限管理" 
      width="600px"
    >
      <div v-if="currentDocument">
        <el-alert 
          :title="`文档: ${currentDocument.title}`" 
          type="info" 
          :closable="false"
          style="margin-bottom: 20px"
        />
        
        <div class="permission-form">
          <el-form :model="permissionForm" label-width="80px">
            <el-form-item label="授权用户">
              <el-select 
                v-model="permissionForm.userId" 
                placeholder="选择用户" 
                filterable
                clearable
                style="width: 100%"
              >
                <el-option 
                  v-for="user in userList" 
                  :key="user.id" 
                  :label="`${user.real_name || user.username} (${user.department || '-'})`"
                  :value="user.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="权限类型">
              <el-select v-model="permissionForm.permissionType" style="width: 100%">
                <el-option label="读取" value="read" />
                <el-option label="下载" value="download" />
                <el-option label="编辑" value="write" />
                <el-option label="完全控制" value="full" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="grantPermission">授权</el-button>
            </el-form-item>
          </el-form>
        </div>
        
        <div class="permission-list">
          <h4>已有权限</h4>
          <el-table :data="documentPermissions" size="small">
            <el-table-column prop="user_name" label="用户" width="120" />
            <el-table-column prop="department" label="部门" width="100" />
            <el-table-column prop="role" label="角色" width="100" />
            <el-table-column prop="permission_type" label="权限" width="100" />
            <el-table-column prop="granted_at" label="授权时间" width="160">
              <template #default="{ row }">
                {{ formatDate(row.granted_at) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button 
                  type="danger" 
                  text 
                  size="small"
                  @click="revokePermission(row.id)"
                >
                  撤销
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { 
  getDocumentList, 
  downloadDocument, 
  getDocumentDetail 
} from '@/api/document'
import { 
  grantPermission as apiGrantPermission, 
  getDocumentPermissions, 
  revokePermission as apiRevokePermission 
} from '@/api/permission'
import { getUserList } from '@/api/auth'
import { useUserStore } from '@/store/user'
import SecretBadge from '@/components/SecretBadge.vue'
import PageHeader from '@/components/PageHeader.vue'
import PaginationWrapper from '@/components/PaginationWrapper.vue'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const documents = ref([])
const userList = ref([])
const documentPermissions = ref([])
const permissionDialogVisible = ref(false)
const currentDocument = ref(null)

const filters = reactive({
  keyword: '',
  secretLevel: '',
  dateRange: [],
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const permissionForm = reactive({
  userId: null,
  permissionType: 'read',
})

const formatFileSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const canEdit = (row) => {
  return userStore.isAdmin || row.uploader_id === userStore.userInfo?.id
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filters.keyword || undefined,
      secretLevel: filters.secretLevel || undefined,
      startDate: filters.dateRange?.[0] || undefined,
      endDate: filters.dateRange?.[1] || undefined,
    }
    
    const result = await getDocumentList(params)
    documents.value = result.documents || []
    pagination.total = result.total || 0
  } catch (err) {
    console.error('加载文档列表失败:', err)
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.keyword = ''
  filters.secretLevel = ''
  filters.dateRange = []
  pagination.page = 1
  loadData()
}

const viewDetail = (id) => {
  router.push(`/documents/${id}`)
}

const downloadDoc = async (id) => {
  try {
    const blob = await downloadDocument(id)
    const url = window.URL.createObjectURL(new Blob([blob]))
    const link = document.createElement('a')
    link.href = url
    link.download = `document_${id}.pdf`
    link.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('下载成功')
  } catch (err) {
    console.error('下载失败:', err)
  }
}

const showPermissionDialog = async (row) => {
  currentDocument.value = row
  permissionForm.userId = null
  permissionForm.permissionType = 'read'
  
  try {
    const [perms, users] = await Promise.all([
      getDocumentPermissions(row.id),
      getUserList({ pageSize: 100 }),
    ])
    documentPermissions.value = perms.permissions || []
    userList.value = users.users || []
  } catch (err) {
    console.error('加载权限数据失败:', err)
  }
  
  permissionDialogVisible.value = true
}

const grantPermission = async () => {
  if (!permissionForm.userId) {
    ElMessage.warning('请选择授权用户')
    return
  }
  
  try {
    await apiGrantPermission(currentDocument.value.id, {
      userId: permissionForm.userId,
      permissionType: permissionForm.permissionType,
    })
    
    ElMessage.success('授权成功')
    
    const perms = await getDocumentPermissions(currentDocument.value.id)
    documentPermissions.value = perms.permissions || []
    permissionForm.userId = null
  } catch (err) {
    console.error('授权失败:', err)
  }
}

const revokePermission = async (permId) => {
  try {
    await ElMessageBox.confirm('确定要撤销该权限吗？', '提示', {
      type: 'warning',
    })
    
    await apiRevokePermission(permId)
    ElMessage.success('撤销成功')
    
    const perms = await getDocumentPermissions(currentDocument.value.id)
    documentPermissions.value = perms.permissions || []
  } catch (err) {
    if (err !== 'cancel') {
      console.error('撤销失败:', err)
    }
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.permission-form {
  margin-bottom: 20px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 4px;
}

.permission-list h4 {
  font-size: 14px;
  color: #303133;
  margin-bottom: 12px;
}
</style>
