import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'TaskList',
    component: () => import('../views/TaskList.vue')
  },
  {
    path: '/task/:id',
    name: 'TaskDetail',
    component: () => import('../views/TaskDetail.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
