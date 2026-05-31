export const CHUNK_SIZE = 4 * 1024 * 1024;
export const MIN_CONTRIBUTION_RATIO = 0.3;

export interface GeoLocation {
  lat: number;
  lon: number;
  city?: string;
  country?: string;
}

export interface BandwidthInfo {
  upload_speed: number;
  download_speed: number;
  latency_ms: number;
}

export interface NodeInfo {
  id: string;
  address: string;
  public_ip?: string;
  location: GeoLocation;
  bandwidth: BandwidthInfo;
  last_seen: string;
  is_active: boolean;
  score: number;
  stats: NodeStats;
  is_choked: boolean;
  choked_until?: string;
}

export interface NodeStats {
  total_uploaded: number;
  total_downloaded: number;
  contribution_ratio: number;
  upload_count: number;
  download_count: number;
  joined_at: string;
}

export interface ChunkInfo {
  index: number;
  hash: string;
  size: number;
  holders: string[];
}

export interface FileInfo {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  total_chunks: number;
  chunks: ChunkInfo[];
  created_at: string;
}

export interface RegisterRequest {
  address: string;
  public_ip?: string;
  location: GeoLocation;
  bandwidth: BandwidthInfo;
}

export interface RegisterResponse {
  node_id: string;
}

export interface ChunkHeld {
  file_id: string;
  chunk_index: number;
}

export interface HeartbeatRequest {
  node_id: string;
  bandwidth: BandwidthInfo;
  held_chunks: ChunkHeld[];
}

export interface FileRegisterRequest {
  name: string;
  size: number;
  mime_type: string;
  total_chunks: number;
  chunks: ChunkInfo[];
}

export interface FileRegisterResponse {
  file_id: string;
}

export interface NodeQueryRequest {
  file_id: string;
  chunk_index: number;
  location?: GeoLocation;
  count?: number;
}

export interface NodeQueryResponse {
  nodes: NodeInfo[];
}

export interface TransferProgress {
  fileId: string;
  nodeId: string;
  chunkIndex: number;
  downloaded: number;
  total: number;
}

export interface UploadState {
  fileId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  completedChunks: Set<number>;
  status: 'idle' | 'hashing' | 'uploading' | 'distributing' | 'completed' | 'error';
  progress: number;
}

export type TransferDirection = 'Upload' | 'Download';

export interface TransferReport {
  node_id: string;
  peer_id: string;
  bytes_transferred: number;
  direction: TransferDirection;
  chunk_index: number;
  file_id: string;
}

export interface ChokeStatus {
  is_choked: boolean;
  choked_until?: string;
  contribution_ratio: number;
  download_speed_limit?: number;
}
