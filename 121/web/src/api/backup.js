import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

export const backupApi = {
  list: () => api.get('/backups'),
  get: (namespace, name) => api.get(`/backups/${namespace}/${name}`),
  trigger: (namespace, name) => api.post(`/backups/${namespace}/${name}/trigger`),
  listRecords: (namespace, name) => api.get(`/backups/${namespace}/${name}/records`),
  restore: (namespace, name, data) => api.post(`/backups/${namespace}/${name}/restore`, data),
  getPreCheck: (namespace, name) => api.get(`/backups/${namespace}/${name}/precheck`),
  health: () => api.get('/health'),
};

export default api;
