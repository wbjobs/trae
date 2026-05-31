import express from 'express';
import { store } from '../model/store';

export async function listProtocols(req: express.Request, res: express.Response) {
  const list = store.getProtocols();
  res.json({ list, total: list.length });
}

export async function getProtocol(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const protocol = store.getProtocol(id);
  if (!protocol) {
    return res.status(404).json({ message: 'Protocol not found' });
  }
  res.json(protocol);
}

export async function createProtocol(req: express.Request, res: express.Response) {
  const data = req.body;
  const protocol = store.addProtocol(data);
  res.status(201).json(protocol);
}

export async function updateProtocol(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const data = req.body;
  const protocol = store.updateProtocol(id, data);
  if (!protocol) {
    return res.status(404).json({ message: 'Protocol not found' });
  }
  res.json(protocol);
}

export async function deleteProtocol(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const success = store.deleteProtocol(id);
  if (!success) {
    return res.status(404).json({ message: 'Protocol not found' });
  }
  res.json({ message: 'Deleted successfully' });
}
