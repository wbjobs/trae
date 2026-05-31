<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-content">
        <div class="logo">
          <el-icon :size="32" color="#409EFF"><Document /></el-icon>
          <span class="title">学术文献引文系统</span>
        </div>
        <el-menu
          mode="horizontal"
          :router="true"
          :default-active="$route.path"
          class="nav-menu"
        >
          <el-menu-item index="/search">
            <el-icon><Search /></el-icon>
            <span>文献检索</span>
          </el-menu-item>
          <el-menu-item index="/citation">
            <el-icon><Edit /></el-icon>
            <span>引文排版</span>
          </el-menu-item>
          <el-menu-item index="/export">
            <el-icon><Download /></el-icon>
            <span>格式导出</span>
          </el-menu-item>
          <el-menu-item index="/profile">
            <el-icon><User /></el-icon>
            <span>学术档案</span>
          </el-menu-item>
        </el-menu>
      </div>
    </el-header>
    <el-main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </el-main>
    <el-footer class="app-footer">
      <p>© 2024 学术文献引文系统 | 支持多格式引文生成与跨库检索</p>
    </el-footer>
  </el-container>
</template>

<script setup>
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  background: #f5f7fa;
}

.app-header {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 0;
  height: 70px;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  margin: 0;
}

.nav-menu {
  border-bottom: none;
  flex: 1;
  justify-content: flex-end;
}

.app-main {
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  padding: 24px;
}

.app-footer {
  background: #fff;
  text-align: center;
  color: #909399;
  padding: 20px 0;
  border-top: 1px solid #ebeef5;
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
