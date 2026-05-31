import { createRouter, createWebHashHistory } from 'vue-router'
import FileExplorer from './components/FileExplorer.vue'
import SearchPanel from './components/SearchPanel.vue'
import ServerManager from './components/ServerManager.vue'

const routes = [
  { path: '/', redirect: '/explorer' },
  { path: '/explorer', component: FileExplorer },
  { path: '/search', component: SearchPanel },
  { path: '/servers', component: ServerManager }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
