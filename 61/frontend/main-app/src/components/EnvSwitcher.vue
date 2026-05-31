<template>
  <el-dropdown trigger="click" @command="handleSwitch">
    <div class="env-switcher">
      <el-tag :type="currentEnv.tagType" effect="dark" class="env-tag">
        <el-icon><Setting /></el-icon>
        <span>{{ currentEnv.name }}</span>
      </el-tag>
    </div>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="env in environments"
          :key="env.id"
          :command="env.id"
          :disabled="env.id === currentEnvId"
        >
          <div class="env-item">
            <el-tag :type="env.tagType" size="small">{{ env.name }}</el-tag>
            <span class="env-desc">{{ env.description }}</span>
            <el-icon v-if="env.id === currentEnvId" class="check-icon"><Check /></el-icon>
          </div>
        </el-dropdown-item>
        <el-dropdown-item divided>
          <div class="env-custom" @click.stop="showCustomDialog = true">
            <el-icon><Edit /></el-icon>
            <span>自定义配置</span>
          </div>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>

  <el-dialog v-model="showCustomDialog" title="自定义环境配置" width="500px">
    <el-form :model="customEnv" label-width="100px">
      <el-form-item label="API地址">
        <el-input v-model="customEnv.apiBase" placeholder="http://api.example.com" />
      </el-form-item>
      <el-form-item label="WebSocket地址">
        <el-input v-model="customEnv.wsUrl" placeholder="ws://ws.example.com" />
      </el-form-item>
      <el-form-item label="TCP地址">
        <el-input v-model="customEnv.tcpHost" placeholder="tcp.example.com:8888" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showCustomDialog = false">取消</el-button>
      <el-button type="primary" @click="applyCustomEnv">应用配置</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['envChanged'])

const environments = [
  {
    id: 'development',
    name: '开发环境',
    description: '本地开发服务器',
    tagType: 'success',
    config: {
      apiBase: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3001',
      tcpHost: 'localhost:8888'
    }
  },
  {
    id: 'testing',
    name: '测试环境',
    description: '测试验证服务器',
    tagType: 'warning',
    config: {
      apiBase: 'http://test-api.iot.com',
      wsUrl: 'ws://test-ws.iot.com',
      tcpHost: 'test-tcp.iot.com:8888'
    }
  },
  {
    id: 'staging',
    name: '预发布环境',
    description: '准生产验证',
    tagType: 'info',
    config: {
      apiBase: 'http://staging-api.iot.com',
      wsUrl: 'ws://staging-ws.iot.com',
      tcpHost: 'staging-tcp.iot.com:8888'
    }
  },
  {
    id: 'production',
    name: '生产环境',
    description: '正式生产服务器',
    tagType: 'danger',
    config: {
      apiBase: 'https://api.iot.com',
      wsUrl: 'wss://ws.iot.com',
      tcpHost: 'tcp.iot.com:8888'
    }
  }
]

const STORAGE_KEY = 'iot-platform:env'

const currentEnvId = ref('development')
const showCustomDialog = ref(false)
const customEnv = ref({
  apiBase: '',
  wsUrl: '',
  tcpHost: ''
})

const currentEnv = computed(() => {
  const env = environments.find(e => e.id === currentEnvId.value)
  if (env) return env
  
  const customConfig = localStorage.getItem(`${STORAGE_KEY}:custom`)
  if (customConfig) {
    return {
      id: 'custom',
      name: '自定义',
      description: '用户自定义配置',
      tagType: 'primary',
      config: JSON.parse(customConfig)
    }
  }
  
  return environments[0]
})

const loadEnv = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    currentEnvId.value = saved
  }
}

const saveEnv = (envId) => {
  localStorage.setItem(STORAGE_KEY, envId)
}

const handleSwitch = (envId) => {
  const env = environments.find(e => e.id === envId)
  if (env) {
    currentEnvId.value = envId
    saveEnv(envId)
    applyEnvConfig(env.config)
    ElMessage.success(`已切换到${env.name}`)
    emit('envChanged', env)
  }
}

const applyCustomEnv = () => {
  if (!customEnv.value.apiBase) {
    ElMessage.error('请填写API地址')
    return
  }
  
  const config = {
    apiBase: customEnv.value.apiBase,
    wsUrl: customEnv.value.wsUrl,
    tcpHost: customEnv.value.tcpHost
  }
  
  localStorage.setItem(`${STORAGE_KEY}:custom`, JSON.stringify(config))
  currentEnvId.value = 'custom'
  saveEnv('custom')
  applyEnvConfig(config)
  
  showCustomDialog.value = false
  ElMessage.success('已应用自定义配置')
  emit('envChanged', { id: 'custom', name: '自定义', config })
}

const applyEnvConfig = (config) => {
  localStorage.setItem(`${STORAGE_KEY}:config`, JSON.stringify(config))
  window.dispatchEvent(new CustomEvent('env-updated', { detail: config }))
}

const getCurrentConfig = () => {
  const savedConfig = localStorage.getItem(`${STORAGE_KEY}:config`)
  if (savedConfig) {
    return JSON.parse(savedConfig)
  }
  return currentEnv.value.config
}

onMounted(() => {
  loadEnv()
})

defineExpose({
  getCurrentConfig,
  currentEnv
})
</script>

<style lang="scss" scoped>
.env-switcher {
  cursor: pointer;

  .env-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
}

.env-item {
  display: flex;
  align-items: center;
  gap: 12px;

  .env-desc {
    font-size: 12px;
    color: #909399;
  }

  .check-icon {
    margin-left: auto;
    color: #67c23a;
  }
}

.env-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #409eff;
}
</style>
