import { Request, Response, NextFunction } from 'express';
import { db } from '../database';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
}

export function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key is required' });
  }

  const storedKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('apiKey') as { value: string } | undefined;

  if (!storedKey || apiKey !== storedKey.value) {
    return res.status(403).json({ error: 'Invalid API Key' });
  }

  req.apiKey = apiKey;
  next();
}
