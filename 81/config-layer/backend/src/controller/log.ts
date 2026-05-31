import express from 'express';
import { store } from '../model/store';

export async function getParseLogs(req: express.Request, res: express.Response) {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const protocol = req.query.protocol as string;
  const result = store.getParseLogs(page, pageSize, protocol);
  res.json(result);
}

export async function getForwardLogs(req: express.Request, res: express.Response) {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const result = store.getForwardLogs(page, pageSize);
  res.json(result);
}
