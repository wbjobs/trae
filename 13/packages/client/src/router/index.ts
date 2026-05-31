import { createRouter, createWebHistory } from 'vue-router';
import GraphList from '@/views/GraphList.vue';
import GraphEditor from '@/views/GraphEditor.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: GraphList,
    },
    {
      path: '/graph/:id',
      name: 'graph-editor',
      component: GraphEditor,
      props: true,
    },
  ],
});

export default router;
