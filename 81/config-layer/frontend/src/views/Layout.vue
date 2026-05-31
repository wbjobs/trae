<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <el-icon :size="28"><Cpu /></el-icon>
        <span>协议中台</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :router="true"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="breadcrumb">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentPageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="user-info">
          <el-dropdown @command="handleCommand">
            <span class="username">
              <el-icon><User /></el-icon>
              {{ authStore.user?.username }}
              <el-tag :type="roleTagType" size="small" class="role-tag">
                {{ authStore.user?.role }}
              </el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Odometer,
  Setting,
  EditPen,
  Connection,
  Monitor,
  Document,
  Cpu,
  User
} from '@element-plus/icons-vue';
import { useAuthStore } from '@/store/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const activeMenu = computed(() => route.path);

const currentPageTitle = computed(() => route.meta.title as string || '');

const menuItems = [
  { path: '/dashboard', title: '系统概览', icon: Odometer },
  { path: '/protocol-config', title: '协议配置', icon: Setting },
  { path: '/message-editor', title: '报文编辑器', icon: EditPen },
  { path: '/route-rules', title: '路由规则', icon: Connection },
  { path: '/devices', title: '设备管理', icon: Monitor },
  { path: '/logs', title: '日志中心', icon: Document }
];

const roleTagType = computed(() => {
  const role = authStore.user?.role;
  if (role === 'admin') return 'danger';
  if (role === 'operator') return 'warning';
  return 'info';
});

const handleCommand = async (command: string) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      });
      await authStore.logout();
      ElMessage.success('已退出登录');
      router.push('/login');
    } catch {}
  }
};
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.sidebar {
  background: #304156;
  overflow: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  background: #2b2f3a;
}

.logo span {
  letter-spacing: 1px;
}

.el-menu {
  border-right: none;
}

.header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.username {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #606266;
}

.role-tag {
  margin-left: 8px;
}

.main-content {
  background: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
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
