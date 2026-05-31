import type { FileInfo, ConnectionConfig } from '../../shared/types';

export interface TransferProgress {
  taskId: string;
  filePath: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

export interface ResumeState {
  filePath: string;
  remotePath: string;
  bytesTransferred: number;
  totalBytes: number;
  timestamp: number;
}

export interface IFileClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listFiles(path: string): Promise<FileInfo[]>;
  getFileInfo(path: string): Promise<FileInfo | null>;
  exists(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<void>;
  downloadFile(
    sourcePath: string,
    targetPath: string,
    onProgress?: (progress: TransferProgress) => void,
    resumeState?: ResumeState
  ): Promise<void>;
  uploadFile(
    sourcePath: string,
    targetPath: string,
    onProgress?: (progress: TransferProgress) => void,
    resumeState?: ResumeState
  ): Promise<void>;
  deleteFile(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
}
