const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const NotesDatabase = require('./database');
const { encryptNote, decryptNote } = require('./crypto');

let tray = null;
let db = null;
let noteWindows = new Map();
let windowToNoteId = new Map();

function generateId() {
  return crypto.randomUUID();
}

function createTrayIcon() {
  const iconSize = 16;
  const trayIcon = nativeImage.createEmpty();
  
  const iconPath = path.join(__dirname, 'tray-icon.png');
  try {
    if (require('fs').existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      tray = new Tray(trayIcon);
    }
  } catch (e) {
    tray = new Tray(trayIcon);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '新建便签',
      click: () => createNoteWindow()
    },
    {
      label: '导入便签',
      click: () => showImportDialog()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('便签应用');
  tray.setContextMenu(contextMenu);
}

function createNoteWindow(noteData = null) {
  const noteId = noteData ? noteData.id : generateId();
  
  const existingWindow = noteWindows.get(noteId);
  if (existingWindow) {
    existingWindow.focus();
    return;
  }

  const x = noteData ? noteData.x : 100 + (noteWindows.size * 30);
  const y = noteData ? noteData.y : 100 + (noteWindows.size * 30);
  const width = noteData ? noteData.width : 300;
  const height = noteData ? noteData.height : 400;

  const noteWindow = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    minWidth: 200,
    minHeight: 200,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    backgroundColor: '#fffacd',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  noteWindow.setMenuBarVisibility(false);

  noteWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { noteId: noteId }
  });

  noteWindows.set(noteId, noteWindow);
  windowToNoteId.set(noteWindow.webContents.id, noteId);

  if (!noteData) {
    db.createNote(noteId, '', x, y, width, height);
    broadcastNoteCreated(noteId, noteWindow);
  }

  noteWindow.on('close', () => {
    const bounds = noteWindow.getBounds();
    const note = db.getNote(noteId);
    if (note) {
      db.updateNote(noteId, note.content, bounds.x, bounds.y, bounds.width, bounds.height);
    }
    noteWindows.delete(noteId);
    windowToNoteId.delete(noteWindow.webContents.id);
  });

  noteWindow.on('moved', () => {
    debouncedSavePosition(noteId, noteWindow);
  });

  noteWindow.on('resized', () => {
    debouncedSavePosition(noteId, noteWindow);
  });

  return noteWindow;
}

let saveTimeout = null;
function debouncedSavePosition(noteId, window) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const bounds = window.getBounds();
    const note = db.getNote(noteId);
    if (note) {
      db.updateNote(noteId, note.content, bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }, 500);
}

function broadcastNoteUpdated(noteId, data, excludeWindow = null) {
  noteWindows.forEach((window, id) => {
    if (id === noteId && window !== excludeWindow) {
      window.webContents.send('note-updated', data);
    }
  });
  
  noteWindows.forEach((window, id) => {
    if (id !== noteId) {
      window.webContents.send('note-updated', data);
    }
  });
}

function broadcastNoteCreated(noteId, sourceWindow) {
  const note = db.getNote(noteId);
  noteWindows.forEach((window, id) => {
    if (window !== sourceWindow) {
      window.webContents.send('note-created', note);
    }
  });
}

function broadcastNoteDeleted(noteId) {
  noteWindows.forEach((window) => {
    window.webContents.send('note-deleted', noteId);
  });
}

async function exportNote(noteId, filePath, password) {
  const note = db.getNote(noteId);
  if (!note) {
    return { success: false, error: '便签不存在' };
  }

  const exportData = {
    content: note.content,
    exportedAt: new Date().toISOString(),
    version: 1
  };

  try {
    const encrypted = encryptNote(exportData, password);
    fs.writeFileSync(filePath, encrypted);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function importNote(filePath, password) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const noteData = decryptNote(fileBuffer, password);
    
    const newNoteId = generateId();
    const newNote = db.createNote(
      newNoteId,
      noteData.content || '',
      100 + (noteWindows.size * 30),
      100 + (noteWindows.size * 30),
      300,
      400
    );
    
    createNoteWindow(newNote);
    broadcastNoteCreated(newNoteId, null);
    
    return { success: true, note: newNote };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function showImportDialog(parentWindow = null) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: '导入便签',
    filters: [
      { name: '便签文件', extensions: ['ele'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { filePath: result.filePaths[0] };
}

function setupIPCHandlers() {
  ipcMain.handle('create-note', () => {
    createNoteWindow();
    return true;
  });

  ipcMain.handle('update-note', (event, { noteId, content, x, y, width, height, version }) => {
    if (version !== undefined) {
      const result = db.updateNoteWithVersionCheck(noteId, content, x, y, width, height, version);
      if (result.success) {
        const sourceWindow = BrowserWindow.fromWebContents(event.sender);
        broadcastNoteUpdated(noteId, result.note, sourceWindow);
        return { success: true, note: result.note };
      } else {
        return { 
          success: false, 
          reason: result.reason,
          currentVersion: result.currentVersion,
          serverContent: result.serverContent,
          serverNote: result.serverNote
        };
      }
    } else {
      const updatedNote = db.updateNote(noteId, content, x, y, width, height);
      const sourceWindow = BrowserWindow.fromWebContents(event.sender);
      broadcastNoteUpdated(noteId, updatedNote, sourceWindow);
      return { success: true, note: updatedNote };
    }
  });

  ipcMain.handle('force-update-note', (event, { noteId, content, x, y, width, height }) => {
    const updatedNote = db.forceUpdateNote(noteId, content, x, y, width, height);
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    broadcastNoteUpdated(noteId, updatedNote, sourceWindow);
    return updatedNote;
  });

  ipcMain.handle('delete-note', (event, noteId) => {
    db.deleteNote(noteId);
    broadcastNoteDeleted(noteId);
    const window = noteWindows.get(noteId);
    if (window) {
      window.close();
    }
    return true;
  });

  ipcMain.handle('get-all-notes', () => {
    return db.getAllNotes();
  });

  ipcMain.handle('get-current-note-id', (event) => {
    return windowToNoteId.get(event.sender.id);
  });

  ipcMain.handle('close-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.close();
    }
    return true;
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(window, options);
    return result;
  });

  ipcMain.handle('export-note', async (event, { noteId, filePath, password }) => {
    return await exportNote(noteId, filePath, password);
  });

  ipcMain.handle('show-import-dialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return await showImportDialog(window);
  });

  ipcMain.handle('import-note', async (event, { filePath, password }) => {
    return await importNote(filePath, password);
  });
}

function restoreNotes() {
  const notes = db.getAllNotes();
  if (notes.length === 0) {
    createNoteWindow();
  } else {
    notes.forEach(note => {
      createNoteWindow(note);
    });
  }
}

let pendingFiles = [];

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.endsWith('.ele')) {
    if (db) {
      handleFileOpen(filePath);
    } else {
      pendingFiles.push(filePath);
    }
  }
});

async function handleFileOpen(filePath) {
  const noteWindow = Array.from(noteWindows.values())[0] || createNoteWindow();
  noteWindow.webContents.send('prompt-import', filePath);
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  db = new NotesDatabase(userDataPath);
  await db.init();
  
  createTrayIcon();
  setupIPCHandlers();
  restoreNotes();

  if (process.platform === 'win32' && process.argv.length > 1) {
    const filePath = process.argv[1];
    if (filePath.endsWith('.ele')) {
      pendingFiles.push(filePath);
    }
  }

  pendingFiles.forEach(filePath => {
    setTimeout(() => handleFileOpen(filePath), 1000);
  });
  pendingFiles = [];

  app.on('activate', () => {
    if (noteWindows.size === 0) {
      createNoteWindow();
    }
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});
