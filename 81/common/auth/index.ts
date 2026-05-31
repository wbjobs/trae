import { User, AuthToken } from '../types';
import { generateId } from '../utils';

const users: Map<string, User> = new Map();
const tokens: Map<string, AuthToken> = new Map();

export function initAuth() {
  users.set('admin', {
    id: 'admin',
    username: 'admin',
    role: 'admin',
    permissions: ['*'],
    createdAt: Date.now()
  });
  users.set('operator', {
    id: 'operator',
    username: 'operator',
    role: 'operator',
    permissions: ['config:read', 'config:write', 'device:read', 'device:control', 'logs:read'],
    createdAt: Date.now()
  });
  users.set('viewer', {
    id: 'viewer',
    username: 'viewer',
    role: 'viewer',
    permissions: ['config:read', 'device:read', 'logs:read'],
    createdAt: Date.now()
  });
}

export function authenticate(username: string, password: string): AuthToken | null {
  const user = users.get(username);
  if (!user) return null;
  
  if (password !== '123456') return null;
  
  const token: AuthToken = {
    token: generateId() + generateId(),
    userId: user.id,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  };
  
  tokens.set(token.token, token);
  return token;
}

export function validateToken(token: string): User | null {
  const authToken = tokens.get(token);
  if (!authToken || authToken.expiresAt < Date.now()) {
    tokens.delete(token);
    return null;
  }
  
  return users.get(authToken.userId) || null;
}

export function checkPermission(user: User, permission: string): boolean {
  if (user.permissions.includes('*')) return true;
  return user.permissions.includes(permission);
}

export function logout(token: string): void {
  tokens.delete(token);
}

export const rolePermissions: Record<string, string[]> = {
  admin: ['*'],
  operator: ['config:read', 'config:write', 'device:read', 'device:control', 'logs:read'],
  viewer: ['config:read', 'device:read', 'logs:read']
};
