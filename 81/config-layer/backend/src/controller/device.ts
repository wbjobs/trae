import express from 'express';
import { store } from '../model/store';

export async function listDevices(req: express.Request, res: express.Response) {
  const list = store.getDevices();
  res.json({ list, total: list.length });
}

export async function getDevice(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const device = store.getDevice(id);
  if (!device) {
    return res.status(404).json({ message: 'Device not found' });
  }
  res.json(device);
}

export async function createDevice(req: express.Request, res: express.Response) {
  const data = req.body;
  data.status = data.status || 'offline';
  const device = store.addDevice(data);
  res.status(201).json(device);
}

export async function updateDevice(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const data = req.body;
  const device = store.updateDevice(id, data);
  if (!device) {
    return res.status(404).json({ message: 'Device not found' });
  }
  res.json(device);
}

export async function deleteDevice(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const success = store.deleteDevice(id);
  if (!success) {
    return res.status(404).json({ message: 'Device not found' });
  }
  res.json({ message: 'Deleted successfully' });
}

export async function sendCommand(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const { command } = req.body;
  const device = store.getDevice(id);
  if (!device) {
    return res.status(404).json({ message: 'Device not found' });
  }
  console.log(`[Command] Sending to device ${id}: ${command}`);
  store.updateDevice(id, { lastHeartbeat: Date.now() });
  res.json({ message: 'Command sent successfully' });
}
