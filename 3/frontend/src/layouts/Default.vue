<template>
  <el-container class="layout-container">
    <el-aside width="240px" class="sidebar">
      <div class="logo">
        <span class="logo-text">表单引擎</span>
      </div>
      
      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Grid /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        
        <el-sub-menu index="forms">
          <template #title>
            <el-icon><Document /></el-icon>
            <span>表单管理</span>
          </template>
          <el-menu-item index="/forms">表单列表</el-menu-item>
          <el-menu-item index="/forms/create">创建表单</el-menu-item>
        </el-sub-menu>
        
        <el-sub-menu index="approval">
          <template #title>
            <el-icon><Promotion /></el-icon>
            <span>审批管理</span>
          </template>
          <el-menu-item index="/approval/tasks">待办任务</el-menu-item>
          <el-menu-item index="/approval/flows">流程配置</el-menu-item>
        </el-sub-menu>
        
        <el-menu-item index="/tenant">
          <el-icon><OfficeBuilding /></el-icon>
          <span>租户管理</span>
        </el-menu-item>
        
        <el-menu-item index="/notifications">
          <el-icon><Bell /></el-icon>
          <span>通知中心</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentRouteName }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-icon><UserFilled /></el-icon>
              {{ userStore.userInfo?.name }}
              <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="notification-badge">
                <el-icon><Bell /></el-icon>
              </el-badge>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人信息</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { notificationApi } from '@/api/notification';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const unreadCount = ref(0);

const activeMenu = computed(() => route.path);

const currentRouteName = computed(() => {
  const nameMap: Record<string, string> = {
    '/dashboard': '仪表盘',
    '/forms': '表单列表',
    '/forms/create': '创建表单',
    '/forms/fill': '填写表单',
    '/forms/data': '表单数据',
    '/approval': '审批管理',
    '/approval/flows': '流程配置',
    '/approval/flows/create': '创建流程',
    '/approval/tasks': '待办任务',
    '/tenant': '租户管理',
    '/notifications': '通知中心',
  };
  
  for (const [key, name] of Object.entries(nameMap)) {
    if (route.path.includes(key) && key !== '/dashboard') {
      return name;
    }
  }
  
  return nameMap[route.path] || '仪表盘';
});

const handleCommand = (command: string) => {
  if (command === 'logout') {
    userStore.logout();
    router.push('/login');
  }
};

onMounted(async () => {
  try {
    const result = await notificationApi.getUnreadCount();
    unreadCount.value = result.count;
  } catch (error) {
    console.error(error);
  }
});
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.sidebar {
  background-color: #304156;
  overflow-y: auto;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #2b2f3a;
}

.logo-text {
  font-size: 18px;
  font-weight: bold;
  color: white;
}

.sidebar-menu {
  border-right: none;
}

.header {
  background-color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #e4e7ed;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.notification-badge {
  margin-left: 16px;
}

.main {
  background-color: #f0f2f5;
  overflow-y: auto;
}
</style>
