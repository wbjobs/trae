import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/store/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    meta: { requiresAuth: true },
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '首页概览', icon: 'HomeFilled' },
      },
      {
        path: 'upload',
        name: 'DocumentUpload',
        component: () => import('@/views/document/Upload.vue'),
        meta: { title: '文档上传溯源', icon: 'UploadFilled', permissions: ['document:upload'] },
      },
      {
        path: 'documents',
        name: 'DocumentList',
        component: () => import('@/views/document/List.vue'),
        meta: { title: '权限分级查阅', icon: 'Document' },
      },
      {
        path: 'documents/:id',
        name: 'DocumentDetail',
        component: () => import('@/views/document/Detail.vue'),
        meta: { title: '文档详情', hidden: true },
      },
      {
        path: 'trajectory',
        name: 'Trajectory',
        component: () => import('@/views/trajectory/Index.vue'),
        meta: { title: '操作轨迹查询', icon: 'Histogram' },
      },
      {
        path: 'watermark',
        name: 'WatermarkConfig',
        component: () => import('@/views/watermark/Index.vue'),
        meta: { title: '水印配置', icon: 'PictureFilled', permissions: ['admin'] },
      },
      {
        path: 'permission',
        name: 'PermissionManage',
        component: () => import('@/views/permission/Index.vue'),
        meta: { title: '权限管理', icon: 'Key', permissions: ['admin', 'manager'] },
      },
      {
        path: 'users',
        name: 'UserManage',
        component: () => import('@/views/system/User.vue'),
        meta: { title: '用户管理', icon: 'UserFilled', permissions: ['admin'] },
      },
      {
        path: 'sync',
        name: 'SyncManage',
        component: () => import('@/views/system/Sync.vue'),
        meta: { title: '云端同步', icon: 'Connection', permissions: ['admin'] },
      },
      {
        path: 'borrow',
        name: 'BorrowManage',
        component: () => import('@/views/borrow/Index.vue'),
        meta: { title: '文档借阅', icon: 'Files' },
      },
    ],
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权限访问' },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const token = userStore.token || localStorage.getItem('token')
  const offlineToken = userStore.offlineToken || localStorage.getItem('offlineToken')

  document.title = to.meta.title ? `${to.meta.title} - 涉密文档溯源系统` : '涉密文档溯源系统'

  if (to.meta.requiresAuth === false) {
    if (token || offlineToken) {
      next('/')
    } else {
      next()
    }
    return
  }

  if (!token && !offlineToken) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  if (!userStore.userInfo) {
    const cachedUserInfo = localStorage.getItem('userInfo')
    
    if (offlineToken && !token) {
      if (cachedUserInfo) {
        try {
          userStore.userInfo = JSON.parse(cachedUserInfo)
          userStore.permissions = userStore.userInfo.permissions || []
          next()
          return
        } catch (e) {
          console.error('解析缓存用户信息失败:', e)
        }
      }
      
      try {
        await userStore.getUserInfo()
      } catch (err) {
        if (offlineToken && cachedUserInfo) {
          try {
            userStore.userInfo = JSON.parse(cachedUserInfo)
            userStore.permissions = userStore.userInfo.permissions || []
            next()
            return
          } catch (e) {
            console.error('离线模式加载缓存用户信息失败:', e)
          }
        }
        userStore.logout()
        next({ path: '/login', query: { redirect: to.fullPath } })
        return
      }
    } else {
      try {
        await userStore.getUserInfo()
      } catch (err) {
        if (offlineToken && cachedUserInfo) {
          try {
            userStore.userInfo = JSON.parse(cachedUserInfo)
            userStore.permissions = userStore.userInfo.permissions || []
            userStore.setOfflineMode()
            next()
            return
          } catch (e) {
            console.error('加载缓存用户信息失败:', e)
          }
        }
        userStore.logout()
        next({ path: '/login', query: { redirect: to.fullPath } })
        return
      }
    }
  }

  if (to.meta.permissions && to.meta.permissions.length > 0) {
    const hasPermission = to.meta.permissions.some(perm => {
      if (perm === 'admin') {
        return userStore.userInfo?.role === 'admin'
      }
      if (perm === 'manager') {
        return ['admin', 'manager'].includes(userStore.userInfo?.role)
      }
      return userStore.hasPermission(perm)
    })

    if (!hasPermission) {
      next('/403')
      return
    }
  }

  next()
})

export default router
