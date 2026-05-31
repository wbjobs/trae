import { Request, Response } from 'express';
import { debugLogsDB } from '../database';
import { DebugLog } from '../types/debug';
import { v4 as uuidv4 } from 'uuid';

export const getDebugLogs = (req: Request, res: Response) => {
  const { formId, ruleId, limit = 50 } = req.query;
  
  const query: Record<string, unknown> = {};
  if (formId) query.formId = formId;
  if (ruleId) query.ruleId = ruleId;

  debugLogsDB
    .find(query)
    .sort({ timestamp: -1 })
    .limit(Number(limit))
    .exec((err, logs) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(logs);
    });
};

export const getDebugLog = (req: Request, res: Response) => {
  const { id } = req.params;
  
  debugLogsDB.findOne({ id }, (err, log) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!log) {
      return res.status(404).json({ error: 'Debug log not found' });
    }
    res.json(log);
  });
};

export const clearDebugLogs = (req: Request, res: Response) => {
  const { formId } = req.query;
  
  const query: Record<string, unknown> = formId ? { formId } : {};
  
  debugLogsDB.remove(query, { multi: true }, (err, numRemoved) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: `${numRemoved} logs deleted successfully` });
  });
};

export const createDebugLog = (log: Omit<DebugLog, 'id' | 'timestamp'>): Promise<void> => {
  return new Promise((resolve, reject) => {
    const debugLog: DebugLog = {
      ...log,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    
    debugLogsDB.insert(debugLog, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

export default {
  getDebugLogs,
  getDebugLog,
  clearDebugLogs,
  createDebugLog,
};