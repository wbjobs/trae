import express from 'express';
import { store } from '../model/store';

export async function getStatistics(req: express.Request, res: express.Response) {
  const devices = store.getDevices();
  const protocols = store.getProtocols();
  const routes = store.getRoutes();
  const parseLogs = store.getParseLogs(1, 10000);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  
  const todayMessages = parseLogs.list.filter(l => l.timestamp >= todayStart).length;

  res.json({
    totalDevices: devices.length,
    onlineDevices: devices.filter(d => d.status === 'online').length,
    totalMessages: parseLogs.total,
    todayMessages,
    protocols: protocols.length,
    routes: routes.length
  });
}
