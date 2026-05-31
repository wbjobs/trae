import express from 'express';
import { authenticate, logout as authLogout } from '../../../../common/auth';

export async function login(req: express.Request, res: express.Response) {
  const { username, password } = req.body;
  const token = authenticate(username, password);
  
  if (!token) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const user = {
    id: token.userId,
    username,
    role: username === 'admin' ? 'admin' : username === 'operator' ? 'operator' : 'viewer',
    permissions: username === 'admin' ? ['*'] : 
                 username === 'operator' ? ['config:read', 'config:write', 'device:read', 'device:control', 'logs:read'] :
                 ['config:read', 'device:read', 'logs:read']
  };

  res.json({
    token: token.token,
    user
  });
}

export async function logout(req: express.Request, res: express.Response) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    authLogout(authHeader.slice(7));
  }
  res.json({ message: 'Logged out successfully' });
}
