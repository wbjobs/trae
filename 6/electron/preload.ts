import { contextBridge, ipcRenderer } from 'electron';
import type { 
  SyncTask, SyncLog, SyncProgress, 
  SyncConflict, ConflictResolution, FileVersion 
} from '../shared/types';

const api = {
  task: {
    list: (): Promise<SyncTask[]> => ipcRenderer.invoke('task:list'),
    get: (taskId: string): Promise<SyncTask | null> => ipcRenderer.invoke('task:get', taskId),
    create: (data: Partial<SyncTask>): Promise<SyncTask> => ipcRenderer.invoke('task:create', data),
    update: (taskId: string, updates: Partial<SyncTask>): Promise<SyncTask | null> => 
      ipcRenderer.invoke('task:update', taskId, updates),
    delete: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:delete', taskId),
    run: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:run', taskId),
    pause: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:pause', taskId),
    resume: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:resume', taskId),
    cancel: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:cancel', taskId),
    enable: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:enable', taskId),
    disable: (taskId: string): Promise<boolean> => ipcRenderer.invoke('task:disable', taskId),
  },
  logs: {
    list: (taskId: string, limit?: number): Promise<SyncLog[]> => 
      ipcRenderer.invoke('logs:list', taskId, limit),
  },
  versions: {
    list: (taskId: string, filePath: string): Promise<FileVersion[]> => 
      ipcRenderer.invoke('versions:list', taskId, filePath),
    restore: (taskId: string, versionId: string, toSource: boolean): Promise<boolean> => 
      ipcRenderer.invoke('versions:restore', taskId, versionId, toSource),
  },
  dialog: {
    openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:openDirectory'),
  },
  conflict: {
    resolve: (conflictId: string, resolution: ConflictResolution): Promise<boolean> => 
      ipcRenderer.invoke('conflict:resolve', conflictId, resolution),
  },
  onProgress: (callback: (progress: SyncProgress) => void) => {
    ipcRenderer.on('task:progress', (_event, progress) => callback(progress));
  },
  onLog: (callback: (log: SyncLog) => void) => {
    ipcRenderer.on('task:log', (_event, log) => callback(log));
  },
  onConflict: (callback: (conflict: SyncConflict & { conflictId: string }) => void) => {
    ipcRenderer.on('task:conflict', (_event, conflict) => callback(conflict));
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
