import request from '@/utils/request';
import { AuthResponse } from '@/types';

export interface RegisterData {
  tenantName: string;
  tenantSlug: string;
  userName: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export const authApi = {
  register(data: RegisterData): Promise<AuthResponse> {
    return request.post('/auth/register', data);
  },

  login(data: LoginData): Promise<AuthResponse> {
    return request.post('/auth/login', data);
  },

  getCurrentUser() {
    return request.get('/auth/me');
  },
};
