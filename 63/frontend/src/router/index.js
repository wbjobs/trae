import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/search'
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('@/views/SearchView.vue'),
    meta: { title: '文献检索' }
  },
  {
    path: '/citation',
    name: 'Citation',
    component: () => import('@/views/CitationView.vue'),
    meta: { title: '引文排版' }
  },
  {
    path: '/export',
    name: 'Export',
    component: () => import('@/views/ExportView.vue'),
    meta: { title: '格式导出' }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { title: '学术档案' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} - 学术文献引文系统`;
  }
  next();
});

export default router;
