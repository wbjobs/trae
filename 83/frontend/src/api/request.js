import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import router from '@/router'

const service = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

service.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    } else if (userStore.offlineToken) {
      config.headers['X-Offline-Token'] = userStore.offlineToken
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

service.interceptors.response.use(
  (response) => {
    return response.data
  },
  async (error) => {
    const userStore = useUserStore()
    
    if (error.response) {
      const { status, data } = error.response
      
      if (status === 401) {
        if (data.code === 'TOKEN_EXPIRED' && userStore.offlineToken) {
          ElMessage.warning('在线令牌已过期，切换到离线模式')
          userStore.setOfflineMode()
          return service(error.config)
        }
        
        ElMessageBox.confirm('登录已过期，请重新登录', '提示', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          userStore.logout()
          router.push('/login')
        })
      } else if (status === 403) {
        ElMessage.error(data.error || '没有权限访问')
      } else if (status === 404) {
        ElMessage.error(data.error || '请求的资源不存在')
      } else if (status >= 500) {
        ElMessage.error(data.error || '服务器内部错误')
      } else {
        ElMessage.error(data.error || '请求失败')
      }
    } else if (error.request) {
      if (navigator.onLine) {
        ElMessage.error('网络连接失败，请检查网络设置')
      } else {
        ElMessage.warning('当前处于离线状态，部分功能可能受限')
      }
    } else {
      ElMessage.error(error.message || '请求配置错误')
    }
    
    return Promise.reject(error)
  }
)

export default service
