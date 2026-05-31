import axios from 'axios'

const API_BASE = '/api'

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
})

export const warehousesAPI = {
  getAll: () => api.get('/warehouses'),
  getById: (id) => api.get(`/warehouses/${id}`),
  getByRegion: (region) => api.get(`/warehouses/region/${region}`),
}

export const anomaliesAPI = {
  getAll: (params = {}) => api.get('/anomalies', { params }),
  getCount: (params = {}) => api.get('/anomalies/count', { params }),
  getSpatioTemporalFlows: (params = {}) => api.get('/anomalies/spatio-temporal-flows', { params }),
  getParallelCoords: (params = {}) => api.get('/anomalies/parallel-coords', { params }),
  getParallelCoordsByBbox: (data, params = {}) => api.post('/anomalies/parallel-coords/by-bbox', data, { params }),
  getTopKSubgraphs: (params = {}) => api.get('/anomalies/top-k-subgraphs', { params }),
  runDetection: (data) => api.post('/anomalies/detect', data),
  detectVolume: (data) => api.post('/anomalies/detect/volume', data),
  detectDuration: (data) => api.post('/anomalies/detect/duration', data),
}

export default api
