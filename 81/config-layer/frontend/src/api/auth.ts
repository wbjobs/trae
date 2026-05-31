import request from './request';

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    permissions: string[];
  };
}

export function loginApi(username: string, password: string): Promise<LoginResponse> {
  return request.post('/auth/login', { username, password });
}

export function logoutApi(): Promise<void> {
  return request.post('/auth/logout');
}
