import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores/user';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/public/form/:token',
    name: 'PublicFormFill',
    component: () => import('@/views/PublicFormFill.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/Default.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard',
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
      },
      {
        path: 'forms',
        name: 'Forms',
        component: () => import('@/views/FormList.vue'),
      },
      {
        path: 'forms/create',
        name: 'FormCreate',
        component: () => import('@/views/FormDesigner.vue'),
      },
      {
        path: 'forms/:id/edit',
        name: 'FormEdit',
        component: () => import('@/views/FormDesigner.vue'),
      },
      {
        path: 'forms/:id/fill',
        name: 'FormFill',
        component: () => import('@/views/FormFill.vue'),
      },
      {
        path: 'forms/:id/data',
        name: 'FormData',
        component: () => import('@/views/FormData.vue'),
      },
      {
        path: 'approval',
        name: 'Approval',
        component: () => import('@/views/Approval.vue'),
      },
      {
        path: 'approval/flows',
        name: 'ApprovalFlows',
        component: () => import('@/views/ApprovalFlows.vue'),
      },
      {
        path: 'approval/flows/create',
        name: 'ApprovalFlowCreate',
        component: () => import('@/views/ApprovalFlowDesigner.vue'),
      },
      {
        path: 'approval/flows/:id/edit',
        name: 'ApprovalFlowEdit',
        component: () => import('@/views/ApprovalFlowDesigner.vue'),
      },
      {
        path: 'approval/tasks',
        name: 'ApprovalTasks',
        component: () => import('@/views/ApprovalTasks.vue'),
      },
      {
        path: 'tenant',
        name: 'Tenant',
        component: () => import('@/views/Tenant.vue'),
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: () => import('@/views/Notifications.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore();
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth !== false);

  if (requiresAuth && !userStore.isLoggedIn) {
    next('/login');
  } else if (!requiresAuth && userStore.isLoggedIn && (to.path === '/login' || to.path === '/register')) {
    next('/dashboard');
  } else {
    next();
  }
});

export default router;
