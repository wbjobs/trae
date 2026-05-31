<template>
  <el-container class="layout-container">
    <el-header class="layout-header">
      <div class="header-left">
        <el-icon :size="32" color="#409eff"><Monitor /></el-icon>
        <h1 class="title">工业物联网管理平台</h1>
      </div>
      <div class="header-right">
        <EnvSwitcher ref="envSwitcherRef" @env-changed="handleEnvChanged" />
        <el-badge :value="offlineCount" :max="99" class="notification-badge">
          <el-button type="primary" text @click="handleAlarm">
            <el-icon size="20"><Bell /></el-icon>
            <span>告警通知</span>
          </el-button>
        </el-badge>
        <el-dropdown @command="handleCommand">
          <div class="user-info">
            <el-avatar :size="32" icon="UserFilled" />
            <span class="username">{{ userInfo.username }}</span>
            <el-icon><CaretBottom /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人中心</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>
    <el-container>
      <el-aside width="240px" class="layout-aside">
        <el-menu
          :default-active="activeMenu"
          router
          background-color="#001529"
          text-color="#fff"
          active-text-color="#409eff"
        >
          <el-menu-item index="/dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>设备看板</span>
          </el-menu-item>
          <el-menu-item index="/logtrace">
            <el-icon><Document /></el-icon>
            <span>日志溯源</span>
          </el-menu-item>
          <el-menu-item index="/auth">
            <el-icon><Lock /></el-icon>
            <span>权限分发</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      <el-main class="layout-main">
        <router-view v-if="!isMicroAppRoute" />
        <div id="micro-app-container" v-else></div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElNotification, ElMessage } from 'element-plus'
import { io } from 'socket.io-client'
import { useUserStore } from './stores/user'
import EnvSwitcher from './components/EnvSwitcher.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const userInfo = ref(userStore.userInfo || { username: 'admin' })
const offlineCount = ref(0)
const envSwitcherRef = ref(null)
let socket = null

const activeMenu = computed(() => route.path)
const isMicroAppRoute = computed(() => {
  return ['/dashboard', '/logtrace', '/auth'].some(p => route.path.startsWith(p))
})

const handleCommand = (command) => {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      type: 'warning'
    }).then(() => {
      userStore.logout()
      router.push('/login')
    }).catch(() => {})
  }
}

const handleAlarm = () => {
  router.push('/logtrace?type=alarm')
}

const handleEnvChanged = (env) => {
  console.log('环境切换:', env.name)
  if (socket) {
    socket.disconnect()
  }
  initWebSocket()
  window.location.reload()
}

const initWebSocket = () => {
  let wsUrl = 'ws://localhost:3001'
  
  const savedConfig = localStorage.getItem('iot-platform:env:config')
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig)
      if (config.wsUrl) {
        wsUrl = config.wsUrl
      }
    } catch (e) {
      console.error('解析环境配置失败:', e)
    }
  }
  
  socket = io(wsUrl, {
    transports: ['websocket']
  })

  socket.on('device:status', (data) => {
    console.log('设备状态更新:', data)
    if (data.status === 'offline') {
      offlineCount.value++
      ElNotification.warning({
        title: '设备离线告警',
        message: `设备 ${data.deviceName} 已离线`,
        duration: 5000
      })
    } else if (data.status === 'online') {
      offlineCount.value = Math.max(0, offlineCount.value - 1)
    }
  })

  socket.on('device:alarm', (data) => {
    ElNotification.error({
      title: '设备告警',
      message: `${data.deviceName}: ${data.message}`,
      duration: 8000
    })
  })
}

onMounted(() => {
  userStore.fetchUserInfo()
  initWebSocket()
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
})
</script>

<style lang="scss" scoped>
.layout-container {
  height: 100vh;
}

.layout-header {
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .title {
      font-size: 20px;
      font-weight: 600;
      margin: 0;
      color: #1f2937;
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 24px;

    .notification-badge {
      :deep(.el-badge__content) {
        top: 4px;
        right: 4px;
      }
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 8px 12px;
      border-radius: 8px;
      transition: background 0.3s;

      &:hover {
        background: #f3f4f6;
      }

      .username {
        font-size: 14px;
        color: #374151;
      }
    }
  }
}

.layout-aside {
  background: #001529;

  :deep(.el-menu) {
    border-right: none;
  }

  :deep(.el-menu-item) {
    height: 56px;
    line-height: 56px;
  }
}

.layout-main {
  background: #f0f2f5;
  padding: 20px;
  overflow: auto;

  #micro-app-container {
    width: 100%;
    height: 100%;
    min-height: 600px;
  }
}
</style>
