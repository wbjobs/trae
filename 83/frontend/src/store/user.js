import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, logout as apiLogout, getUserInfo as apiGetUserInfo } from '@/api/auth'
import { ElMessage } from 'element-plus'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const offlineToken = ref(localStorage.getItem('offlineToken') || '')
  const userInfo = ref(null)
  const permissions = ref([])

  const isAdmin = computed(() => userInfo.value?.role === 'admin')
  const isManager = computed(() => ['admin', 'manager'].includes(userInfo.value?.role))
  const isOffline = computed(() => !!offlineToken.value && !token.value)

  const hasPermission = (permission) => {
    if (!userInfo.value) return false
    if (userInfo.value.role === 'admin') return true
    const userPerms = userInfo.value.permissions || []
    return userPerms.includes(permission) || userPerms.includes('*')
  }

  const login = async (credentials) => {
    try {
      const response = await apiLogin(credentials)
      token.value = response.token
      offlineToken.value = response.offlineToken
      userInfo.value = response.user
      permissions.value = response.user.permissions || []

      localStorage.setItem('token', response.token)
      localStorage.setItem('offlineToken', response.offlineToken)
      localStorage.setItem('userInfo', JSON.stringify(response.user))

      return response
    } catch (err) {
      ElMessage.error(err.message || '登录失败')
      throw err
    }
  }

  const getUserInfo = async () => {
    try {
      const response = await apiGetUserInfo()
      userInfo.value = response
      permissions.value = response.permissions || []
      localStorage.setItem('userInfo', JSON.stringify(response))
      return response
    } catch (err) {
      const cachedUserInfo = localStorage.getItem('userInfo')
      if (cachedUserInfo && offlineToken.value) {
        try {
          const parsed = JSON.parse(cachedUserInfo)
          userInfo.value = parsed
          permissions.value = parsed.permissions || []
          return parsed
        } catch (e) {
          console.error('解析缓存用户信息失败:', e)
        }
      }
      throw err
    }
  }

  const logout = async () => {
    try {
      await apiLogout()
    } catch (err) {
      console.error('退出登录API调用失败:', err)
    } finally {
      token.value = ''
      offlineToken.value = ''
      userInfo.value = null
      permissions.value = []
      localStorage.removeItem('token')
      localStorage.removeItem('offlineToken')
      localStorage.removeItem('userInfo')
    }
  }

  const setOfflineMode = () => {
    token.value = ''
    localStorage.removeItem('token')
  }

  return {
    token,
    offlineToken,
    userInfo,
    permissions,
    isAdmin,
    isManager,
    isOffline,
    hasPermission,
    login,
    getUserInfo,
    logout,
    setOfflineMode,
  }
})
