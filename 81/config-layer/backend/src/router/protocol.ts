import express from 'express';
import { listProtocols, getProtocol, createProtocol, updateProtocol, deleteProtocol } from '../controller/protocol';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

router.get('/', requirePermission('config:read'), listProtocols);
router.get('/:id', requirePermission('config:read'), getProtocol);
router.post('/', requirePermission('config:write'), createProtocol);
router.put('/:id', requirePermission('config:write'), updateProtocol);
router.delete('/:id', requirePermission('config:write'), deleteProtocol);

export default router;
