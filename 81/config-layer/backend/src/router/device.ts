import express from 'express';
import { listDevices, getDevice, createDevice, updateDevice, deleteDevice, sendCommand } from '../controller/device';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

router.get('/', requirePermission('device:read'), listDevices);
router.get('/:id', requirePermission('device:read'), getDevice);
router.post('/', requirePermission('config:write'), createDevice);
router.put('/:id', requirePermission('config:write'), updateDevice);
router.delete('/:id', requirePermission('config:write'), deleteDevice);
router.post('/:id/command', requirePermission('device:control'), sendCommand);

export default router;
