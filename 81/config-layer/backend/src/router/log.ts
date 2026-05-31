import express from 'express';
import { getParseLogs, getForwardLogs } from '../controller/log';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

router.get('/parse', requirePermission('logs:read'), getParseLogs);
router.get('/forward', requirePermission('logs:read'), getForwardLogs);

export default router;
