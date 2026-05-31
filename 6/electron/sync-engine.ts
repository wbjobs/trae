import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { app } from 'electron';
import type { 
  SyncTask, FileInfo, SyncLog, FileVersion, 
  SyncProgress, SyncConflict, ConflictResolution,
  TaskStatus, SyncDirection
} from '../shared/types';
import { createClient } from './network/factory';
import type { IFileClient, TransferProgress } from './network/types';
import { 
  addLog, addVersion, getVersionById, 
  deleteOldVersions, getNextVersion, updateTaskStatus,
  getFileSnapshot, updateFileSnapshot, type FileSnapshot
} from './database';
import { filterFiles } from './filters';
import { encryptFile, decryptFile, generateKey } from './encryption';

export type OnProgressCallback = (progress: SyncProgress) => void;
export type OnLogCallback = (log: SyncLog) => void;
export type OnConflictCallback = (conflict: SyncConflict) => Promise<ConflictResolution | null>;
export type OnCompleteCallback = (success: boolean, hasConflicts: boolean) => void;
export type OnConflictNotifyCallback = () => void;

class SyncEngine {
  private task: SyncTask;
  private sourceClient!: IFileClient;
  private targetClient!: IFileClient;
  private onProgress?: OnProgressCallback;
  private onLog?: OnLogCallback;
  private onConflict?: OnConflictCallback;
  private onComplete?: OnCompleteCallback;
  private onConflictNotify?: OnConflictNotifyCallback;
  private cancelled: boolean = false;
  private paused: boolean = false;
  private hadConflicts: boolean = false;

  constructor(task: SyncTask) {
    this.task = task;
    this.ensureEncryptionKey();
  }

  private ensureEncryptionKey(): void {
    if (this.task.encryption.enabled && !this.task.encryption.key) {
      this.task.encryption.key = generateKey();
    }
  }

  cancel(): void {
    this.cancelled = true;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  async execute(
    onProgress?: OnProgressCallback,
    onLog?: OnLogCallback,
    onConflict?: OnConflictCallback,
    onComplete?: OnCompleteCallback,
    onConflictNotify?: OnConflictNotifyCallback
  ): Promise<void> {
    this.onProgress = onProgress;
    this.onLog = onLog;
    this.onConflict = onConflict;
    this.onComplete = onComplete;
    this.onConflictNotify = onConflictNotify;
    this.cancelled = false;
    this.paused = false;
    this.hadConflicts = false;

    let success = true;

    try {
      await this.initializeClients();
      await this.log('info', '开始同步任务');

      if (this.task.direction === 'one-way') {
        await this.syncOneWay();
      } else {
        await this.syncTwoWay();
      }

      updateTaskStatus(this.task.id, 'idle', Date.now());
      await this.log('success', '同步完成');
    } catch (err: any) {
      success = false;
      updateTaskStatus(this.task.id, 'error');
      await this.log('error', `同步失败: ${err.message}`);
      throw err;
    } finally {
      await this.cleanupClients();
      this.onComplete?.(success, this.hadConflicts);
    }
  }

  private async initializeClients(): Promise<void> {
    this.sourceClient = createClient(this.task.source);
    this.targetClient = createClient(this.task.target);

    await this.sourceClient.connect();
    await this.targetClient.connect();
  }

  private async cleanupClients(): Promise<void> {
    try {
      await this.sourceClient?.disconnect();
      await this.targetClient?.disconnect();
    } catch (err) {
    }
  }

  private async log(level: 'info' | 'warn' | 'error' | 'success', message: string, action?: any, filePath?: string): Promise<void> {
    const log: SyncLog = {
      id: crypto.randomUUID(),
      taskId: this.task.id,
      level,
      message,
      action,
      filePath,
      createdAt: Date.now()
    };

    addLog(log);
    this.onLog?.(log);
  }

  private async checkPaused(): Promise<void> {
    while (this.paused && !this.cancelled) {
      await this.delay(500);
    }
    if (this.cancelled) {
      throw new Error('同步已取消');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getAllFiles(client: IFileClient, dirPath: string = ''): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    const entries = await client.listFiles(dirPath);

    for (const entry of entries) {
      if (entry.isDirectory) {
        files.push(...await this.getAllFiles(client, entry.path));
      } else {
        files.push(entry);
      }
    }

    return files;
  }

  private async syncOneWay(): Promise<void> {
    let sourceFiles = await this.getAllFiles(this.sourceClient);
    let targetFiles = await this.getAllFiles(this.targetClient);

    sourceFiles = filterFiles(sourceFiles, this.task.filterConfig);
    targetFiles = filterFiles(targetFiles, this.task.filterConfig);

    const sourceMap = new Map(sourceFiles.map(f => [f.path, f]));
    const targetMap = new Map(targetFiles.map(f => [f.path, f]));

    const allPaths = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    const filesToProcess: { path: string; action: 'copy' | 'delete'; source?: FileInfo; target?: FileInfo }[] = [];

    for (const filePath of allPaths) {
      const sourceFile = sourceMap.get(filePath);
      const targetFile = targetMap.get(filePath);

      if (sourceFile && !targetFile) {
        filesToProcess.push({ path: filePath, action: 'copy', source: sourceFile });
      } else if (!sourceFile && targetFile) {
        filesToProcess.push({ path: filePath, action: 'delete', target: targetFile });
      } else if (sourceFile && targetFile) {
        if (sourceFile.hash !== targetFile.hash || 
            sourceFile.modifiedAt > targetFile.modifiedAt) {
          filesToProcess.push({ path: filePath, action: 'copy', source: sourceFile, target: targetFile });
        }
      }
    }

    let completed = 0;
    const total = filesToProcess.length;

    for (const item of filesToProcess) {
      await this.checkPaused();
      
      this.onProgress?.({
        taskId: this.task.id,
        total,
        completed,
        currentFile: item.path,
        currentProgress: total > 0 ? (completed / total) * 100 : 0
      });

      try {
        if (item.action === 'copy' && item.source) {
          if (this.task.preserveVersions && item.target) {
            await this.backupVersion(item.path, item.target);
          }
          await this.copyFile(this.sourceClient, this.targetClient, item.path);
          await this.log('success', `已同步: ${item.path}`, 'copy', item.path);
        } else if (item.action === 'delete' && item.target) {
          await this.targetClient.deleteFile(item.path);
          await this.log('info', `已删除: ${item.path}`, 'delete', item.path);
        }
      } catch (err: any) {
        await this.log('error', `处理文件失败 ${item.path}: ${err.message}`, undefined, item.path);
      }

      completed++;
    }
  }

  private async syncTwoWay(): Promise<void> {
    let sourceFiles = await this.getAllFiles(this.sourceClient);
    let targetFiles = await this.getAllFiles(this.targetClient);

    sourceFiles = filterFiles(sourceFiles, this.task.filterConfig);
    targetFiles = filterFiles(targetFiles, this.task.filterConfig);

    const sourceMap = new Map(sourceFiles.map(f => [f.path, f]));
    const targetMap = new Map(targetFiles.map(f => [f.path, f]));

    const lastSourceSnapshot = getFileSnapshot(this.task.id, 'source');
    const lastTargetSnapshot = getFileSnapshot(this.task.id, 'target');

    const allPaths = new Set([
      ...sourceMap.keys(), 
      ...targetMap.keys(), 
      ...lastSourceSnapshot.keys(),
      ...lastTargetSnapshot.keys()
    ]);

    const filesToProcess: { 
      path: string; 
      action: 'copy' | 'delete' | 'conflict'; 
      direction?: 'source-to-target' | 'target-to-source';
      source?: FileInfo; 
      target?: FileInfo 
    }[] = [];

    for (const filePath of allPaths) {
      const sourceFile = sourceMap.get(filePath);
      const targetFile = targetMap.get(filePath);
      const lastSourceFile = lastSourceSnapshot.get(filePath);
      const lastTargetFile = lastTargetSnapshot.get(filePath);

      const sourceExists = !!sourceFile;
      const targetExists = !!targetFile;
      const sourceExistedBefore = !!lastSourceFile;
      const targetExistedBefore = !!lastTargetFile;

      if (sourceExists && targetExists) {
        const sourceNewer = sourceFile.modifiedAt > targetFile.modifiedAt;
        const targetNewer = targetFile.modifiedAt > sourceFile.modifiedAt;
        const hashesEqual = sourceFile.hash === targetFile.hash;

        if (!hashesEqual) {
          if (sourceNewer) {
            filesToProcess.push({ 
              path: filePath, 
              action: 'copy', 
              direction: 'source-to-target', 
              source: sourceFile, 
              target: targetFile 
            });
          } else if (targetNewer) {
            filesToProcess.push({ 
              path: filePath, 
              action: 'copy', 
              direction: 'target-to-source', 
              source: sourceFile, 
              target: targetFile 
            });
          } else {
            filesToProcess.push({ 
              path: filePath, 
              action: 'conflict', 
              source: sourceFile, 
              target: targetFile 
            });
          }
        }
      } else if (sourceExists && !targetExists) {
        if (sourceExistedBefore && targetExistedBefore) {
          filesToProcess.push({ 
            path: filePath, 
            action: 'delete', 
            direction: 'target-to-source'
          });
        } else if (!targetExistedBefore) {
          filesToProcess.push({ 
            path: filePath, 
            action: 'copy', 
            direction: 'source-to-target', 
            source: sourceFile 
          });
        } else {
          filesToProcess.push({ 
            path: filePath, 
            action: 'copy', 
            direction: 'source-to-target', 
            source: sourceFile 
          });
        }
      } else if (!sourceExists && targetExists) {
        if (sourceExistedBefore && targetExistedBefore) {
          filesToProcess.push({ 
            path: filePath, 
            action: 'delete', 
            direction: 'source-to-target'
          });
        } else if (!sourceExistedBefore) {
          filesToProcess.push({ 
            path: filePath, 
            action: 'copy', 
            direction: 'target-to-source', 
            target: targetFile 
          });
        } else {
          filesToProcess.push({ 
            path: filePath, 
            action: 'copy', 
            direction: 'target-to-source', 
            target: targetFile 
          });
        }
      } else if (!sourceExists && !targetExists) {
      }
    }

    let completed = 0;
    const total = filesToProcess.length;

    for (const item of filesToProcess) {
      await this.checkPaused();

      this.onProgress?.({
        taskId: this.task.id,
        total,
        completed,
        currentFile: item.path,
        currentProgress: total > 0 ? (completed / total) * 100 : 0
      });

      try {
        if (item.action === 'conflict' && item.source && item.target) {
          const resolution = await this.resolveConflict(item.source, item.target);
          if (resolution === 'source' || resolution === 'latest' && item.source.modifiedAt >= item.target.modifiedAt) {
            await this.backupVersion(item.path, item.target);
            await this.copyFile(this.sourceClient, this.targetClient, item.path);
            await this.log('success', `冲突解决(保留源): ${item.path}`, 'conflict', item.path);
          } else if (resolution === 'target' || resolution === 'latest') {
            await this.backupVersion(item.path, item.source, true);
            await this.copyFile(this.targetClient, this.sourceClient, item.path);
            await this.log('success', `冲突解决(保留目标): ${item.path}`, 'conflict', item.path);
          }
        } else if (item.action === 'copy') {
          if (item.direction === 'source-to-target' && item.source) {
            if (this.task.preserveVersions && item.target) {
              await this.backupVersion(item.path, item.target);
            }
            await this.copyFile(this.sourceClient, this.targetClient, item.path);
            await this.log('success', `已同步(源到目标): ${item.path}`, 'copy', item.path);
          } else if (item.direction === 'target-to-source' && item.target) {
            if (this.task.preserveVersions && item.source) {
              await this.backupVersion(item.path, item.source, true);
            }
            await this.copyFile(this.targetClient, this.sourceClient, item.path);
            await this.log('success', `已同步(目标到源): ${item.path}`, 'copy', item.path);
          }
        } else if (item.action === 'delete') {
          if (item.direction === 'source-to-target') {
            await this.targetClient.deleteFile(item.path);
            await this.log('info', `已同步删除(源到目标): ${item.path}`, 'delete', item.path);
          } else if (item.direction === 'target-to-source') {
            await this.sourceClient.deleteFile(item.path);
            await this.log('info', `已同步删除(目标到源): ${item.path}`, 'delete', item.path);
          }
        }
      } catch (err: any) {
        await this.log('error', `处理文件失败 ${item.path}: ${err.message}`, undefined, item.path);
      }

      completed++;
    }

    const sourceSnapshot: FileSnapshot[] = sourceFiles.map(f => ({
      filePath: f.path,
      hash: f.hash || null,
      size: f.size,
      modifiedAt: f.modifiedAt
    }));
    const targetSnapshot: FileSnapshot[] = targetFiles.map(f => ({
      filePath: f.path,
      hash: f.hash || null,
      size: f.size,
      modifiedAt: f.modifiedAt
    }));

    updateFileSnapshot(this.task.id, 'source', sourceSnapshot);
    updateFileSnapshot(this.task.id, 'target', targetSnapshot);
  }

  private async resolveConflict(source: FileInfo, target: FileInfo): Promise<ConflictResolution> {
    this.hadConflicts = true;
    this.onConflictNotify?.();

    if (this.task.conflictResolution !== 'manual') {
      return this.task.conflictResolution;
    }

    const conflict: SyncConflict = {
      taskId: this.task.id,
      sourceFile: source,
      targetFile: target,
      resolved: false
    };

    const resolution = await this.onConflict?.(conflict);
    return resolution || 'latest';
  }

  private async backupVersion(filePath: string, file: FileInfo, isSource: boolean = false): Promise<void> {
    if (!this.task.preserveVersions) return;

    const client = isSource ? this.sourceClient : this.targetClient;
    const versionDir = path.join(app.getPath('userData'), 'versions', this.task.id);
    await fs.ensureDir(versionDir);

    const version = getNextVersion(this.task.id, filePath);
    const storagePath = path.join(versionDir, `${filePath.replace(/[\\/:]/g, '_')}.v${version}`);

    const tempPath = path.join(app.getPath('temp'), crypto.randomUUID());
    await this.downloadToLocal(client, filePath, tempPath);

    const hash = await this.getFileHash(tempPath);
    const stats = await fs.stat(tempPath);
    
    await fs.move(tempPath, storagePath);

    addVersion({
      id: crypto.randomUUID(),
      taskId: this.task.id,
      filePath,
      hash,
      size: stats.size,
      version,
      storagePath,
      createdAt: Date.now()
    });

    deleteOldVersions(this.task.id, filePath, this.task.maxVersions);
  }

  private async downloadToLocal(client: IFileClient, sourcePath: string, targetPath: string): Promise<void> {
    await client.downloadFile(sourcePath, targetPath);
  }

  private async copyFile(source: IFileClient, target: IFileClient, filePath: string): Promise<void> {
    const tempPath = path.join(app.getPath('temp'), crypto.randomUUID());
    const processedPath = path.join(app.getPath('temp'), crypto.randomUUID());
    
    try {
      const transferProgress = (progress: TransferProgress) => {
        this.onProgress?.({
          taskId: this.task.id,
          total: 1,
          completed: 0,
          currentFile: filePath,
          currentProgress: progress.percentage
        });
      };

      await source.downloadFile(filePath, tempPath, transferProgress);
      
      if (this.task.encryption.enabled) {
        const isSource = source === this.sourceClient;
        if (isSource) {
          await encryptFile(tempPath, processedPath, this.task.encryption);
          await target.uploadFile(processedPath, filePath, transferProgress);
        } else {
          await decryptFile(tempPath, processedPath, this.task.encryption);
          await target.uploadFile(processedPath, filePath, transferProgress);
        }
      } else {
        await target.uploadFile(tempPath, filePath, transferProgress);
      }
    } finally {
      await fs.remove(tempPath).catch(() => {});
      await fs.remove(processedPath).catch(() => {});
    }
  }

  private async getFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async restoreVersion(versionId: string, toSource: boolean): Promise<void> {
    const version = getVersionById(versionId);
    if (!version) {
      throw new Error('版本不存在');
    }

    const client = toSource ? this.sourceClient : this.targetClient;
    await client.uploadFile(version.storagePath, version.filePath);
  }
}

export function createSyncEngine(task: SyncTask): SyncEngine {
  return new SyncEngine(task);
}
