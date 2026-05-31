import express from 'express';
import { longPollingService } from '../../../../forward-layer/long-polling/src';
import { deviceManager } from '../../../../forward-layer/device-manager/src';

export async function handlePoll(req: express.Request, res: express.Response) {
  const { deviceId } = req.params;
  const { lastMessageId, timeout } = req.query;

  const timeoutMs = timeout ? Math.min(parseInt(timeout as string), 25000) : 25000;
  
  res.setTimeout(timeoutMs + 5000, () => {
    if (!res.headersSent) {
      res.status(200).json({ messages: [] });
    }
  });

  req.on('close', () => {
    if (!res.headersSent) {
      res.end();
    }
  });

  try {
    const messages = await longPollingService.handlePoll(
      deviceId, 
      lastMessageId as string, 
      timeoutMs
    );
    if (!res.headersSent) {
      res.json({ messages });
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Polling error' });
    }
  }
}

export async function sendCommand(req: express.Request, res: express.Response) {
  const { deviceId } = req.params;
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ message: 'Command is required' });
  }

  const msg = longPollingService.sendToDevice(deviceId, command);
  res.json(msg);
}

export async function broadcastCommand(req: express.Request, res: express.Response) {
  const { command, groupId } = req.body;

  if (!command) {
    return res.status(400).json({ message: 'Command is required' });
  }

  let filter: ((deviceId: string) => boolean) | undefined;
  if (groupId) {
    const groupDevices = deviceManager.getGroupDevices(groupId);
    const deviceIds = new Set(groupDevices.map(d => d.id));
    filter = (id) => deviceIds.has(id);
  }

  const messages = longPollingService.broadcast(command, filter);
  res.json({ count: messages.length, messages });
}

export async function getConnectedDevices(req: express.Request, res: express.Response) {
  const devices = longPollingService.getConnectedDevices();
  res.json({ devices });
}

export async function getDeviceStatus(req: express.Request, res: express.Response) {
  const { deviceId } = req.params;
  const status = longPollingService.getDeviceStatus(deviceId);
  if (!status) {
    return res.status(404).json({ message: 'Device not connected' });
  }
  res.json(status);
}

export async function ackCommand(req: express.Request, res: express.Response) {
  const { commandId, deviceId } = req.body;
  const success = longPollingService.acknowledgeCommand(commandId, deviceId);
  res.json({ success });
}
