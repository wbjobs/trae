import express from 'express';
import { store } from '../model/store';

export async function listRoutes(req: express.Request, res: express.Response) {
  const list = store.getRoutes();
  res.json({ list, total: list.length });
}

export async function getRoute(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const route = store.getRoute(id);
  if (!route) {
    return res.status(404).json({ message: 'Route not found' });
  }
  res.json(route);
}

export async function createRoute(req: express.Request, res: express.Response) {
  const data = req.body;
  const route = store.addRoute(data);
  res.status(201).json(route);
}

export async function updateRoute(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const data = req.body;
  const route = store.updateRoute(id, data);
  if (!route) {
    return res.status(404).json({ message: 'Route not found' });
  }
  res.json(route);
}

export async function deleteRoute(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const success = store.deleteRoute(id);
  if (!success) {
    return res.status(404).json({ message: 'Route not found' });
  }
  res.json({ message: 'Deleted successfully' });
}
