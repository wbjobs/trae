import express from 'express';
import { validateToken, checkPermission } from '../../../../common/auth';
import type { User } from '../../../../common/types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const user = validateToken(token);
  if (!user) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

export function requirePermission(permission: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!checkPermission(req.user, permission)) {
      return res.status(403).json({ message: 'Permission denied' });
    }
    next();
  };
}
