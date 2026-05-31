import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '系统概览', icon: 'Odometer' }
      },
      {
        path: 'protocol-config',
        name: 'ProtocolConfig',
        component: () => import('@/views/ProtocolConfig.vue'),
        meta: { title: '协议配置', icon: 'Setting', permission: 'config:read' }
      },
      {
        path: 'message-editor',
        name: 'MessageEditor',
        component: () => import('@/views/MessageEditor.vue'),
        meta: { title: '报文编辑器', icon: 'EditPen', permission: 'config:read' }
      },
      {
        path: 'message-editor/:protocolId',
        name: 'MessageEditorWithProtocol',
        component: () => import('@/views/MessageEditor.vue'),
        meta: { title: '报文编辑器', icon: 'EditPen', permission: 'config:read' }
      },
      {
        path: 'route-rules',
        name: 'RouteRules',
        component: () => import('@/views/RouteRules.vue'),
        meta: { title: '路由规则', icon: 'Connection', permission: 'config:read' }
      },
      {
        path: 'devices',
        name: 'Devices',
        component: () => import('@/views/Devices.vue'),
        meta: { title: '设备管理', icon: 'Monitor', permission: 'device:read' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('@/views/Logs.vue'),
        meta: { title: '日志中心', icon: 'Document', permission: 'logs:read' }
      }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login');
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/');
  } else if (to.meta.permission && !authStore.hasPermission(to.meta.permission as string)) {
    next('/403');
  } else {
    next();
  }
});

export default router;
