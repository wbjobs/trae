import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import type { IFileClient, TransferProgress, ResumeState } from './types';
import type { FileInfo, ConnectionConfig } from '../../shared/types';

const CHUNK_SIZE = 1024 * 1024;
export class LocalFileClient implements IFileClient {
  private basePath: string;
  private connected: boolean = false;

  constructor(config: ConnectionConfig) {
    this.basePath = config.path;
  }

  async connect(): Promise<void> {
    await fs.ensureDir(this.basePath);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  private getFullPath(relativePath: string): string {
    return path.join(this.basePath, relativePath);
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

  async listFiles(dirPath: string): Promise<FileInfo[]> {
    const fullDirPath = this.getFullPath(dirPath);
    
    if (!(await fs.pathExists(fullDirPath))) {
      return [];
    }

    const entries = await fs.readdir(fullDirPath, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      const relativePath = path.join(dirPath, entry.name);
      const fullPath = path.join(fullDirPath, entry.name);
      const stats = await fs.stat(fullPath);

      files.push({
        path: relativePath,
        size: stats.size,
        modifiedAt: stats.mtime.getTime(),
        isDirectory: entry.isDirectory(),
        hash: entry.isFile() ? await this.getFileHash(fullPath) : undefined
      });
    }

    return files;
  }

  async getFileInfo(filePath: string): Promise<FileInfo | null> {
    const fullPath = this.getFullPath(filePath);
    
    if (!(await fs.pathExists(fullPath))) {
      return null;
    }

    const stats = await fs.stat(fullPath);
    return {
      path: filePath,
      size: stats.size,
      modifiedAt: stats.mtime.getTime(),
      isDirectory: stats.isDirectory(),
      hash: stats.isFile() ? await this.getFileHash(fullPath) : undefined
    };
  }

  async exists(filePath: string): Promise<boolean> {
    return fs.pathExists(this.getFullPath(filePath));
  }

  async createDirectory(dirPath: string): Promise<void> {
    await fs.ensureDir(this.getFullPath(dirPath));
  }

  async downloadFile(
    sourcePath: string,
    targetPath: string,
    onProgress?: (progress: TransferProgress) => void,
    resumeState?: ResumeState
  ): Promise<void> {
    const sourceFullPath = this.getFullPath(sourcePath);
    const stats = await fs.stat(sourceFullPath);
    const totalBytes = stats.size;
    
    let bytesTransferred = resumeState?.bytesTransferred || 0;
    const mode = bytesTransferred > 0 ? 'a' : 'w';
    
    const readStream = fs.createReadStream(sourceFullPath, {
      start: bytesTransferred
    });
    const writeStream = fs.createWriteStream(targetPath, { flags: mode });

    return new Promise((resolve, reject) => {
      readStream.pipe(writeStream);

      readStream.on('data', (chunk) => {
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
      readStream.on('error', reject);
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
    await fs.ensureDir(path.dirname(targetFullPath));
    
    const stats = await fs.stat(sourcePath);
    const totalBytes = stats.size;
    
    let bytesTransferred = resumeState?.bytesTransferred || 0;
    const mode = bytesTransferred > 0 ? 'a' : 'w';
    
    const readStream = fs.createReadStream(sourcePath, {
      start: bytesTransferred
    });
    const writeStream = fs.createWriteStream(targetFullPath, { flags: mode });

    return new Promise((resolve, reject) => {
      readStream.pipe(writeStream);

      readStream.on('data', (chunk) => {
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
    if (await fs.pathExists(fullPath)) {
      await fs.unlink(fullPath);
    }
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }
}
