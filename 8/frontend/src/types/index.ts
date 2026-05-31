export interface CodeSnippet {
  id: string;
  title?: string;
  code: string;
  language: string;
  tags: string[];
  description?: string;
  created_at: string;
  updated_at?: string;
  auto_tags?: string[];
  version?: number;
}

export interface SearchResult {
  id: string;
  title?: string;
  code: string;
  language: string;
  tags: string[];
  description?: string;
  similarity: number;
  created_at: string;
  reason?: string;
  auto_tags?: string[];
}

export interface FavoriteItem {
  id: number;
  code_snippet_id: string;
  user_id: string;
  created_at: string;
  snippet_data?: CodeSnippet;
}

export interface Comment {
  id: number;
  code_snippet_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface SearchQuery {
  query: string;
  top_k?: number;
  language?: string;
  tags?: string[];
}

export interface CreateSnippetPayload {
  title?: string;
  code: string;
  language: string;
  tags: string[];
  description?: string;
}

export interface UpdateSnippetPayload extends CreateSnippetPayload {
  change_note?: string;
}

export interface CodeSnippetVersion {
  id: number;
  code_snippet_id: string;
  version_number: number;
  title?: string;
  code: string;
  language: string;
  tags: string[];
  description?: string;
  auto_tags: string[];
  change_note?: string;
  created_at: string;
  created_by: string;
}

export interface AutoTagPreview {
  suggested_tags: string[];
  keywords: string[];
}

export interface BatchImportPreviewItem {
  file_name: string;
  success: boolean;
  title?: string;
  language?: string;
  description?: string;
  code_preview?: string;
  auto_tags?: string[];
  tags?: string[];
  line_count?: number;
  error?: string;
}

export interface BatchImportPreview {
  success: boolean;
  source_type: string;
  total_found: number;
  valid_count: number;
  error_count: number;
  items: BatchImportPreviewItem[];
  preview: Array<{
    title: string;
    language: string;
    description?: string;
    code_preview?: string;
    auto_tags: string[];
    tags: string[];
    source_file?: string;
  }>;
  errors: string[];
}

export interface BatchImportResult {
  success: boolean;
  message: string;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  errors?: string[];
}

export interface MaintenanceStats {
  total_snippets: number;
  collection_name: string;
  cache_size?: number;
}

export const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

export const USER_ID_KEY = 'code_search_user_id';
