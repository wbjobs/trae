export type SyncDirection = 'one-way' | 'two-way';
export type SyncTrigger = 'manual' | 'schedule' | 'file-change' | 'startup';
export type ConnectionType = 'local' | 'sftp' | 'webdav';
export type TaskStatus = 'idle' | 'running' | 'paused' | 'error';
export type SyncAction = 'copy' | 'delete' | 'move' | 'conflict';
export type ConflictResolution = 'source' | 'target' | 'latest' | 'manual';
export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface FilterConfig {
  includePatterns: string[];
  excludePatterns: string[];
  minFileSize?: number;
  maxFileSize?: number;
  includeExtensions: string[];
  excludeExtensions: string[];
  modifiedAfter?: number;
  modifiedBefore?: number;
  excludeHidden: boolean;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: 'aes-256-cbc' | 'aes-256-gcm';
  key?: string;
}

export interface NotificationConfig {
  onSuccess: boolean;
  onError: boolean;
  onConflict: boolean;
}

export interface SyncTask {
  id: string;
  name: string;
  source: ConnectionConfig;
  target: ConnectionConfig;
  direction: SyncDirection;
  trigger: SyncTrigger;
  schedule?: string;
  enabled: boolean;
  paused: boolean;
  conflictResolution: ConflictResolution;
  preserveVersions: boolean;
  maxVersions: number;
  filterConfig: FilterConfig;
  encryption: EncryptionConfig;
  notifications: NotificationConfig;
  createdAt: number;
  updatedAt: number;
  lastSyncAt?: number;
  status: TaskStatus;
}

export interface ConnectionConfig {
  type: ConnectionType;
  path: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
  url?: string;
}

export interface SyncTask {
  id: string;
  name: string;
  source: ConnectionConfig;
  target: ConnectionConfig;
  direction: SyncDirection;
  trigger: SyncTrigger;
  schedule?: string;
  enabled: boolean;
  paused: boolean;
  conflictResolution: ConflictResolution;
  preserveVersions: boolean;
  maxVersions: number;
  createdAt: number;
  updatedAt: number;
  lastSyncAt?: number;
  status: TaskStatus;
}

export interface SyncLog {
  id: string;
  taskId: string;
  level: LogLevel;
  message: string;
  action?: SyncAction;
  filePath?: string;
  createdAt: number;
}

export interface FileVersion {
  id: string;
  taskId: string;
  filePath: string;
  hash: string;
  size: number;
  version: number;
  storagePath: string;
  createdAt: number;
}

export interface FileInfo {
  path: string;
  size: number;
  modifiedAt: number;
  hash?: string;
  isDirectory: boolean;
}

export interface SyncProgress {
  taskId: string;
  total: number;
  completed: number;
  currentFile: string;
  currentProgress: number;
}

export interface SyncConflict {
  taskId: string;
  sourceFile: FileInfo;
  targetFile: FileInfo;
  resolved: boolean;
  resolution?: ConflictResolution;
}

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  currentFile?: string;
}
