const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesAPI', {
  createNote: () => ipcRenderer.invoke('create-note'),
  updateNote: (noteId, content, x, y, width, height, version) => 
    ipcRenderer.invoke('update-note', { noteId, content, x, y, width, height, version }),
  forceUpdateNote: (noteId, content, x, y, width, height) =>
    ipcRenderer.invoke('force-update-note', { noteId, content, x, y, width, height }),
  deleteNote: (noteId) => ipcRenderer.invoke('delete-note', noteId),
  getAllNotes: () => ipcRenderer.invoke('get-all-notes'),
  onNoteUpdated: (callback) => {
    ipcRenderer.on('note-updated', (_event, data) => callback(data));
  },
  onNoteCreated: (callback) => {
    ipcRenderer.on('note-created', (_event, data) => callback(data));
  },
  onNoteDeleted: (callback) => {
    ipcRenderer.on('note-deleted', (_event, noteId) => callback(noteId));
  },
  onPromptImport: (callback) => {
    ipcRenderer.on('prompt-import', (_event, filePath) => callback(filePath));
  },
  getCurrentNoteId: () => ipcRenderer.invoke('get-current-note-id'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  exportNote: (noteId, filePath, password) => 
    ipcRenderer.invoke('export-note', { noteId, filePath, password }),
  showImportDialog: () => ipcRenderer.invoke('show-import-dialog'),
  importNote: (filePath, password) => 
    ipcRenderer.invoke('import-note', { filePath, password })
});
