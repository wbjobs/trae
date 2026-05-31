import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { initDatabase, getTasks, getTask, saveTask, deleteTask, getLogs, getVersions } from './database';
import { taskScheduler } from './scheduler';
import { createSyncEngine } from './sync-engine';
import type { 
  SyncTask, SyncLog, SyncProgress, 
  SyncConflict, ConflictResolution, FileVersion
} from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let pendingConflicts = new Map<string, { conflict: SyncConflict; resolve: (res: ConflictResolution) => void }>();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  initDatabase();
  
  taskScheduler.setCallbacks(
    (progress: SyncProgress) => {
      mainWindow?.webContents.send('task:progress', progress);
    },
    (log: SyncLog) => {
      mainWindow?.webContents.send('task:log', log);
    },
    async (conflict: SyncConflict): Promise<ConflictResolution> => {
      const conflictId = crypto.randomUUID();
      
      return new Promise((resolve) => {
        pendingConflicts.set(conflictId, { conflict, resolve });
        mainWindow?.webContents.send('task:conflict', { ...conflict, conflictId });
      });
    }
  );

  await taskScheduler.initialize();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  taskScheduler.shutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function generateId(): string {
  return crypto.randomUUID();
}

ipcMain.handle('task:list', async () => {
  return getTasks();
});

ipcMain.handle('task:get', async (event, taskId: string) => {
  return getTask(taskId);
});

ipcMain.handle('task:create', async (event, taskData: Partial<SyncTask>) => {
  const now = Date.now();
  const task: SyncTask = {
    id: generateId(),
    name: taskData.name || '新任务',
    source: taskData.source!,
    target: taskData.target!,
    direction: taskData.direction || 'one-way',
    trigger: taskData.trigger || 'manual',
    schedule: taskData.schedule,
    enabled: taskData.enabled ?? true,
    paused: taskData.paused ?? false,
    conflictResolution: taskData.conflictResolution || 'latest',
    preserveVersions: taskData.preserveVersions ?? true,
    maxVersions: taskData.maxVersions ?? 10,
    createdAt: now,
    updatedAt: now,
    status: 'idle'
  };

  saveTask(task);
  taskScheduler.registerTask(task);

  return task;
});

ipcMain.handle('task:update', async (event, taskId: string, updates: Partial<SyncTask>) => {
  const task = getTask(taskId);
  if (!task) return null;

  const updatedTask: SyncTask = {
    ...task,
    ...updates,
    updatedAt: Date.now()
  };

  saveTask(updatedTask);
  taskScheduler.updateTask(updatedTask);

  return updatedTask;
});

ipcMain.handle('task:delete', async (event, taskId: string) => {
  const task = getTask(taskId);
  if (!task) return false;

  taskScheduler.unregisterTask(taskId);
  
  const versionDir = path.join(app.getPath('userData'), 'versions', taskId);
  await fs.remove(versionDir).catch(() => {});
  
  deleteTask(taskId);
  return true;
});

ipcMain.handle('task:run', async (event, taskId: string) => {
  const task = getTask(taskId);
  if (!task) return false;

  taskScheduler.runTask(taskId);
  return true;
});

ipcMain.handle('task:pause', async (event, taskId: string) => {
  taskScheduler.pauseTask(taskId);
  const task = getTask(taskId);
  if (task) {
    saveTask({ ...task, paused: true, updatedAt: Date.now() });
  }
  return true;
});

ipcMain.handle('task:resume', async (event, taskId: string) => {
  taskScheduler.resumeTask(taskId);
  const task = getTask(taskId);
  if (task) {
    saveTask({ ...task, paused: false, updatedAt: Date.now() });
  }
  return true;
});

ipcMain.handle('task:cancel', async (event, taskId: string) => {
  taskScheduler.cancelTask(taskId);
  return true;
});

ipcMain.handle('task:enable', async (event, taskId: string) => {
  taskScheduler.enableTask(taskId);
  const task = getTask(taskId);
  if (task) {
    saveTask({ ...task, enabled: true, updatedAt: Date.now() });
  }
  return true;
});

ipcMain.handle('task:disable', async (event, taskId: string) => {
  taskScheduler.disableTask(taskId);
  const task = getTask(taskId);
  if (task) {
    saveTask({ ...task, enabled: false, updatedAt: Date.now() });
  }
  return true;
});

ipcMain.handle('logs:list', async (event, taskId: string, limit: number = 100) => {
  return getLogs(taskId, limit);
});

ipcMain.handle('versions:list', async (event, taskId: string, filePath: string) => {
  return getVersions(taskId, filePath);
});

ipcMain.handle('versions:restore', async (event, taskId: string, versionId: string, toSource: boolean) => {
  const task = getTask(taskId);
  if (!task) return false;

  const engine = createSyncEngine(task);
  await engine.restoreVersion(versionId, toSource);

  return true;
});

ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('conflict:resolve', async (event, conflictId: string, resolution: ConflictResolution) => {
  const pending = pendingConflicts.get(conflictId);
  if (pending) {
    pending.resolve(resolution);
    pendingConflicts.delete(conflictId);
  }
  return true;
});
