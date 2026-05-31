<template>
  <div class="app-container">
    <el-container class="main-container">
      <el-header class="app-header">
        <div class="header-content">
          <div class="logo">
            <el-icon :size="32" color="#409EFF"><Document /></el-icon>
            <h1>多模态文档解析工具</h1>
          </div>
          <div class="header-right">
            <el-tag :type="llmEnabled ? 'success' : 'info'">
              {{ llmEnabled ? 'LLM 已启用' : '规则模式' }}
            </el-tag>
          </div>
        </div>
      </el-header>

      <el-container>
        <el-aside width="220px" class="app-aside">
          <el-menu
            :default-active="activeMenu"
            router
            class="side-menu"
            background-color="#001529"
            text-color="#fff"
            active-text-color="#409EFF"
          >
            <el-menu-item index="/">
              <el-icon><Upload /></el-icon>
              <span>文档上传</span>
            </el-menu-item>
            <el-menu-item index="/documents">
              <el-icon><List /></el-icon>
              <span>文档列表</span>
            </el-menu-item>
            <el-menu-item index="/graph">
              <el-icon><Share /></el-icon>
              <span>知识图谱</span>
            </el-menu-item>
            <el-menu-item index="/qa">
              <el-icon><ChatDotRound /></el-icon>
              <span>文档问答</span>
            </el-menu-item>
          </el-menu>
        </el-aside>

        <el-main class="app-main">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import { ChatDotRound } from '@element-plus/icons-vue'

const route = useRoute()
const llmEnabled = ref(false)

const activeMenu = computed(() => route.path)

onMounted(async () => {
  try {
    const config = await api.getConfig()
    llmEnabled.value = config.llm_enabled
  } catch (e) {
    console.error('获取配置失败', e)
  }
})
</script>

<style lang="scss" scoped>
.app-container {
  min-height: 100vh;
  background: #f0f2f5;
}

.main-container {
  height: 100vh;
}

.app-header {
  background: #fff;
  padding: 0 24px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  z-index: 100;

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;

      h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #001529;
      }
    }
  }
}

.app-aside {
  background: #001529;

  .side-menu {
    border-right: none;
    height: 100%;
  }
}

.app-main {
  padding: 24px;
  overflow-y: auto;
  background: #f0f2f5;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
