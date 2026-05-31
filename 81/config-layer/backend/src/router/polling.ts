import express from 'express';
import { handlePoll, sendCommand, broadcastCommand, getConnectedDevices, getDeviceStatus, ackCommand } from '../controller/polling';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

router.get('/:deviceId', handlePoll);
router.post('/:deviceId/send', requirePermission('device:control'), sendCommand);
router.post('/broadcast', requirePermission('device:control'), broadcastCommand);
router.get('/devices/connected', requirePermission('device:read'), getConnectedDevices);
router.get('/:deviceId/status', requirePermission('device:read'), getDeviceStatus);
router.post('/ack', ackCommand);

export default router;
