export interface DocumentInfo {
  document_id: string
  filename: string
  file_type: string
  file_size: number
  upload_time: string
  title?: string
  author?: string
  creation_date?: string
  page_count?: number
}

export interface TableData {
  page_number?: number
  sheet_name?: string
  headers: string[]
  rows: string[][]
  csv_content?: string
}

export interface ImageData {
  image_id: string
  file_path: string
  page_number?: number
  width?: number
  height?: number
  extracted_text?: string
  caption?: string
}

export interface Entity {
  entity_id: string
  name: string
  type: string
  description?: string
  attributes?: Record<string, any>
}

export interface Relation {
  relation_id: string
  source_id: string
  target_id: string
  type: string
  description?: string
}

export interface KnowledgeGraph {
  entities: Entity[]
  relations: Relation[]
}

export interface DocumentParseResponse {
  document: DocumentInfo
  text_content: string
  tables: TableData[]
  images: ImageData[]
  knowledge_graph?: KnowledgeGraph
  structured_data: Record<string, any>
}

export interface DocumentSearchRequest {
  query: string
  file_type?: string
  start_date?: string
  end_date?: string
  skip?: number
  limit?: number
}

export interface DocumentSearchResponse {
  total: number
  documents: DocumentInfo[]
  highlights: Record<string, string>
}

export interface GraphSearchRequest {
  query: string
  entity_types?: string[]
  relation_types?: string[]
  max_depth?: number
  limit?: number
}

export interface GraphSearchResponse {
  entities: Entity[]
  relations: Relation[]
  paths: string[][]
}

export interface AppConfig {
  allowed_extensions: string[]
  max_file_size_mb: number
  llm_enabled: boolean
}

export interface SourceReference {
  text: string
  page_number?: number
  start_index: number
  end_index: number
}

export interface QARequest {
  document_id: string
  question: string
  use_history?: boolean
}

export interface QAResponse {
  answer: string
  confidence: number
  sources: SourceReference[]
  can_answer: boolean
  response_time?: number
}
