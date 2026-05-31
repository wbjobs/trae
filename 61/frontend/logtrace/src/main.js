import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import './assets/styles/global.scss'
import { renderWithQiankun, qiankunWindow } from 'vite-plugin-qiankun/dist/helper'

let app = null

function render(props = {}) {
  const { container } = props
  app = createApp(App)

  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  app.use(createPinia())
  app.use(router)
  app.use(ElementPlus)

  const root = container
    ? container.querySelector('#app')
    : document.getElementById('app')
  app.mount(root)
}

renderWithQiankun({
  mount(props) {
    console.log('[logtrace] mount', props)
    render(props)
  },
  bootstrap() {
    console.log('[logtrace] bootstrap')
  },
  unmount(props) {
    console.log('[logtrace] unmount')
    if (app) {
      app.unmount()
    }
  },
  update(props) {
    console.log('[logtrace] update', props)
  }
})

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render()
}
