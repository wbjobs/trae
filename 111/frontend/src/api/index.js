import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message)
    return Promise.reject(error)
  }
)

export const experimentsApi = {
  list: () => client.get('/api/v1/experiments'),
  get: (id) => client.get(`/api/v1/experiments/${id}`),
  create: (data) => client.post('/api/v1/experiments', data),
  update: (id, data) => client.put(`/api/v1/experiments/${id}`, data),
  delete: (id) => client.delete(`/api/v1/experiments/${id}`),
  start: (id) => client.post(`/api/v1/experiments/${id}/start`),
  pause: (id) => client.post(`/api/v1/experiments/${id}/pause`),
  resume: (id) => client.post(`/api/v1/experiments/${id}/resume`),
  stop: (id) => client.post(`/api/v1/experiments/${id}/stop`),
  getVSYAML: (id) => client.get(`/api/v1/experiments/${id}/vs-yaml`, { responseType: 'text' }),
  checkConflict: (data) => client.post('/api/v1/experiments/check-conflict', data),
  getBlastRadius: (id) => client.get(`/api/v1/experiments/${id}/blast-radius`),
  getSafetyEvents: (id) => client.get(`/api/v1/experiments/${id}/safety-events`),
}

export const sloApi = {
  list: () => client.get('/api/v1/slo'),
  get: (id) => client.get(`/api/v1/slo/${id}`),
  create: (data) => client.post('/api/v1/slo', data),
  update: (id, data) => client.put(`/api/v1/slo/${id}`, data),
  delete: (id) => client.delete(`/api/v1/slo/${id}`),
}

export const safetyApi = {
  listEvents: () => client.get('/api/v1/safety-events'),
}

export const topologyApi = {
  get: () => client.get('/api/v1/topology'),
}

export const metricsApi = {
  get: (service) => client.get(`/api/v1/metrics/${service}`),
}

export const servicesApi = {
  list: () => client.get('/api/v1/services'),
}

export const faultsApi = {
  list: () => client.get('/api/v1/faults'),
}

export default client
