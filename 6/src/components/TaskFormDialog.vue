<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑任务' : '创建任务'"
    width="800px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-width="120px" :rules="rules" ref="formRef">
      <el-form-item label="任务名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入任务名称" />
      </el-form-item>

      <el-divider content-position="left">源目录</el-divider>
      
      <el-form-item label="类型">
        <el-select v-model="form.source.type" style="width: 100%">
          <el-option label="本地目录" value="local" />
          <el-option label="SFTP 服务器" value="sftp" />
          <el-option label="WebDAV 服务器" value="webdav" />
        </el-select>
      </el-form-item>

      <template v-if="form.source.type === 'local'">
        <el-form-item label="目录路径">
          <el-input v-model="form.source.path">
            <template #append>
              <el-button @click="selectDirectory('source')">选择</el-button>
            </template>
          </el-input>
        </el-form-item>
      </template>

      <template v-if="form.source.type === 'sftp'">
        <el-form-item label="主机地址">
          <el-input v-model="form.source.host" placeholder="192.168.1.100" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="form.source.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.source.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.source.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="远程路径">
          <el-input v-model="form.source.path" placeholder="/home/user/data" />
        </el-form-item>
      </template>

      <template v-if="form.source.type === 'webdav'">
        <el-form-item label="服务器地址">
          <el-input v-model="form.source.url" placeholder="https://example.com/webdav" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.source.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.source.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="远程路径">
          <el-input v-model="form.source.path" placeholder="/backup" />
        </el-form-item>
      </template>

      <el-divider content-position="left">目标目录</el-divider>
      
      <el-form-item label="类型">
        <el-select v-model="form.target.type" style="width: 100%">
          <el-option label="本地目录" value="local" />
          <el-option label="SFTP 服务器" value="sftp" />
          <el-option label="WebDAV 服务器" value="webdav" />
        </el-select>
      </el-form-item>

      <template v-if="form.target.type === 'local'">
        <el-form-item label="目录路径">
          <el-input v-model="form.target.path">
            <template #append>
              <el-button @click="selectDirectory('target')">选择</el-button>
            </template>
          </el-input>
        </el-form-item>
      </template>

      <template v-if="form.target.type === 'sftp'">
        <el-form-item label="主机地址">
          <el-input v-model="form.target.host" placeholder="192.168.1.100" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="form.target.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.target.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.target.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="远程路径">
          <el-input v-model="form.target.path" placeholder="/home/user/data" />
        </el-form-item>
      </template>

      <template v-if="form.target.type === 'webdav'">
        <el-form-item label="服务器地址">
          <el-input v-model="form.target.url" placeholder="https://example.com/webdav" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.target.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.target.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="远程路径">
          <el-input v-model="form.target.path" placeholder="/backup" />
        </el-form-item>
      </template>

      <el-divider content-position="left">同步设置</el-divider>
      
      <el-form-item label="同步方向">
        <el-select v-model="form.direction" style="width: 100%">
          <el-option label="单向同步（源到目标）" value="one-way" />
          <el-option label="双向同步" value="two-way" />
        </el-select>
      </el-form-item>

      <el-form-item label="触发方式">
        <el-select v-model="form.trigger" style="width: 100%">
          <el-option label="手动触发" value="manual" />
          <el-option label="定时同步" value="schedule" />
          <el-option label="文件变更时" value="file-change" />
          <el-option label="开机启动" value="startup" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="form.trigger === 'schedule'" label="Cron 表达式">
        <el-input v-model="form.schedule" placeholder="0 * * * * * (每分钟)" />
        <div style="color: #909399; font-size: 12px; margin-top: 4px;">
          格式：秒 分 时 日 月 周，例如：0 0 2 * * * 表示每天凌晨2点
        </div>
      </el-form-item>

      <el-form-item label="冲突处理">
        <el-select v-model="form.conflictResolution" style="width: 100%">
          <el-option label="保留源版本" value="source" />
          <el-option label="保留目标版本" value="target" />
          <el-option label="保留最新版本" value="latest" />
          <el-option label="手动选择" value="manual" />
        </el-select>
      </el-form-item>

      <el-form-item label="版本管理">
        <el-switch v-model="form.preserveVersions" />
        <span v-if="form.preserveVersions" style="margin-left: 12px;">
          保留
          <el-input-number v-model="form.maxVersions" :min="1" :max="100" size="small" />
          个历史版本
        </span>
      </el-form-item>

      <el-divider content-position="left">文件过滤</el-divider>
      
      <el-form-item label="包含文件类型">
        <el-select 
          v-model="form.filterConfig.includeExtensions" 
          multiple 
          filterable 
          allow-create 
          default-first-option
          placeholder="输入扩展名后按回车添加（如：docx, pdf）"
          style="width: 100%"
        >
        </el-select>
      </el-form-item>
      
      <el-form-item label="排除文件类型">
        <el-select 
          v-model="form.filterConfig.excludeExtensions" 
          multiple 
          filterable 
          allow-create 
          default-first-option
          placeholder="输入扩展名后按回车添加"
          style="width: 100%"
        >
          <el-option label="tmp" value="tmp" />
          <el-option label="temp" value="temp" />
          <el-option label="bak" value="bak" />
          <el-option label="log" value="log" />
        </el-select>
      </el-form-item>
      
      <el-form-item label="排除隐藏文件">
        <el-switch v-model="form.filterConfig.excludeHidden" />
      </el-form-item>
      
      <el-form-item label="包含模式">
        <el-input 
          v-model="includePatternsText" 
          type="textarea"
          :rows="2"
          placeholder="每行一个 glob 模式，如：**/*.txt"
        />
      </el-form-item>
      
      <el-form-item label="排除模式">
        <el-input 
          v-model="excludePatternsText" 
          type="textarea"
          :rows="2"
          placeholder="每行一个 glob 模式，如：**/node_modules/**"
        />
      </el-form-item>
      
      <el-form-item label="最小文件大小">
        <el-input-number v-model="form.filterConfig.minFileSize" :min="0" :max="1073741824" size="small" />
        <span style="margin-left: 8px; color: #909399;">字节</span>
      </el-form-item>
      
      <el-form-item label="最大文件大小">
        <el-input-number v-model="form.filterConfig.maxFileSize" :min="0" :max="1099511627776" size="small" />
        <span style="margin-left: 8px; color: #909399;">字节</span>
      </el-form-item>

      <el-divider content-position="left">加密设置</el-divider>
      
      <el-form-item label="启用加密">
        <el-switch v-model="form.encryption.enabled" />
      </el-form-item>
      
      <el-form-item v-if="form.encryption.enabled" label="加密算法">
        <el-select v-model="form.encryption.algorithm" style="width: 100%">
          <el-option label="AES-256-CBC" value="aes-256-cbc" />
          <el-option label="AES-256-GCM" value="aes-256-gcm" />
        </el-select>
      </el-form-item>
      
      <el-form-item v-if="form.encryption.enabled" label="加密密钥">
        <el-input v-model="form.encryption.key" type="password" show-password placeholder="留空将自动生成密钥" />
      </el-form-item>

      <el-divider content-position="left">通知设置</el-divider>
      
      <el-form-item label="同步完成">
        <el-switch v-model="form.notifications.onSuccess" />
      </el-form-item>
      
      <el-form-item label="同步失败">
        <el-switch v-model="form.notifications.onError" />
      </el-form-item>
      
      <el-form-item label="文件冲突">
        <el-switch v-model="form.notifications.onConflict" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, type FormInstance, type FormRules } from 'vue'
import { ElMessage } from 'element-plus'
import type { 
  SyncTask, ConnectionConfig, SyncDirection, SyncTrigger, ConflictResolution,
  FilterConfig, EncryptionConfig, NotificationConfig
} from '@shared/types'
import { useTaskStore } from '@/stores/taskStore'

const props = defineProps<{
  modelValue: boolean
  editTask?: SyncTask | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', task: SyncTask): void
}>()

const taskStore = useTaskStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)

const visible = ref(false)
const isEdit = ref(false)

const createDefaultFilterConfig = (): FilterConfig => ({
  includePatterns: [],
  excludePatterns: [],
  includeExtensions: [],
  excludeExtensions: [],
  excludeHidden: true
})

const createDefaultEncryptionConfig = (): EncryptionConfig => ({
  enabled: false,
  algorithm: 'aes-256-cbc'
})

const createDefaultNotificationConfig = (): NotificationConfig => ({
  onSuccess: true,
  onError: true,
  onConflict: true
})

const createDefaultConnection = (): ConnectionConfig => ({
  type: 'local',
  path: ''
})

type FormData = {
  name: string
  source: ConnectionConfig
  target: ConnectionConfig
  direction: SyncDirection
  trigger: SyncTrigger
  schedule?: string
  conflictResolution: ConflictResolution
  preserveVersions: boolean
  maxVersions: number
  filterConfig: FilterConfig
  encryption: EncryptionConfig
  notifications: NotificationConfig
}

const form = ref<FormData>({
  name: '',
  source: createDefaultConnection(),
  target: createDefaultConnection(),
  direction: 'one-way',
  trigger: 'manual',
  conflictResolution: 'latest',
  preserveVersions: true,
  maxVersions: 10,
  filterConfig: createDefaultFilterConfig(),
  encryption: createDefaultEncryptionConfig(),
  notifications: createDefaultNotificationConfig()
})

const includePatternsText = computed({
  get: () => form.value.filterConfig.includePatterns.join('\n'),
  set: (val: string) => {
    form.value.filterConfig.includePatterns = val.split('\n').filter(s => s.trim())
  }
})

const excludePatternsText = computed({
  get: () => form.value.filterConfig.excludePatterns.join('\n'),
  set: (val: string) => {
    form.value.filterConfig.excludePatterns = val.split('\n').filter(s => s.trim())
  }
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }]
}

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val) {
      if (props.editTask) {
        isEdit.value = true
        form.value = {
          name: props.editTask.name,
          source: { ...props.editTask.source },
          target: { ...props.editTask.target },
          direction: props.editTask.direction,
          trigger: props.editTask.trigger,
          schedule: props.editTask.schedule,
          conflictResolution: props.editTask.conflictResolution,
          preserveVersions: props.editTask.preserveVersions,
          maxVersions: props.editTask.maxVersions,
          filterConfig: { ...createDefaultFilterConfig(), ...props.editTask.filterConfig },
          encryption: { ...createDefaultEncryptionConfig(), ...props.editTask.encryption },
          notifications: { ...createDefaultNotificationConfig(), ...props.editTask.notifications }
        }
      } else {
        isEdit.value = false
        form.value = {
          name: '',
          source: createDefaultConnection(),
          target: createDefaultConnection(),
          direction: 'one-way',
          trigger: 'manual',
          conflictResolution: 'latest',
          preserveVersions: true,
          maxVersions: 10,
          filterConfig: createDefaultFilterConfig(),
          encryption: createDefaultEncryptionConfig(),
          notifications: createDefaultNotificationConfig()
        }
      }
    }
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function selectDirectory(type: 'source' | 'target') {
  const path = await window.electronAPI.dialog.openDirectory()
  if (path) {
    if (type === 'source') {
      form.value.source.path = path
    } else {
      form.value.target.path = path
    }
  }
}

async function handleSubmit() {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true

  try {
    let task: SyncTask | null

    if (isEdit.value && props.editTask) {
      task = await taskStore.updateTask(props.editTask.id, form.value)
      ElMessage.success('任务已更新')
    } else {
      task = await taskStore.createTask(form.value)
      ElMessage.success('任务已创建')
    }

    if (task) {
      emit('saved', task)
      visible.value = false
    }
  } catch (err: any) {
    ElMessage.error(err.message || '操作失败')
  } finally {
    submitting.value = false
  }
}
</script>
