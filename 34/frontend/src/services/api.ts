import axios from 'axios';
import type {
  RegisterRequest,
  RegisterResponse,
  HeartbeatRequest,
  FileRegisterRequest,
  FileRegisterResponse,
  NodeQueryRequest,
  NodeQueryResponse,
  NodeInfo,
  FileInfo,
  TransferReport,
  ChokeStatus,
} from '../types';

const API_BASE_URL = 'http://localhost:3001/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const trackerApi = {
  async healthCheck(): Promise<string> {
    const response = await axios.get('http://localhost:3001/health');
    return response.data;
  },

  async registerNode(req: RegisterRequest): Promise<RegisterResponse> {
    const response = await api.post<RegisterResponse>('/nodes/register', req);
    return response.data;
  },

  async heartbeat(req: HeartbeatRequest): Promise<void> {
    await api.post('/nodes/heartbeat', req);
  },

  async listNodes(): Promise<NodeInfo[]> {
    const response = await api.get<NodeInfo[]>('/nodes');
    return response.data;
  },

  async queryNodes(req: NodeQueryRequest): Promise<NodeQueryResponse> {
    const response = await api.post<NodeQueryResponse>('/nodes/query', req);
    return response.data;
  },

  async registerFile(req: FileRegisterRequest): Promise<FileRegisterResponse> {
    const response = await api.post<FileRegisterResponse>('/files/register', req);
    return response.data;
  },

  async getFileInfo(fileId: string): Promise<FileInfo | null> {
    const response = await api.get<FileInfo | null>(`/files/${fileId}`);
    return response.data;
  },

  async listFiles(): Promise<FileInfo[]> {
    const response = await api.get<FileInfo[]>('/files');
    return response.data;
  },

  async reportTransfer(report: TransferReport): Promise<void> {
    await api.post('/transfers/report', report);
  },

  async getChokeStatus(nodeId: string): Promise<ChokeStatus | null> {
    try {
      const response = await api.get<ChokeStatus | null>(`/nodes/${nodeId}/choke-status`);
      return response.data;
    } catch {
      return null;
    }
  },
};
