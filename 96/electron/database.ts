import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { segmentText } from './segmenter'

let db: Database | null = null
let SQL: any = null

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

let wasmBuffer: Buffer | null = null

function loadWasmBuffer(): Buffer {
  if (wasmBuffer) return wasmBuffer
  
  const possiblePaths = [
    join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  ]
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      wasmBuffer = readFileSync(path)
      return wasmBuffer
    }
  }
  
  throw new Error('Could not find sql-wasm.wasm')
}

function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }
  return join(userDataPath, 'markdown-search.db')
}

export async function initDatabase() {
  if (db) return

  try {
    const wasmBinary = loadWasmBuffer()
    SQL = await initSqlJs({ wasmBinary })

    const dbPath = getDbPath()
    
    if (existsSync(dbPath)) {
      const fileBuffer = readFileSync(dbPath)
      db = new SQL.Database(fileBuffer)
    } else {
      db = new SQL.Database()
    }

    initTables()
  } catch (e) {
    console.error('Failed to initialize database:', e)
    try {
      const wasmBinary = loadWasmBuffer()
      const SQL_Fallback = await initSqlJs({ wasmBinary })
      db = new SQL_Fallback.Database()
      initTables()
    } catch (e2) {
      console.error('Failed fallback database init:', e2)
    }
  }
}

function initTables() {
  if (!db) return

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_seg TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)
  `)

  saveDatabase()
}

function saveDatabase() {
  if (!db) return
  
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(getDbPath(), buffer)
  } catch (e) {
    console.error('Failed to save database:', e)
  }
}

export interface ImportProgress {
  total: number
  processed: number
  success: number
  failed: number
  currentFile: string
}

export type ProgressCallback = (progress: ImportProgress) => void

const BATCH_SIZE = 50

export async function importMarkdownFiles(
  filePaths: string[],
  onProgress?: ProgressCallback
): Promise<{ success: number; failed: number }> {
  if (!db) return { success: 0, failed: 0 }

  const total = filePaths.length
  let success = 0
  let failed = 0
  let processed = 0

  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE)
    
    for (const file of batch) {
      processed++
      
      if (onProgress) {
        onProgress({
          total,
          processed,
          success,
          failed,
          currentFile: file
        })
      }

      let content: string | null = null
      let title: string | null = null
      let contentSeg: string | null = null
      let existing: any = null

      try {
        content = readFileSync(file, 'utf-8')
        title = extractTitle(content, file)
        contentSeg = segmentText(content)
        
        existing = db.exec('SELECT id FROM documents WHERE path = ?', [file])
        
        if (existing.length > 0 && existing[0].values.length > 0) {
          db.run(
            'UPDATE documents SET title = ?, content = ?, content_seg = ?, updated_at = CURRENT_TIMESTAMP WHERE path = ?',
            [title, content, contentSeg, file]
          )
        } else {
          db.run(
            'INSERT INTO documents (title, content, content_seg, path) VALUES (?, ?, ?, ?)',
            [title, content, contentSeg, file]
          )
        }
        
        success++
      } catch (e) {
        console.error('Failed to import file:', file, e)
        failed++
      } finally {
        content = null
        title = null
        contentSeg = null
        existing = null
      }

      if (global.gc && processed % 10 === 0) {
        global.gc()
      }
    }

    saveDatabase()

    await new Promise(resolve => setImmediate(resolve))
  }

  saveDatabase()

  if (onProgress) {
    onProgress({
      total,
      processed: total,
      success,
      failed,
      currentFile: ''
    })
  }

  if (global.gc) {
    global.gc()
  }

  return { success, failed }
}

function extractTitle(content: string, filePath: string): string {
  const firstLine = content.split('\n')[0].trim()
  if (firstLine.startsWith('# ')) {
    return firstLine.slice(2).trim()
  }
  const pathParts = filePath.split(/[/\\]/)
  return pathParts[pathParts.length - 1].replace(/\.md$/, '')
}

export function searchDocuments(query: string): SearchResult[] {
  if (!db || !query.trim()) return []

  const docs = getAllDocuments()
  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.trim())
  
  const results = docs
    .map(doc => {
      const rank = calculateRank(doc, searchTerms)
      if (rank > 0) {
        return {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          path: doc.path,
          rank
        }
      }
      return null
    })
    .filter(Boolean)
    .sort((a, b) => b!.rank - a!.rank)
    .slice(0, 50) as SearchResult[]
  
  return results
}

function calculateRank(doc: Document, terms: string[]): number {
  let rank = 0
  const titleLower = doc.title.toLowerCase()
  const contentLower = doc.content.toLowerCase()
  const contentSegLower = doc.content_seg.toLowerCase()

  for (const term of terms) {
    if (titleLower.includes(term)) {
      rank += 50
      
      const titleRegex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')
      if (titleRegex.test(doc.title)) {
        rank += 30
      }
      
      if (titleLower.startsWith(term)) {
        rank += 20
      }
    }

    if (contentSegLower.includes(term)) {
      rank += 30
    }

    if (contentLower.includes(term)) {
      rank += 10
      
      const contentRegex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi')
      const matches = contentLower.match(contentRegex)
      if (matches) {
        rank += Math.min(matches.length * 2, 20)
      }
    }

    const exactRegex = new RegExp(escapeRegExp(term), 'gi')
    const titleExact = doc.title.match(exactRegex)
    const contentExact = doc.content.match(exactRegex)
    
    if (titleExact) rank += titleExact.length * 5
    if (contentExact) rank += contentExact.length * 2
  }

  return rank
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getAllDocuments(): Document[] {
  if (!db) return []

  try {
    const results = db.exec(`
      SELECT * FROM documents ORDER BY updated_at DESC
    `)

    if (results.length === 0) return []

    return results[0].values.map((row: any[]) => ({
      id: row[0],
      title: row[1],
      content: row[2],
      content_seg: row[3],
      path: row[4],
      created_at: row[5],
      updated_at: row[6]
    }))
  } catch (e) {
    console.error('Get documents error:', e)
    return []
  }
}

export function deleteDocument(id: number): boolean {
  if (!db) return false

  try {
    db.run('DELETE FROM documents WHERE id = ?', [id])
    saveDatabase()
    return true
  } catch (e) {
    console.error('Delete document error:', e)
    return false
  }
}

export async function deleteDocumentByPath(path: string): Promise<boolean> {
  if (!db) return false

  try {
    db.run('DELETE FROM documents WHERE path = ?', [path])
    saveDatabase()
    return true
  } catch (e) {
    console.error('Delete document by path error:', e)
    return false
  }
}

export function getDocumentCount(): number {
  if (!db) return 0

  try {
    const results = db.exec('SELECT COUNT(*) as count FROM documents')
    if (results.length === 0 || results[0].values.length === 0) return 0
    return results[0].values[0][0] as number
  } catch (e) {
    return 0
  }
}
