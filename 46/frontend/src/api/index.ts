import axios from 'axios'
import type {
  DocumentParseResponse,
  DocumentSearchRequest,
  DocumentSearchResponse,
  KnowledgeGraph,
  GraphSearchRequest,
  GraphSearchResponse,
  AppConfig,
  QARequest,
  QAResponse
} from '@/types'

const request = axios.create({
  baseURL: '/',
  timeout: 300000
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const api = {
  getConfig: () => request.get<any, AppConfig>('/api/config'),

  healthCheck: () => request.get<any, { status: string; message: string }>('/api/health'),

  uploadDocument: (file: File, extractKnowledge: boolean = true) => {
    const formData = new FormData()
    formData.append('file', file)
    return request.post<any, DocumentParseResponse>(
      `/api/documents/upload?extract_knowledge=${extractKnowledge}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )
  },

  getDocuments: (skip: number = 0, limit: number = 20) =>
    request.get<any, { total: number; documents: any[] }>(
      `/api/documents?skip=${skip}&limit=${limit}`
    ),

  getDocument: (documentId: string) =>
    request.get<any, DocumentParseResponse>(`/api/documents/${documentId}`),

  searchDocuments: (params: DocumentSearchRequest) =>
    request.post<any, DocumentSearchResponse>('/api/documents/search', params),

  deleteDocument: (documentId: string) =>
    request.delete<any, { success: boolean; message: string }>(`/api/documents/${documentId}`),

  downloadDocument: (documentId: string) =>
    request.get(`/api/documents/${documentId}/download`, {
      responseType: 'blob'
    }),

  getDocumentGraph: (documentId: string) =>
    request.get<any, KnowledgeGraph>(`/api/graph/document/${documentId}`),

  searchGraph: (params: GraphSearchRequest) =>
    request.post<any, GraphSearchResponse>('/api/graph/search', params),

  getEntityTypes: () => request.get<any, string[]>('/api/graph/types/entities'),

  getRelationTypes: () => request.get<any, string[]>('/api/graph/types/relations'),

  askQuestion: (params: QARequest) =>
    request.post<any, QAResponse>('/api/qa/ask', params),

  getQAHistory: (documentId: string, limit: number = 10) =>
    request.get<any, any[]>(`/api/qa/history/${documentId}?limit=${limit}`)
}
