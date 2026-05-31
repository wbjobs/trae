import { createRouter, createWebHashHistory } from 'vue-router'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'

const routes = [
  {
    path: '/',
    name: 'LogTrace',
    component: () => import('../App.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(
    qiankunWindow.__POWERED_BY_QIANKUN__ ? '/logtrace' : '/'
  ),
  routes
})

export default router
