import SparkMD5 from 'spark-md5';
import { trackerApi } from './api';
import { p2pManager } from './p2pManager';
import { CHUNK_SIZE } from '../types';
import type { ChunkInfo, UploadState } from '../types';

export class FileManager {
  private chunkCache: Map<string, Map<number, ArrayBuffer>> = new Map();
  private uploadStates: Map<string, UploadState> = new Map();
  private onUploadProgressCallbacks: ((state: UploadState) => void)[] = [];

  constructor() {
    this.setupP2PHandlers();
  }

  private setupP2PHandlers() {
    p2pManager.onMessage('request-chunk', async (msg, peerId) => {
      const { fileId, chunkIndex } = msg.payload;
      const chunk = this.getChunk(fileId, chunkIndex);
      if (chunk) {
        p2pManager.sendChunkData(peerId, fileId, chunkIndex, chunk);
      }
    });

    p2pManager.onMessage('chunk-data', (msg, peerId) => {
      const { fileId, chunkIndex, data } = msg.payload;
      this.storeChunk(fileId, chunkIndex, data);
    });
  }

  async hashFile(file: File, onProgress?: (progress: number) => Promise<void>): Promise<ChunkInfo[]> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks: ChunkInfo[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);
      const chunkBuffer = await chunkBlob.arrayBuffer();
      const hash = this.calculateMD5(chunkBuffer);

      chunks.push({
        index: i,
        hash,
        size: chunkBuffer.byteLength,
        holders: [],
      });

      this.storeChunk(file.name + '_' + file.size, i, chunkBuffer);

      if (onProgress) {
        await onProgress((i + 1) / totalChunks);
      }
    }

    return chunks;
  }

  async uploadFile(file: File): Promise<UploadState> {
    const state: UploadState = {
      fileId: '',
      fileName: file.name,
      fileSize: file.size,
      totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      completedChunks: new Set(),
      status: 'hashing',
      progress: 0,
    };

    this.uploadStates.set(file.name + '_' + file.size, state);
    this.notifyProgress(state);

    try {
      const chunks = await this.hashFile(file, async (progress) => {
        state.progress = progress * 0.2;
        this.notifyProgress(state);
      });

      state.status = 'uploading';
      this.notifyProgress(state);

      const fileRegisterResponse = await trackerApi.registerFile({
        name: file.name,
        size: file.size,
        mime_type: file.type || 'application/octet-stream',
        total_chunks: chunks.length,
        chunks,
      });

      state.fileId = fileRegisterResponse.file_id;

      const tempKey = file.name + '_' + file.size;
      if (tempKey !== state.fileId) {
        const cache = this.chunkCache.get(tempKey);
        if (cache) {
          this.chunkCache.set(state.fileId, cache);
          this.chunkCache.delete(tempKey);
        }
        this.uploadStates.delete(tempKey);
        this.uploadStates.set(state.fileId, state);
      }

      for (let i = 0; i < chunks.length; i++) {
        p2pManager.addHeldChunk(state.fileId, i);
        state.completedChunks.add(i);
        state.progress = 0.2 + (i + 1) / chunks.length * 0.3;
        this.notifyProgress(state);
      }

      state.status = 'distributing';
      this.notifyProgress(state);

      await this.distributeFile(state.fileId, (progress) => {
        state.progress = 0.5 + progress * 0.5;
        this.notifyProgress(state);
      });

      state.status = 'completed';
      state.progress = 1;
      this.notifyProgress(state);

      return state;
    } catch (error) {
      state.status = 'error';
      this.notifyProgress(state);
      throw error;
    }
  }

  private async distributeFile(fileId: string, onProgress: (progress: number) => void) {
    const nodes = await trackerApi.listNodes();
    const activeNodes = nodes.filter((n) => n.is_active && n.id !== p2pManager.getNodeId());
    const targetNodes = activeNodes.slice(0, 3);

    if (targetNodes.length === 0) {
      onProgress(1);
      return;
    }

    const fileInfo = await trackerApi.getFileInfo(fileId);
    if (!fileInfo) {
      throw new Error('File not found');
    }

    const chunksPerNode = Math.ceil(fileInfo.total_chunks / targetNodes.length);
    let completed = 0;
    const total = fileInfo.total_chunks;

    for (let i = 0; i < targetNodes.length; i++) {
      const node = targetNodes[i];
      const startChunk = i * chunksPerNode;
      const endChunk = Math.min(startChunk + chunksPerNode, fileInfo.total_chunks);

      try {
        const peerConn = await p2pManager.createConnection(node.id);

        await this.waitForDataChannel(peerConn);

        for (let chunkIdx = startChunk; chunkIdx < endChunk; chunkIdx++) {
          const chunk = this.getChunk(fileId, chunkIdx);
          if (chunk) {
            p2pManager.sendChunkData(node.id, fileId, chunkIdx, chunk);
            p2pManager.reportTransfer(node.id, chunk.byteLength, 'Upload', chunkIdx, fileId);
            completed++;
            onProgress(completed / total);
            await new Promise((r) => setTimeout(r, 50));
          }
        }
      } catch (e) {
        console.error(`Failed to distribute to node ${node.id}:`, e);
      }
    }

    onProgress(1);
  }

  private async waitForDataChannel(peerConn: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('DataChannel timeout')), 10000);

      const checkChannel = () => {
        if (peerConn.dataChannel?.readyState === 'open') {
          clearTimeout(timeout);
          resolve();
        } else if (peerConn.dataChannel?.readyState === 'closed') {
          clearTimeout(timeout);
          reject(new Error('DataChannel closed'));
        } else {
          setTimeout(checkChannel, 100);
        }
      };

      checkChannel();
    });
  }

  async downloadFile(fileId: string): Promise<File> {
    const fileInfo = await trackerApi.getFileInfo(fileId);
    if (!fileInfo) {
      throw new Error('File not found');
    }

    const chunks: ArrayBuffer[] = [];

    for (let i = 0; i < fileInfo.total_chunks; i++) {
      let chunk = this.getChunk(fileId, i);

      if (!chunk) {
        const nodes = await trackerApi.queryNodes({
          file_id: fileId,
          chunk_index: i,
          count: 3,
        });

        if (nodes.nodes.length === 0) {
          throw new Error(`No nodes have chunk ${i}`);
        }

        chunk = await this.downloadChunkFromPeer(fileId, i, nodes.nodes[0].id);
        this.storeChunk(fileId, i, chunk);
        p2pManager.addHeldChunk(fileId, i);
      }

      chunks.push(chunk);
    }

    const blob = new Blob(chunks, { type: fileInfo.mime_type });
    return new File([blob], fileInfo.name, { type: fileInfo.mime_type });
  }

  private async downloadChunkFromPeer(fileId: string, chunkIndex: number, peerId: string): Promise<ArrayBuffer> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chunk download timeout')), 30000);

      const handler = (msg: any, fromPeerId: string) => {
        if (fromPeerId === peerId && msg.payload.fileId === fileId && msg.payload.chunkIndex === chunkIndex) {
          clearTimeout(timeout);
          p2pManager.offMessage('chunk-data', handler);
          const data = msg.payload.data;
          p2pManager.reportTransfer(fromPeerId, data.byteLength, 'Download', chunkIndex, fileId);
          resolve(data);
        }
      };

      p2pManager.onMessage('chunk-data', handler);

      try {
        const peerConn = await p2pManager.createConnection(peerId);
        await this.waitForDataChannel(peerConn);
        p2pManager.sendMessage(peerId, {
          type: 'request-chunk',
          payload: { fileId, chunkIndex },
        });
      } catch (e) {
        p2pManager.offMessage('chunk-data', handler);
        clearTimeout(timeout);
        reject(e);
      }
    });
  }

  getChunk(fileId: string, chunkIndex: number): ArrayBuffer | undefined {
    const fileChunks = this.chunkCache.get(fileId);
    return fileChunks?.get(chunkIndex);
  }

  storeChunk(fileId: string, chunkIndex: number, data: ArrayBuffer) {
    if (!this.chunkCache.has(fileId)) {
      this.chunkCache.set(fileId, new Map());
    }
    this.chunkCache.get(fileId)!.set(chunkIndex, data);
  }

  hasChunk(fileId: string, chunkIndex: number): boolean {
    return this.chunkCache.get(fileId)?.has(chunkIndex) ?? false;
  }

  clearCache(fileId?: string) {
    if (fileId) {
      this.chunkCache.delete(fileId);
    } else {
      this.chunkCache.clear();
    }
  }

  onUploadProgress(callback: (state: UploadState) => void) {
    this.onUploadProgressCallbacks.push(callback);
  }

  offUploadProgress(callback: (state: UploadState) => void) {
    const index = this.onUploadProgressCallbacks.indexOf(callback);
    if (index > -1) {
      this.onUploadProgressCallbacks.splice(index, 1);
    }
  }

  private notifyProgress(state: UploadState) {
    this.onUploadProgressCallbacks.forEach((cb) => cb({ ...state }));
  }

  private calculateMD5(buffer: ArrayBuffer): string {
    const spark = new SparkMD5.ArrayBuffer();
    spark.append(buffer);
    return spark.end();
  }
}

export const fileManager = new FileManager();
