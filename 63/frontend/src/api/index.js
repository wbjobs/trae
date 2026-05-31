import request from './request';

export const crawlerApi = {
  search: (data) => request.post('/crawler/search', data),
  getDetail: (data) => request.post('/crawler/detail', data),
  batchCrawl: (data) => request.post('/crawler/batch-crawl', data),
  crossMatch: (data) => request.post('/crawler/cross-match', data),
  getLibraries: () => request.get('/crawler/libraries'),
  getTaskStatus: (taskId) => request.get(`/crawler/status/${taskId}`)
};

export const citationApi = {
  parse: (data) => request.post('/citation/parse', data),
  format: (data) => request.post('/citation/format', data),
  batchFormat: (data) => request.post('/citation/batch-format', data),
  getFormats: () => request.get('/citation/formats'),
  getRules: (data) => request.post('/citation/rules', data),
  analyze: (data) => request.post('/citation/analyze', data),
  autoFix: (data) => request.post('/citation/auto-fix', data),
  batchAnalyze: (data) => request.post('/citation/batch-analyze', data)
};

export const cacheApi = {
  getStats: () => request.get('/cache/stats'),
  clear: (data) => request.delete('/cache/clear', { data }),
  cleanExpired: (data) => request.post('/cache/clean-expired', data),
  invalidateTag: (data) => request.post('/cache/invalidate-tag', data)
};

export const literatureApi = {
  calculateWeight: (data) => request.post('/literature/weight', data),
  batchCalculateWeight: (data) => request.post('/literature/batch-weight', data),
  getRecommendations: (data) => request.post('/literature/recommend', data),
  getById: (id) => request.get(`/literature/${id}`),
  matchRelated: (data) => request.post('/literature/relation-match', data)
};

export const userApi = {
  getProfile: (userId) => request.get(`/user/${userId}/profile`),
  updateProfile: (userId, data) => request.put(`/user/${userId}/profile`, data),
  getCollection: (userId) => request.get(`/user/${userId}/collection`),
  addToCollection: (userId, data) => request.post(`/user/${userId}/collection`, data),
  removeFromCollection: (userId, id) => request.delete(`/user/${userId}/collection/${id}`),
  syncProfile: (userId, data) => request.post(`/user/${userId}/sync`, data),
  getStatistics: (userId) => request.get(`/user/${userId}/statistics`)
};
