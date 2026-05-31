<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-left">
        <el-icon :size="28"><FolderOpened /></el-icon>
        <h2>WebDAV 客户端</h2>
      </div>
      <el-menu
        mode="horizontal"
        :default-active="activeMenu"
        class="header-menu"
        @select="handleMenuSelect"
      >
        <el-menu-item index="/explorer">
          <el-icon><Folder /></el-icon>
          <span>文件浏览</span>
        </el-menu-item>
        <el-menu-item index="/search">
          <el-icon><Search /></el-icon>
          <span>全文搜索</span>
        </el-menu-item>
        <el-menu-item index="/servers">
          <el-icon><Setting /></el-icon>
          <span>服务器管理</span>
        </el-menu-item>
      </el-menu>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'

const router = useRouter()
const route = useRoute()
const activeMenu = ref('/explorer')

onMounted(async () => {
  activeMenu.value = route.path
  try {
    await invoke('init_app')
  } catch (e) {
    console.error('初始化失败:', e)
  }
})

function handleMenuSelect(index) {
  activeMenu.value = index
  router.push(index)
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  font-family: 'Microsoft YaHei', Arial, sans-serif;
}

.app-container {
  height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #409eff 0%, #53a8ff 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  font-size: 18px;
  font-weight: 500;
}

.header-menu {
  border-bottom: none !important;
  background: transparent !important;
}

.header-menu .el-menu-item {
  color: white !important;
  border-bottom: none !important;
}

.header-menu .el-menu-item:hover {
  background: rgba(255, 255, 255, 0.15) !important;
}

.header-menu .el-menu-item.is-active {
  background: rgba(255, 255, 255, 0.2) !important;
  color: white !important;
}

.app-main {
  padding: 16px;
  background: #f5f7fa;
  overflow: auto;
}
</style>
