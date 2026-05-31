import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'

const getBaseURL = () => {
  const savedConfig = localStorage.getItem('iot-platform:env:config')
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig)
      if (config.apiBase) {
        return config.apiBase
      }
    } catch (e) {
      console.error('解析环境配置失败:', e)
    }
  }
  return '/'
}

const request = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json;charset=utf-8',
    'Accept': 'application/json, text/plain, */*'
  }
})

request.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json;charset=utf-8'
    config.headers['Accept'] = config.headers['Accept'] || 'application/json, text/plain, */*'
    
    const savedConfig = localStorage.getItem('iot-platform:env:config')
    if (savedConfig) {
      try {
        const envConfig = JSON.parse(savedConfig)
        if (envConfig.apiBase && !config.url.startsWith('http')) {
          config.baseURL = envConfig.apiBase
        }
      } catch (e) {}
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code !== 200) {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res
  },
  (error) => {
    if (error.response?.status === 401) {
      const userStore = useUserStore()
      userStore.logout()
      window.location.href = '/login'
    }
    if (error.response?.status === 406) {
      ElMessage.error('请求格式不被接受，请刷新页面重试')
    }
    ElMessage.error(error.message || '网络错误')
    return Promise.reject(error)
  }
)

export default request
