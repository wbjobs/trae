import express from 'express';
import { getDebugLogs, getDebugLog, clearDebugLogs } from '../controllers/debugController';

const router = express.Router();

router.get('/debug/logs', getDebugLogs);
router.get('/debug/logs/:id', getDebugLog);
router.delete('/debug/logs', clearDebugLogs);

export default router;