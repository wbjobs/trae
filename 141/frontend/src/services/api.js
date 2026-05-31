import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

export const stateApi = {
  get: (key) => api.post('/state/get', { key }),
  set: (key, value) => api.post('/state/set', { key, value }),
  delete: (key) => api.post('/state/delete', { key }),
  bulkGet: (keys) => api.post('/state/bulk_get', { keys }),
  bulkSet: (items) => api.post('/state/bulk_set', { items }),
  bulkDelete: (keys) => api.post('/state/bulk_delete', { keys }),
  getVersion: (key, version) => api.post('/state/version', { key, version }),
  getVersionHistory: (key) => api.post('/state/versions', { key }),
  getAtTime: (key, timestamp) => api.post('/state/timetravel', { key, timestamp }),
  deleteOldVersions: (key) => api.post('/state/versions/delete', { key }),
}

export const metricsApi = {
  get: () => api.get('/metrics'),
  reset: () => api.post('/metrics/reset'),
}

export const pluginApi = {
  list: () => api.get('/plugins'),
  upload: (formData) => api.post('/plugins/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  activate: (pluginId) => api.post('/plugins/activate', { plugin_id: pluginId }),
  deactivate: () => api.post('/plugins/deactivate'),
  delete: (pluginId) => api.post('/plugins/delete', { plugin_id: pluginId }),
  getActive: () => api.get('/plugins/active'),
}

export default api
