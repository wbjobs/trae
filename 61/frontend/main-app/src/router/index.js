import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'DashboardContainer',
    component: () => import('../views/MicroAppContainer.vue'),
    meta: { title: '设备看板', microApp: 'dashboard', requiresAuth: true }
  },
  {
    path: '/logtrace',
    name: 'LogTraceContainer',
    component: () => import('../views/MicroAppContainer.vue'),
    meta: { title: '日志溯源', microApp: 'logtrace', requiresAuth: true }
  },
  {
    path: '/auth',
    name: 'AuthContainer',
    component: () => import('../views/MicroAppContainer.vue'),
    meta: { title: '权限分发', microApp: 'auth', requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  const token = userStore.token

  if (to.meta.requiresAuth && !token) {
    next({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  } else {
    next()
  }
})

export default router
