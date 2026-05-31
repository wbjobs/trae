export interface Document {
  id: number
  title: string
  content: string
  content_seg: string
  path: string
  created_at: string
  updated_at: string
}

export interface SearchResult {
  id: number
  title: string
  content: string
  path: string
  rank: number
}

export interface ImportResult {
  success: number
  failed: number
}
