import { watch, FSWatcher, statSync } from 'fs'
import { dirname } from 'path'
import { importMarkdownFiles, deleteDocumentByPath, getAllDocuments } from './database'

interface WatchedFile {
  path: string
  watcher: FSWatcher
  lastModified: number
  debounceTimer: ReturnType<typeof setTimeout> | null
}

let watchedFiles: Map<string, WatchedFile> = new Map()
let isWatching = false
let watcherStatusCallback: ((status: WatcherStatus) => void) | null = null

export interface WatcherStatus {
  isWatching: boolean
  watchedCount: number
  watchedFiles: string[]
}

const DEBOUNCE_MS = 1000
const SCAN_INTERVAL_MS = 30000

let scanTimer: ReturnType<typeof setInterval> | null = null

export function startWatcher() {
  if (isWatching) return

  isWatching = true
  console.log('[Watcher] Starting file watcher...')

  rescanAllDocuments()

  scanTimer = setInterval(() => {
    if (isWatching) {
      checkWatchedFiles()
    }
  }, SCAN_INTERVAL_MS)

  notifyStatus()
}

export function stopWatcher() {
  if (!isWatching) return

  isWatching = false
  console.log('[Watcher] Stopping file watcher...')

  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }

  for (const [path, watchedFile] of watchedFiles) {
    try {
      watchedFile.watcher.close()
      if (watchedFile.debounceTimer) {
        clearTimeout(watchedFile.debounceTimer)
      }
    } catch (e) {
      console.warn('[Watcher] Error closing watcher for:', path, e)
    }
  }
  watchedFiles.clear()

  notifyStatus()
}

export function getWatcherStatus(): WatcherStatus {
  return {
    isWatching,
    watchedCount: watchedFiles.size,
    watchedFiles: Array.from(watchedFiles.keys())
  }
}

export function onWatcherStatusChange(callback: (status: WatcherStatus) => void) {
  watcherStatusCallback = callback
}

export async function watchFile(filePath: string) {
  if (watchedFiles.has(filePath)) {
    return
  }

  try {
    const stats = statSync(filePath)
    const dir = dirname(filePath)
    const fileName = filePath.split(/[/\\]/).pop()

    if (!fileName) return

    const watcher = watch(dir, (eventType, changedFile) => {
      if (changedFile === fileName) {
        handleFileChange(filePath)
      }
    })

    watchedFiles.set(filePath, {
      path: filePath,
      watcher,
      lastModified: stats.mtimeMs,
      debounceTimer: null
    })

    console.log('[Watcher] Watching:', filePath)
    notifyStatus()
  } catch (e) {
    console.warn('[Watcher] Failed to watch file:', filePath, e)
  }
}

export async function unwatchFile(filePath: string) {
  const watchedFile = watchedFiles.get(filePath)
  if (watchedFile) {
    try {
      watchedFile.watcher.close()
      if (watchedFile.debounceTimer) {
        clearTimeout(watchedFile.debounceTimer)
      }
    } catch (e) {
      console.warn('[Watcher] Error unwatching file:', filePath, e)
    }
    watchedFiles.delete(filePath)
    console.log('[Watcher] Unwatched:', filePath)
    notifyStatus()
  }
}

export async function watchFiles(filePaths: string[]) {
  for (const filePath of filePaths) {
    await watchFile(filePath)
  }
}

async function handleFileChange(filePath: string) {
  const watchedFile = watchedFiles.get(filePath)
  if (!watchedFile) return

  if (watchedFile.debounceTimer) {
    clearTimeout(watchedFile.debounceTimer)
  }

  watchedFile.debounceTimer = setTimeout(async () => {
    try {
      const stats = statSync(filePath)
      const watchedFileEntry = watchedFiles.get(filePath)
      if (!watchedFileEntry) return

      if (stats.mtimeMs !== watchedFileEntry.lastModified) {
        console.log('[Watcher] File changed, reindexing:', filePath)
        watchedFileEntry.lastModified = stats.mtimeMs

        const result = await importMarkdownFiles([filePath])
        console.log(`[Watcher] Reindex complete: ${result.success} success, ${result.failed} failed`)
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.log('[Watcher] File deleted, removing from index:', filePath)
        await deleteDocumentByPath(filePath)
        unwatchFile(filePath)
      } else {
        console.warn('[Watcher] Error handling file change:', filePath, e)
      }
    }
  }, DEBOUNCE_MS)
}

function checkWatchedFiles() {
  for (const [filePath, watchedFile] of watchedFiles) {
    try {
      const stats = statSync(filePath)
      if (stats.mtimeMs !== watchedFile.lastModified) {
        watchedFile.lastModified = stats.mtimeMs
        handleFileChange(filePath)
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.log('[Watcher] File not found during scan, removing:', filePath)
        deleteDocumentByPath(filePath)
        unwatchFile(filePath)
      }
    }
  }
}

async function rescanAllDocuments() {
  const docs = getAllDocuments()
  
  for (const doc of docs) {
    try {
      const stats = statSync(doc.path)
      
      if (stats.mtimeMs > new Date(doc.updated_at).getTime() + 1000) {
        console.log('[Watcher] Document changed while offline, reindexing:', doc.path)
        await importMarkdownFiles([doc.path])
      }
      
      await watchFile(doc.path)
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.log('[Watcher] Document missing, removing:', doc.path)
        await deleteDocumentByPath(doc.path)
      }
    }
  }
  
  notifyStatus()
}

function notifyStatus() {
  if (watcherStatusCallback) {
    watcherStatusCallback(getWatcherStatus())
  }
}
