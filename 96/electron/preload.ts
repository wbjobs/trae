import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  importFiles: (filePaths: string[]) => ipcRenderer.invoke('import-files', filePaths),
  search: (query: string) => ipcRenderer.invoke('search', query),
  getDocuments: () => ipcRenderer.invoke('get-documents'),
  deleteDocument: (id: number) => ipcRenderer.invoke('delete-document', id),
  getDocumentCount: () => ipcRenderer.invoke('get-document-count'),
  closeSearchWindow: () => ipcRenderer.invoke('close-search-window'),
  openDocument: (id: number) => ipcRenderer.invoke('open-document', id),
  onOpenDocument: (callback: (id: number) => void) => {
    ipcRenderer.on('open-document', (_event, id) => callback(id))
  },
  onImportProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('import-progress', (_event, progress) => callback(progress))
  },
  removeImportProgressListener: () => {
    ipcRenderer.removeAllListeners('import-progress')
  },
  startWatcher: () => ipcRenderer.invoke('start-watcher'),
  stopWatcher: () => ipcRenderer.invoke('stop-watcher'),
  getWatcherStatus: () => ipcRenderer.invoke('get-watcher-status'),
  onWatcherStatusChange: (callback: (status: any) => void) => {
    ipcRenderer.on('watcher-status-change', (_event, status) => callback(status))
  },
  removeWatcherStatusListener: () => {
    ipcRenderer.removeAllListeners('watcher-status-change')
  }
})

declare global {
  interface Window {
    api: {
      importFiles: (filePaths: string[]) => Promise<any>
      search: (query: string) => Promise<any>
      getDocuments: () => Promise<any>
      deleteDocument: (id: number) => Promise<any>
      getDocumentCount: () => Promise<any>
      closeSearchWindow: () => Promise<any>
      openDocument: (id: number) => Promise<any>
      onOpenDocument: (callback: (id: number) => void) => void
      onImportProgress: (callback: (progress: any) => void) => void
      removeImportProgressListener: () => void
      startWatcher: () => Promise<any>
      stopWatcher: () => Promise<any>
      getWatcherStatus: () => Promise<any>
      onWatcherStatusChange: (callback: (status: any) => void) => void
      removeWatcherStatusListener: () => void
    }
  }
}
