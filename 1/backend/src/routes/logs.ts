import { Router } from 'express';
import { db } from '../database';
import { LogEntry } from '../types';
import { apiKeyAuth } from '../middleware/auth';

const router = Router();

function serializeLog(log: any): LogEntry {
  return {
    id: log.id,
    ruleId: log.ruleId,
    ruleName: log.ruleName,
    requestUrl: log.requestUrl,
    requestMethod: log.requestMethod,
    actionType: log.actionType as 'forward' | 'mock' | 'none',
    status: log.status as 'success' | 'error',
    responseTime: log.responseTime,
    responseStatusCode: log.responseStatusCode,
    errorMessage: log.errorMessage,
    timestamp: log.timestamp,
  };
}

router.use(apiKeyAuth);

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
  const logs = db
    .prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?')
    .all(limit)
    .map(serializeLog);
  res.json(logs);
});

router.post('/', (req, res) => {
  const {
    ruleId,
    ruleName,
    requestUrl,
    requestMethod,
    actionType,
    status,
    responseTime,
    responseStatusCode,
    errorMessage,
    timestamp,
  } = req.body;

  const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logTimestamp = timestamp || new Date().toISOString();

  db.prepare(
    `INSERT INTO logs (id, ruleId, ruleName, requestUrl, requestMethod, actionType, status, responseTime, responseStatusCode, errorMessage, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ruleId,
    ruleName,
    requestUrl,
    requestMethod,
    actionType,
    status,
    responseTime,
    responseStatusCode,
    errorMessage,
    logTimestamp
  );

  const countStmt = db.prepare('SELECT COUNT(*) as count FROM logs');
  const { count } = countStmt.get() as { count: number };
  if (count > 1000) {
    db.exec('DELETE FROM logs WHERE id IN (SELECT id FROM logs ORDER BY timestamp ASC LIMIT 100)');
  }

  const created = db.prepare('SELECT * FROM logs WHERE id = ?').get(id);
  res.status(201).json(serializeLog(created));
});

router.delete('/', (req, res) => {
  db.prepare('DELETE FROM logs').run();
  res.status(204).send();
});

export { router as logsRouter };
