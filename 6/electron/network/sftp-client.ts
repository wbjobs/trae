import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import type { Client as SftpClientType } from 'ssh2-sftp-client';
import type { IFileClient, TransferProgress, ResumeState } from './types';
import type { FileInfo, ConnectionConfig } from '../../shared/types';

const CHUNK_SIZE = 1024 * 1024;

export class SftpFileClient implements IFileClient {
  private config: ConnectionConfig;
  private client: any;
  private basePath: string;
  private connected: boolean = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
    this.basePath = config.path;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    
    const sftpModule = await import('ssh2-sftp-client');
    const Client = sftpModule.default || sftpModule;
    this.client = new Client();

    const connectConfig: any = {
      host: this.config.host,
      port: this.config.port || 22,
      username: this.config.username,
    };

    if (this.config.privateKey) {
      connectConfig.privateKey = this.config.privateKey;
    } else if (this.config.password) {
      connectConfig.password = this.config.password;
    }

    await this.client.connect(connectConfig);
    await this.client.mkdir(this.basePath, true);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.end();
      this.connected = false;
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

  private getFullPath(relativePath: string): string {
    return path.posix.join(this.basePath, relativePath);
  }

  async listFiles(dirPath: string): Promise<FileInfo[]> {
    const fullDirPath = this.getFullPath(dirPath);
    
    try {
      const entries = await this.client.list(fullDirPath);
      const files: FileInfo[] = [];

      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue;
        
        const relativePath = path.posix.join(dirPath, entry.name);
        const fullPath = path.posix.join(fullDirPath, entry.name);
        
        files.push({
          path: relativePath,
          size: entry.size,
          modifiedAt: entry.modifyTime * 1000,
          isDirectory: entry.type === 'd'
        });
      }

      return files;
    } catch (err: any) {
      if (err.code === 2) {
        return [];
      }
      throw err;
    }
  }

  async getFileInfo(filePath: string): Promise<FileInfo | null> {
    const fullPath = this.getFullPath(filePath);
    
    try {
      const stat = await this.client.stat(fullPath);
      return {
        path: filePath,
        size: stat.size,
        modifiedAt: stat.modifyTime * 1000,
        isDirectory: stat.isDirectory()
      };
    } catch (err: any) {
      if (err.code === 2) {
        return null;
      }
      throw err;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.getFullPath(filePath);
    try {
      await this.client.stat(fullPath);
      return true;
    } catch (err: any) {
      if (err.code === 2) {
        return false;
      }
      throw err;
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);
    await this.client.mkdir(fullPath, true);
  }

  async downloadFile(
    sourcePath: string,
    targetPath: string,
    onProgress?: (progress: TransferProgress) => void,
    resumeState?: ResumeState
  ): Promise<void> {
    const sourceFullPath = this.getFullPath(sourcePath);
    const stat = await this.client.stat(sourceFullPath);
    const totalBytes = stat.size;
    
    await fs.ensureDir(path.dirname(targetPath));
    
    let bytesTransferred = 0;
    
    if (await fs.pathExists(targetPath)) {
      const localStats = await fs.stat(targetPath);
      bytesTransferred = localStats.size;
    }
    
    if (resumeState && resumeState.bytesTransferred > bytesTransferred) {
      bytesTransferred = resumeState.bytesTransferred;
    }
    
    if (bytesTransferred >= totalBytes) {
      if (onProgress) {
        onProgress({
          taskId: '',
          filePath: sourcePath,
          bytesTransferred: totalBytes,
          totalBytes,
          percentage: 100
        });
      }
      return;
    }

    const stream = this.client.createReadStream(sourceFullPath, {
      start: bytesTransferred
    });
    
    const writeStream = fs.createWriteStream(targetPath, {
      flags: bytesTransferred > 0 ? 'a' : 'w'
    });

    return new Promise((resolve, reject) => {
      stream.pipe(writeStream);

      stream.on('data', (chunk: Buffer) => {
        bytesTransferred += chunk.length;
        if (onProgress) {
          onProgress({
            taskId: '',
            filePath: sourcePath,
            bytesTransferred,
            totalBytes,
            percentage: (bytesTransferred / totalBytes) * 100
          });
        }
      });

      writeStream.on('finish', resolve);
      stream.on('error', reject);
      writeStream.on('error', reject);
    });
  }

  async uploadFile(
    sourcePath: string,
    targetPath: string,
    onProgress?: (progress: TransferProgress) => void,
    resumeState?: ResumeState
  ): Promise<void> {
    const targetFullPath = this.getFullPath(targetPath);
    const stats = await fs.stat(sourcePath);
    const totalBytes = stats.size;
    
    await this.client.mkdir(path.posix.dirname(targetFullPath), true);
    
    let bytesTransferred = 0;
    
    try {
      const remoteStat = await this.client.stat(targetFullPath);
      bytesTransferred = remoteStat.size;
    } catch (err: any) {
      if (err.code !== 2) {
        throw err;
      }
    }
    
    if (resumeState && resumeState.bytesTransferred > bytesTransferred) {
      bytesTransferred = resumeState.bytesTransferred;
    }
    
    if (bytesTransferred >= totalBytes) {
      if (onProgress) {
        onProgress({
          taskId: '',
          filePath: targetPath,
          bytesTransferred: totalBytes,
          totalBytes,
          percentage: 100
        });
      }
      return;
    }

    const readStream = fs.createReadStream(sourcePath, {
      start: bytesTransferred
    });
    
    const writeStream = this.client.createWriteStream(targetFullPath, {
      flags: bytesTransferred > 0 ? 'a' : 'w'
    });

    return new Promise((resolve, reject) => {
      readStream.pipe(writeStream);

      readStream.on('data', (chunk: Buffer) => {
        bytesTransferred += chunk.length;
        if (onProgress) {
          onProgress({
            taskId: '',
            filePath: targetPath,
            bytesTransferred,
            totalBytes,
            percentage: (bytesTransferred / totalBytes) * 100
          });
        }
      });

      writeStream.on('finish', resolve);
      readStream.on('error', reject);
      writeStream.on('error', reject);
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.getFullPath(filePath);
    try {
      await this.client.delete(fullPath);
    } catch (err: any) {
      if (err.code !== 2) {
        throw err;
      }
    }
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);
    try {
      await this.client.rmdir(fullPath, true);
    } catch (err: any) {
      if (err.code !== 2) {
        throw err;
      }
    }
  }
}
