import client from './client';

export interface ShareLink {
  id: number;
  token: string;
  datasource_id: number;
  config: Record<string, any>;
  expires_at?: string;
  is_active: boolean;
  view_count: number;
  has_password: boolean;
  created_by: string;
  created_at: string;
  last_accessed_at?: string;
  share_url?: string;
}

export interface ShareLinkCreate {
  datasource_id: number;
  config: Record<string, any>;
  expires_at?: string;
  password?: string;
}

export interface ShareAccessRequest {
  token: string;
  password?: string;
}

export interface ShareAccessResponse {
  success: boolean;
  message?: string;
  datasource_id?: number;
  config?: Record<string, any>;
  require_password?: boolean;
}

export const shareApi = {
  create: (data: ShareLinkCreate) =>
    client.post<ShareLink>('/share', data),
  
  list: () => client.get<ShareLink[]>('/share'),
  
  getByToken: (token: string) =>
    client.get<ShareLink>(`/share/${token}`),
  
  access: (data: ShareAccessRequest) =>
    client.post<ShareAccessResponse>('/share/access', data),
  
  update: (id: number, data: { is_active?: boolean; expires_at?: string }) =>
    client.put<ShareLink>(`/share/${id}`, data),
  
  delete: (id: number) =>
    client.delete(`/share/${id}`),
};
