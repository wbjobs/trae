import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import type { IFileClient, TransferProgress, ResumeState } from './types';
import type { FileInfo, ConnectionConfig } from '../../shared/types';

export class WebDavFileClient implements IFileClient {
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
    
    const webdavModule = await import('webdav');
    const createClient = webdavModule.createClient;
    
    const authConfig: any = {};
    if (this.config.username && this.config.password) {
      authConfig.username = this.config.username;
      authConfig.password = this.config.password;
    }

    this.client = createClient(this.config.url!, authConfig);
    this.connected = true;
    
    try {
      await this.client.createDirectory(this.basePath, { recursive: true });
    } catch (err) {
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  private getFullPath(relativePath: string): string {
    return path.posix.join(this.basePath, relativePath);
  }

  private async getLocalFileHash(filePath: string): Promise<string> {
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
    
    try {
      const entries = await this.client.getDirectoryContents(fullDirPath);
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const relativePath = path.posix.join(dirPath, path.basename(entry.filename));
        
        files.push({
          path: relativePath,
          size: entry.size || 0,
          modifiedAt: new Date(entry.lastmod).getTime(),
          isDirectory: entry.type === 'directory'
        });
      }

      return files;
    } catch (err: any) {
      if (err.response?.status === 404) {
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
        size: stat.size || 0,
        modifiedAt: new Date(stat.lastmod).getTime(),
        isDirectory: stat.type === 'directory'
      };
    } catch (err: any) {
      if (err.response?.status === 404) {
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
      if (err.response?.status === 404) {
        return false;
      }
      throw err;
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);
    await this.client.createDirectory(fullPath, { recursive: true });
  }

  async downloadFile(
    sourcePath: string,
    targetPath: string,
    onProgress?: (progress: TransferProgress) => void,
    resumeState?: ResumeState
  ): Promise<void> {
    const sourceFullPath = this.getFullPath(sourcePath);
    const stat = await this.client.stat(sourceFullPath);
    const totalBytes = stat.size || 0;
    
    let bytesTransferred = resumeState?.bytesTransferred || 0;
    
    await fs.ensureDir(path.dirname(targetPath));
    
    if (bytesTransferred > 0 && bytesTransferred >= totalBytes) {
      return;
    }

    const headers: any = {};
    if (bytesTransferred > 0) {
      headers.Range = `bytes=${bytesTransferred}-`;
    }

    const response = await this.client.createReadStream(sourceFullPath, { headers });
    const writeStream = fs.createWriteStream(targetPath, {
      flags: bytesTransferred > 0 ? 'a' : 'w'
    });

    return new Promise((resolve, reject) => {
      response.pipe(writeStream);

      response.on('data', (chunk: Buffer) => {
        bytesTransferred += chunk.length;
        if (onProgress && totalBytes > 0) {
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
      response.on('error', reject);
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
    
    let bytesTransferred = resumeState?.bytesTransferred || 0;
    
    if (bytesTransferred > 0 && bytesTransferred >= totalBytes) {
      return;
    }

    const readStream = fs.createReadStream(sourcePath, {
      start: bytesTransferred
    });

    await this.client.createDirectory(path.posix.dirname(targetFullPath), { recursive: true });

    return new Promise((resolve, reject) => {
      let responsePromise: Promise<any>;
      
      if (bytesTransferred === 0) {
        responsePromise = this.client.putFileContents(targetFullPath, readStream);
      } else {
        responsePromise = this.client.putFileContents(targetFullPath, readStream, {
          overwrite: true
        });
      }

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

      responsePromise.then(resolve).catch(reject);
      readStream.on('error', reject);
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.getFullPath(filePath);
    try {
      await this.client.deleteFile(fullPath);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        throw err;
      }
    }
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);
    try {
      await this.client.deleteFile(fullPath);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        throw err;
      }
    }
  }
}
