import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Upload',
    component: () => import('@/views/UploadView.vue'),
    meta: { title: '文档上传' }
  },
  {
    path: '/documents',
    name: 'Documents',
    component: () => import('@/views/DocumentsView.vue'),
    meta: { title: '文档列表' }
  },
  {
    path: '/documents/:id',
    name: 'DocumentDetail',
    component: () => import('@/views/DocumentDetailView.vue'),
    meta: { title: '文档详情' }
  },
  {
    path: '/graph',
    name: 'Graph',
    component: () => import('@/views/GraphView.vue'),
    meta: { title: '知识图谱' }
  },
  {
    path: '/qa',
    name: 'QA',
    component: () => import('@/views/QAView.vue'),
    meta: { title: '文档问答' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || '多模态文档解析工具'}`
  next()
})

export default router
