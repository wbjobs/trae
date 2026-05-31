import request from '@/utils/request';
import { Tenant, User } from '@/types';

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: 'tenant_admin' | 'regular_user';
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  role?: 'tenant_admin' | 'regular_user';
  status?: 'active' | 'inactive';
}

export const tenantApi = {
  getTenantInfo(): Promise<Tenant> {
    return request.get('/tenant/info');
  },

  updateTenant(data: { name?: string; description?: string }): Promise<Tenant> {
    return request.put('/tenant/info', data);
  },

  getUsers(): Promise<User[]> {
    return request.get('/tenant/users');
  },

  getUser(id: string): Promise<User> {
    return request.get(`/tenant/users/${id}`);
  },

  createUser(data: CreateUserData): Promise<User> {
    return request.post('/tenant/users', data);
  },

  updateUser(id: string, data: UpdateUserData): Promise<User> {
    return request.put(`/tenant/users/${id}`, data);
  },

  deleteUser(id: string): Promise<void> {
    return request.delete(`/tenant/users/${id}`);
  },

  resetPassword(id: string, password: string): Promise<void> {
    return request.post(`/tenant/users/${id}/reset-password`, { password });
  },
};
