import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  register: (userData: any) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }),
}

export const deviceApi = {
  getDevices: (params?: any) => api.get('/devices', { params }),
  getDevice: (id: number) => api.get(`/devices/${id}`),
  getDeviceByDeviceId: (deviceId: string) => api.get(`/devices/deviceId/${deviceId}`),
  createDevice: (data: any) => api.post('/devices', data),
  updateDevice: (id: number, data: any) => api.put(`/devices/${id}`, data),
  deleteDevice: (id: number) => api.delete(`/devices/${id}`),
  assignToGroup: (id: number, groupId: number) => api.post(`/devices/${id}/group/${groupId}`),
  removeFromGroup: (id: number) => api.delete(`/devices/${id}/group`),
  heartbeat: (deviceId: string) => api.post('/devices/heartbeat', { deviceId }),
}

export const deviceGroupApi = {
  getGroups: () => api.get('/device-groups'),
  getGroup: (id: number) => api.get(`/device-groups/${id}`),
  createGroup: (data: any) => api.post('/device-groups', data),
  updateGroup: (id: number, data: any) => api.put(`/device-groups/${id}`, data),
  deleteGroup: (id: number) => api.delete(`/device-groups/${id}`),
}

export const firmwareApi = {
  getFirmware: (params?: any) => api.get('/firmware', { params }),
  getFirmwareById: (id: number) => api.get(`/firmware/${id}`),
  uploadFirmware: (formData: FormData, onProgress?: (percent: number) => void) =>
    api.post('/firmware/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
          onProgress(percent)
        }
      },
    }),
  publishFirmware: (id: number) => api.post(`/firmware/${id}/publish`),
  unpublishFirmware: (id: number) => api.post(`/firmware/${id}/unpublish`),
  updateFirmware: (id: number, data: any) => api.put(`/firmware/${id}`, data),
  deleteFirmware: (id: number) => api.delete(`/firmware/${id}`),
  downloadFirmware: (id: number) => window.open(`/api/firmware/${id}/download`),
}

export const firmwareDeltaApi = {
  getDeltasForFromFirmware: (fromFirmwareId: number) => api.get(`/firmware-deltas/from/${fromFirmwareId}`),
  getDeltasForToFirmware: (toFirmwareId: number) => api.get(`/firmware-deltas/to/${toFirmwareId}`),
  getDeltaById: (id: number) => api.get(`/firmware-deltas/${id}`),
  getDeltaByVersions: (fromVersion: string, toVersion: string) => api.get(`/firmware-deltas/versions/${fromVersion}/${toVersion}`),
  createDelta: (data: any) => api.post('/firmware-deltas', data),
  generateDelta: (id: number) => api.post(`/firmware-deltas/${id}/generate`),
  generateAllDeltas: (newFirmwareId: number) => api.post(`/firmware-deltas/generate-all/${newFirmwareId}`),
  downloadDelta: (id: number) => window.open(`/api/firmware-deltas/${id}/download`),
  deleteDelta: (id: number) => api.delete(`/firmware-deltas/${id}`),
  getBestDeltaForDevice: (params: any) => api.get('/firmware-deltas/best-delta', { params }),
}

export const upgradeTaskApi = {
  getTasks: (params?: any) => api.get('/upgrade-tasks', { params }),
  getTask: (id: number) => api.get(`/upgrade-tasks/${id}`),
  createTask: (data: any) => api.post('/upgrade-tasks', data),
  executeTask: (id: number) => api.post(`/upgrade-tasks/${id}/execute`),
  cancelTask: (id: number) => api.post(`/upgrade-tasks/${id}/cancel`),
  continueGrayscaleTask: (id: number) => api.post(`/upgrade-tasks/${id}/continue-grayscale`),
  getTaskProgress: (id: number, params?: any) => api.get(`/upgrade-tasks/${id}/progress`, { params }),
  getTaskProgressList: (id: number) => api.get(`/upgrade-tasks/${id}/progress/list`),
  updateProgress: (progressId: number, data: any) =>
    api.post(`/upgrade-tasks/progress/${progressId}/update`, data),
  resumeUpgrade: (progressId: number) => api.post(`/upgrade-tasks/progress/${progressId}/resume`),
  retryUpgrade: (progressId: number) => api.post(`/upgrade-tasks/progress/${progressId}/retry`),
  initiateRollback: (progressId: number) => api.post(`/upgrade-tasks/progress/${progressId}/rollback`),
  updateRollbackProgress: (progressId: number, data: any) =>
    api.post(`/upgrade-tasks/progress/${progressId}/rollback/update`, data),
  getDeviceUpgradeHistory: (deviceId: number) => api.get(`/upgrade-tasks/progress/device/${deviceId}`),
}

export const statisticsApi = {
  getDashboard: () => api.get('/statistics/dashboard'),
  getDeviceStatus: () => api.get('/statistics/device-status'),
  getFirmwareVersion: () => api.get('/statistics/firmware-version'),
  getTaskStatus: () => api.get('/statistics/task-status'),
  getFirmwareUpgrade: () => api.get('/statistics/firmware-upgrade'),
  getUpgradeTrend: (days: number = 7) => api.get('/statistics/upgrade-trend', { params: { days } }),
}

export default api
