import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import './assets/styles/global.scss'
import { registerMicroApps, start } from 'qiankun'
import microAppConfig from './config/microApps'

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')

registerMicroApps(microAppConfig.apps, {
  beforeLoad: [
    app => {
      console.log('[主应用] 加载子应用:', app.name)
    }
  ],
  beforeMount: [
    app => {
      console.log('[主应用] 挂载子应用:', app.name)
    }
  ],
  afterUnmount: [
    app => {
      console.log('[主应用] 卸载子应用:', app.name)
    }
  ]
})

start({
  sandbox: {
    experimentalStyleIsolation: true
  },
  prefetch: 'all'
})
