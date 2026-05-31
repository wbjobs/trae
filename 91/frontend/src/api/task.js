import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export const taskApi = {
  createTask: (data) => api.post('/tasks', data),
  getTasks: () => api.get('/tasks'),
  getTask: (id) => api.get(`/tasks/${id}`),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  updatePosition: (id, positionX, positionY) =>
    api.patch(`/tasks/${id}/position`, { positionX, positionY }),
  getDependencies: (id) => api.get(`/tasks/${id}/dependencies`),
  getDownstream: (id) => api.get(`/tasks/${id}/downstream`),
  addDependency: (taskId, upstreamTaskId) =>
    api.post('/dependencies', { taskId, upstreamTaskId }),
  removeDependency: (taskId, upstreamTaskId) =>
    api.delete(`/dependencies/${taskId}/${upstreamTaskId}`),
  getGraphData: () => api.get('/graph'),
  getHistoricalGraph: (timestamp) => api.get('/graph/history', { params: { timestamp } }),
  getTimeline: (start, end) => api.get('/timeline', { params: { start, end } }),
  getTimelineRange: () => api.get('/timeline/range')
}

export default api
