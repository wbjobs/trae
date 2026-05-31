import { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { initDatabase, importMarkdownFiles, searchDocuments, getAllDocuments, deleteDocument, getDocumentCount, type ImportProgress } from './database'
import { startWatcher, stopWatcher, getWatcherStatus, watchFiles, unwatchFile, onWatcherStatusChange, type WatcherStatus } from './watcher'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let searchWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createSearchWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width } = primaryDisplay.workAreaSize

  searchWindow = new BrowserWindow({
    width: 600,
    height: 500,
    x: Math.floor((width - 600) / 2),
    y: 200,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    searchWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '#/search')
  } else {
    searchWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: 'search' })
  }

  searchWindow.on('blur', () => {
    searchWindow?.hide()
  })
}

function createTray() {
  let iconPath = join(__dirname, '../public/tray.svg')
  
  try {
    const icon = nativeImage.createFromPath(iconPath)
    tray = new Tray(icon)
  } catch (e) {
    console.warn('Failed to load tray icon, using empty icon')
    const emptyIcon = nativeImage.createEmpty()
    tray = new Tray(emptyIcon)
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createMainWindow()
        }
      }
    },
    {
      label: '快速搜索',
      click: () => {
        toggleSearchWindow()
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('Markdown Search')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    toggleSearchWindow()
  })
}

function toggleSearchWindow() {
  if (!searchWindow) {
    createSearchWindow()
  }

  if (searchWindow?.isVisible()) {
    searchWindow.hide()
  } else {
    searchWindow?.show()
    searchWindow?.focus()
  }
}

app.whenReady().then(async () => {
  await initDatabase()
  createMainWindow()
  createSearchWindow()
  createTray()

  startWatcher()

  onWatcherStatusChange((status: WatcherStatus) => {
    if (mainWindow) {
      mainWindow.webContents.send('watcher-status-change', status)
    }
  })

  globalShortcut.register('Ctrl+Shift+F', () => {
    toggleSearchWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

ipcMain.handle('import-files', async (event, filePaths: string[]) => {
  const onProgress = (progress: ImportProgress) => {
    event.sender.send('import-progress', progress)
  }
  const result = await importMarkdownFiles(filePaths, onProgress)
  if (result.success > 0) {
    await watchFiles(filePaths)
  }
  return result
})

ipcMain.handle('search', async (_event, query: string) => {
  return searchDocuments(query)
})

ipcMain.handle('get-documents', async () => {
  return getAllDocuments()
})

ipcMain.handle('get-document-count', async () => {
  return getDocumentCount()
})

ipcMain.handle('start-watcher', async () => {
  startWatcher()
  return getWatcherStatus()
})

ipcMain.handle('stop-watcher', async () => {
  stopWatcher()
  return getWatcherStatus()
})

ipcMain.handle('get-watcher-status', async () => {
  return getWatcherStatus()
})

ipcMain.handle('delete-document', async (_event, id: number) => {
  const doc = (await getAllDocuments()).find(d => d.id === id)
  const result = deleteDocument(id)
  if (result && doc) {
    unwatchFile(doc.path)
  }
  return result
})

ipcMain.handle('close-search-window', () => {
  searchWindow?.hide()
})

ipcMain.handle('open-document', async (_event, id: number) => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('open-document', id)
  }
})
