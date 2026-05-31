import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import type { SyncTask, SyncLog, FileVersion, ConnectionConfig } from '../shared/types';

let db: Database.Database;

const DEFAULT_FILTER_CONFIG = {
  includePatterns: [],
  excludePatterns: [],
  includeExtensions: [],
  excludeExtensions: [],
  excludeHidden: false
};

const DEFAULT_ENCRYPTION_CONFIG = {
  enabled: false,
  algorithm: 'aes-256-cbc' as const
};

const DEFAULT_NOTIFICATION_CONFIG = {
  onSuccess: true,
  onError: true,
  onConflict: true
};

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'filesync.db');
  db = new Database(dbPath);
  
  db.pragma('journal_mode = WAL');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      direction TEXT NOT NULL,
      trigger TEXT NOT NULL,
      schedule TEXT,
      enabled INTEGER DEFAULT 1,
      paused INTEGER DEFAULT 0,
      conflict_resolution TEXT DEFAULT 'latest',
      preserve_versions INTEGER DEFAULT 1,
      max_versions INTEGER DEFAULT 10,
      filter_config TEXT,
      encryption TEXT,
      notifications TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_sync_at INTEGER,
      status TEXT DEFAULT 'idle'
    );
    
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      action TEXT,
      file_path TEXT,
      created_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      version INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS file_snapshots (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      side TEXT NOT NULL,
      hash TEXT,
      size INTEGER,
      modified_at INTEGER,
      created_at INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_versions_task_file ON versions(task_id, file_path, version DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_task_side ON file_snapshots(task_id, side, file_path);
  `);
  
  migrateDatabase();
}

function migrateDatabase(): void {
  const pragma = db.prepare("PRAGMA table_info(tasks)");
  const columns = pragma.all() as any[];
  const columnNames = columns.map(c => c.name);
  
  if (!columnNames.includes('filter_config')) {
    db.exec('ALTER TABLE tasks ADD COLUMN filter_config TEXT');
  }
  if (!columnNames.includes('encryption')) {
    db.exec('ALTER TABLE tasks ADD COLUMN encryption TEXT');
  }
  if (!columnNames.includes('notifications')) {
    db.exec('ALTER TABLE tasks ADD COLUMN notifications TEXT');
  }
}

function parseFilterConfig(row: any): any {
  if (row.filter_config) {
    try {
      return JSON.parse(row.filter_config);
    } catch {
    }
  }
  return { ...DEFAULT_FILTER_CONFIG };
}

function parseEncryptionConfig(row: any): any {
  if (row.encryption) {
    try {
      return JSON.parse(row.encryption);
    } catch {
    }
  }
  return { ...DEFAULT_ENCRYPTION_CONFIG };
}

function parseNotificationConfig(row: any): any {
  if (row.notifications) {
    try {
      return JSON.parse(row.notifications);
    } catch {
    }
  }
  return { ...DEFAULT_NOTIFICATION_CONFIG };
}

export function getTasks(): SyncTask[] {
  const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    source: JSON.parse(row.source),
    target: JSON.parse(row.target),
    direction: row.direction,
    trigger: row.trigger,
    schedule: row.schedule || undefined,
    enabled: row.enabled === 1,
    paused: row.paused === 1,
    conflictResolution: row.conflict_resolution,
    preserveVersions: row.preserve_versions === 1,
    maxVersions: row.max_versions,
    filterConfig: parseFilterConfig(row),
    encryption: parseEncryptionConfig(row),
    notifications: parseNotificationConfig(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncAt: row.last_sync_at || undefined,
    status: row.status
  }));
}

export function getTask(id: string): SyncTask | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    source: JSON.parse(row.source),
    target: JSON.parse(row.target),
    direction: row.direction,
    trigger: row.trigger,
    schedule: row.schedule || undefined,
    enabled: row.enabled === 1,
    paused: row.paused === 1,
    conflictResolution: row.conflict_resolution,
    preserveVersions: row.preserve_versions === 1,
    maxVersions: row.max_versions,
    filterConfig: parseFilterConfig(row),
    encryption: parseEncryptionConfig(row),
    notifications: parseNotificationConfig(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncAt: row.last_sync_at || undefined,
    status: row.status
  };
}

export function saveTask(task: SyncTask): void {
  const stmt = db.prepare(`
    INSERT INTO tasks (id, name, source, target, direction, trigger, schedule, enabled, paused, 
                       conflict_resolution, preserve_versions, max_versions, filter_config, encryption, notifications,
                       created_at, updated_at, last_sync_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source = excluded.source,
      target = excluded.target,
      direction = excluded.direction,
      trigger = excluded.trigger,
      schedule = excluded.schedule,
      enabled = excluded.enabled,
      paused = excluded.paused,
      conflict_resolution = excluded.conflict_resolution,
      preserve_versions = excluded.preserve_versions,
      max_versions = excluded.max_versions,
      filter_config = excluded.filter_config,
      encryption = excluded.encryption,
      notifications = excluded.notifications,
      updated_at = excluded.updated_at,
      last_sync_at = excluded.last_sync_at,
      status = excluded.status
  `);
  
  stmt.run(
    task.id,
    task.name,
    JSON.stringify(task.source),
    JSON.stringify(task.target),
    task.direction,
    task.trigger,
    task.schedule || null,
    task.enabled ? 1 : 0,
    task.paused ? 1 : 0,
    task.conflictResolution,
    task.preserveVersions ? 1 : 0,
    task.maxVersions,
    JSON.stringify(task.filterConfig),
    JSON.stringify(task.encryption),
    JSON.stringify(task.notifications),
    task.createdAt,
    task.updatedAt,
    task.lastSyncAt || null,
    task.status
  );
}

export function deleteTask(id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  db.prepare('DELETE FROM logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM versions WHERE task_id = ?').run(id);
}

export function updateTaskStatus(id: string, status: string, lastSyncAt?: number): void {
  const stmt = db.prepare('UPDATE tasks SET status = ?, last_sync_at = ?, updated_at = ? WHERE id = ?');
  stmt.run(status, lastSyncAt || null, Date.now(), id);
}

export function addLog(log: SyncLog): void {
  const stmt = db.prepare(`
    INSERT INTO logs (id, task_id, level, message, action, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(log.id, log.taskId, log.level, log.message, log.action || null, log.filePath || null, log.createdAt);
}

export function getLogs(taskId: string, limit: number = 100): SyncLog[] {
  const rows = db.prepare('SELECT * FROM logs WHERE task_id = ? ORDER BY created_at DESC LIMIT ?').all(taskId, limit) as any[];
  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    level: row.level,
    message: row.message,
    action: row.action || undefined,
    filePath: row.file_path || undefined,
    createdAt: row.created_at
  }));
}

export function addVersion(version: FileVersion): void {
  const stmt = db.prepare(`
    INSERT INTO versions (id, task_id, file_path, hash, size, version, storage_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(version.id, version.taskId, version.filePath, version.hash, version.size, version.version, version.storagePath, version.createdAt);
}

export function getVersions(taskId: string, filePath: string): FileVersion[] {
  const rows = db.prepare(`
    SELECT * FROM versions 
    WHERE task_id = ? AND file_path = ? 
    ORDER BY version DESC
  `).all(taskId, filePath) as any[];
  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    filePath: row.file_path,
    hash: row.hash,
    size: row.size,
    version: row.version,
    storagePath: row.storage_path,
    createdAt: row.created_at
  }));
}

export function getLatestVersion(taskId: string, filePath: string): FileVersion | undefined {
  const row = db.prepare(`
    SELECT * FROM versions 
    WHERE task_id = ? AND file_path = ? 
    ORDER BY version DESC LIMIT 1
  `).get(taskId, filePath) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    taskId: row.task_id,
    filePath: row.file_path,
    hash: row.hash,
    size: row.size,
    version: row.version,
    storagePath: row.storage_path,
    createdAt: row.created_at
  };
}

export function deleteOldVersions(taskId: string, filePath: string, maxVersions: number): void {
  const stmt = db.prepare(`
    DELETE FROM versions 
    WHERE task_id = ? AND file_path = ? AND version <= (
      SELECT version FROM versions 
      WHERE task_id = ? AND file_path = ? 
      ORDER BY version DESC LIMIT 1 OFFSET ?
    )
  `);
  stmt.run(taskId, filePath, taskId, filePath, maxVersions - 1);
}

export function getNextVersion(taskId: string, filePath: string): number {
  const row = db.prepare(`
    SELECT MAX(version) as max_version FROM versions 
    WHERE task_id = ? AND file_path = ?
  `).get(taskId, filePath) as any;
  return (row?.max_version || 0) + 1;
}

export function getVersionById(versionId: string): FileVersion | undefined {
  const row = db.prepare('SELECT * FROM versions WHERE id = ?').get(versionId) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    taskId: row.task_id,
    filePath: row.file_path,
    hash: row.hash,
    size: row.size,
    version: row.version,
    storagePath: row.storage_path,
    createdAt: row.created_at
  };
}

export interface FileSnapshot {
  filePath: string;
  hash: string | null;
  size: number;
  modifiedAt: number;
}

export function getFileSnapshot(taskId: string, side: 'source' | 'target'): Map<string, FileSnapshot> {
  const rows = db.prepare(`
    SELECT file_path, hash, size, modified_at
    FROM file_snapshots
    WHERE task_id = ? AND side = ?
  `).all(taskId, side) as any[];
  
  const map = new Map<string, FileSnapshot>();
  for (const row of rows) {
    map.set(row.file_path, {
      filePath: row.file_path,
      hash: row.hash,
      size: row.size,
      modifiedAt: row.modified_at
    });
  }
  return map;
}

export function updateFileSnapshot(taskId: string, side: 'source' | 'target', files: FileSnapshot[]): void {
  const deleteStmt = db.prepare('DELETE FROM file_snapshots WHERE task_id = ? AND side = ?');
  deleteStmt.run(taskId, side);
  
  const insertStmt = db.prepare(`
    INSERT INTO file_snapshots (id, task_id, file_path, side, hash, size, modified_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const now = Date.now();
  const transaction = db.transaction((fileList: FileSnapshot[]) => {
    for (const file of fileList) {
      insertStmt.run(
        crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
        taskId,
        file.filePath,
        side,
        file.hash,
        file.size,
        file.modifiedAt,
        now
      );
    }
  });
  
  transaction(files);
}
