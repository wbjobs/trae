import axios from 'axios';
import {
  CodeSnippet,
  SearchResult,
  SearchQuery,
  CreateSnippetPayload,
  UpdateSnippetPayload,
  FavoriteItem,
  Comment,
  CodeSnippetVersion,
  AutoTagPreview,
  BatchImportPreview,
  MaintenanceStats,
  USER_ID_KEY
} from '../types';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

export const snippetApi = {
  create: (payload: CreateSnippetPayload, includeAutoTags: boolean = true): Promise<CodeSnippet> =>
    api.post('/api/snippets', payload, {
      params: {
        user_id: getUserId(),
        include_auto_tags: includeAutoTags
      }
    }).then(res => res.data),

  get: (id: string): Promise<CodeSnippet> =>
    api.get(`/api/snippets/${id}`, {
      params: { user_id: getUserId() }
    }).then(res => res.data),

  update: (id: string, payload: UpdateSnippetPayload, includeAutoTags: boolean = true): Promise<CodeSnippet> =>
    api.put(`/api/snippets/${id}`, payload, {
      params: {
        user_id: getUserId(),
        include_auto_tags: includeAutoTags
      }
    }).then(res => res.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/api/snippets/${id}`).then(res => res.data),

  list: (limit = 20, offset = 0): Promise<CodeSnippet[]> =>
    api.get('/api/snippets', {
      params: { limit, offset }
    }).then(res => res.data),

  search: (query: SearchQuery): Promise<SearchResult[]> =>
    api.post('/api/snippets/search', query, {
      params: { user_id: getUserId() }
    }).then(res => res.data),

  getSimilar: (id: string, topK = 5): Promise<SearchResult[]> =>
    api.get(`/api/snippets/${id}/similar`, {
      params: { top_k: topK }
    }).then(res => res.data),

  getComments: (id: string): Promise<Comment[]> =>
    api.get(`/api/snippets/${id}/comments`).then(res => res.data),

  addComment: (id: string, content: string): Promise<Comment> =>
    api.post(`/api/snippets/${id}/comments`, {
      code_snippet_id: id,
      content,
      user_id: getUserId()
    }).then(res => res.data),

  toggleFavorite: (id: string): Promise<{ is_favorite: boolean; id?: number }> =>
    api.post(`/api/snippets/${id}/favorite`, {
      code_snippet_id: id,
      user_id: getUserId()
    }).then(res => res.data),

  checkFavorite: (id: string): Promise<{ is_favorite: boolean }> =>
    api.get(`/api/snippets/${id}/is-favorite`, {
      params: { user_id: getUserId() }
    }).then(res => res.data),

  previewTags: (payload: CreateSnippetPayload): Promise<AutoTagPreview> =>
    api.post('/api/snippets/preview-tags', payload).then(res => res.data),

  getVersions: (id: string, limit = 20, offset = 0): Promise<CodeSnippetVersion[]> =>
    api.get(`/api/snippets/${id}/versions`, {
      params: { limit, offset }
    }).then(res => res.data),

  getVersion: (id: string, versionNumber: number): Promise<CodeSnippetVersion> =>
    api.get(`/api/snippets/${id}/versions/${versionNumber}`).then(res => res.data),

  compareVersions: (id: string, version1: number, version2: number): Promise<any> =>
    api.get(`/api/snippets/${id}/versions/compare`, {
      params: { version1, version2 }
    }).then(res => res.data),
};

export const userApi = {
  getFavorites: (): Promise<FavoriteItem[]> =>
    api.get(`/api/users/${getUserId()}/favorites`).then(res => res.data),

  getRecommendations: (topK = 5): Promise<SearchResult[]> =>
    api.get(`/api/users/${getUserId()}/recommendations`, {
      params: { top_k: topK }
    }).then(res => res.data),
};

export const maintenanceApi = {
  getStats: (): Promise<MaintenanceStats> =>
    api.get('/api/maintenance/stats').then(res => res.data),

  rebuildIndex: (): Promise<{ success: boolean; message: string; details?: any }> =>
    api.post('/api/maintenance/rebuild-index').then(res => res.data),

  exportData: (): Promise<any> =>
    api.get('/api/maintenance/export').then(res => res.data),

  importData: (file: File): Promise<{ success: boolean; message: string; details?: any }> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/maintenance/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },

  importBatch: (file: File, indices?: number[], includeAutoTags: boolean = true): Promise<{ success: boolean; message: string; imported_count: number; skipped_count: number; failed_count: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const params: Record<string, any> = {
      include_auto_tags: includeAutoTags
    };
    
    if (indices && indices.length > 0) {
      params['indices'] = indices;
    }
    
    return api.post('/api/maintenance/import-batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params
    }).then(res => res.data);
  },

  previewBatch: (file: File): Promise<BatchImportPreview> => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/maintenance/preview-batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  }
};

export default api;
