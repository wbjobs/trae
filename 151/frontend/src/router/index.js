import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/gameservers'
  },
  {
    path: '/gameservers',
    name: 'GameServers',
    component: () => import('@/views/GameServerList.vue'),
    meta: { title: '游戏服列表' }
  },
  {
    path: '/gameservers/:namespace/:name',
    name: 'GameServerDetail',
    component: () => import('@/views/GameServerDetail.vue'),
    meta: { title: '游戏服详情' },
    props: true
  },
  {
    path: '/upgrade',
    name: 'UpgradeProgress',
    component: () => import('@/views/UpgradeProgress.vue'),
    meta: { title: '升级进度' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = to.meta.title || 'GameServer 升级管理平台'
  next()
})

export default router
