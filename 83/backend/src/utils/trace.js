const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { runQuery, getQuery, allQuery, getDb } = require('../config/database');

const TRACE_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

const OPERATION_TYPES = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  VIEW: 'view',
  EDIT: 'edit',
  DELETE: 'delete',
  SHARE: 'share',
  PERMISSION_CHANGE: 'permission_change',
  WATERMARK_APPLY: 'watermark_apply',
  OFFLINE_ACCESS: 'offline_access',
  SYNC: 'sync',
  INTEGRITY_CHECK: 'integrity_check',
};

const MAX_RETRIES = 3;
const LOG_QUEUE_DIR = path.join(__dirname, '../../logs/queue');
const BATCH_INSERT_SIZE = 50;

let logQueue = [];
let isProcessingQueue = false;

fs.ensureDirSync(LOG_QUEUE_DIR);

const saveLogToQueue = async (logData) => {
  const queueFile = path.join(LOG_QUEUE_DIR, `log_${Date.now()}_${crypto.randomUUID()}.json`);
  await fs.writeJson(queueFile, logData);
};

const processLogQueue = async () => {
  if (isProcessingQueue) return;
  
  isProcessingQueue = true;
  
  try {
    const files = await fs.readdir(LOG_QUEUE_DIR);
    const pendingLogs = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(LOG_QUEUE_DIR, file);
        const logData = await fs.readJson(filePath);
        pendingLogs.push({ filePath, logData });
      } catch (err) {
        console.error('Failed to read queued log:', err);
      }
    }
    
    for (let i = 0; i < pendingLogs.length; i += BATCH_INSERT_SIZE) {
      const batch = pendingLogs.slice(i, i + BATCH_INSERT_SIZE);
      const values = [];
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      
      batch.forEach(({ logData }) => {
        values.push(
          logData.userId,
          logData.username,
          logData.operationType,
          logData.documentId,
          logData.documentTitle,
          logData.ipAddress,
          logData.userAgent,
          JSON.stringify(logData.details),
          logData.isOffline ? 1 : 0,
          logData.isOffline ? 0 : 1
        );
      });
      
      try {
        await runQuery(`
          INSERT INTO operation_logs 
          (user_id, username, operation_type, document_id, document_title, 
           ip_address, user_agent, details, is_offline, sync_status)
          VALUES ${placeholders}
        `, values);
        
        for (const { filePath } of batch) {
          await fs.remove(filePath);
        }
      } catch (err) {
        console.error('Batch insert logs failed:', err);
      }
    }
  } catch (err) {
    console.error('Process log queue failed:', err);
  } finally {
    isProcessingQueue = false;
  }
};

const logOperation = async (options) => {
  const {
    userId,
    username,
    operationType,
    documentId = null,
    documentTitle = null,
    ipAddress = null,
    userAgent = null,
    details = {},
    isOffline = false,
  } = options;

  const logId = crypto.randomUUID();
  const logData = {
    userId,
    username,
    operationType,
    documentId,
    documentTitle,
    ipAddress,
    userAgent,
    details,
    isOffline,
    logId,
    timestamp: new Date().toISOString(),
  };

  let lastError = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await runQuery(`
        INSERT INTO operation_logs 
        (user_id, username, operation_type, document_id, document_title, 
         ip_address, user_agent, details, is_offline, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        username,
        operationType,
        documentId,
        documentTitle,
        ipAddress,
        userAgent,
        JSON.stringify(details),
        isOffline ? 1 : 0,
        isOffline ? 0 : 1,
      ]);

      return logData;
    } catch (err) {
      lastError = err;
      console.error(`Log operation attempt ${attempt + 1} failed:`, err.message);
      
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  try {
    await saveLogToQueue(logData);
    setImmediate(processLogQueue);
  } catch (queueErr) {
    console.error('Failed to save log to queue:', queueErr);
    throw lastError;
  }

  return logData;
};

const batchLogOperations = async (logs) => {
  if (!logs || logs.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (let i = 0; i < logs.length; i += BATCH_INSERT_SIZE) {
    const batch = logs.slice(i, i + BATCH_INSERT_SIZE);
    const values = [];
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    
    batch.forEach(log => {
      values.push(
        log.userId,
        log.username,
        log.operationType,
        log.documentId || null,
        log.documentTitle || null,
        log.ipAddress || null,
        log.userAgent || null,
        JSON.stringify(log.details || {}),
        log.isOffline ? 1 : 0,
        log.isOffline ? 0 : 1,
        log.timestamp || new Date().toISOString()
      );
    });

    try {
      await runQuery(`
        INSERT INTO operation_logs 
        (user_id, username, operation_type, document_id, document_title, 
         ip_address, user_agent, details, is_offline, sync_status, created_at)
        VALUES ${placeholders}
      `, values);
      success += batch.length;
    } catch (err) {
      console.error('Batch log insert failed:', err.message);
      
      for (const log of batch) {
        try {
          await saveLogToQueue(log);
          success++;
        } catch (queueErr) {
          failed++;
        }
      }
    }
  }

  if (failed === 0) {
    setImmediate(processLogQueue);
  }

  return { success, failed };
};

const getOperationLogs = async (filters = {}, options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    sortBy = 'created_at',
    sortOrder = 'DESC',
  } = options;

  const whereClauses = [];
  const params = [];

  if (filters.userId) {
    whereClauses.push('user_id = ?');
    params.push(filters.userId);
  }
  if (filters.operationType) {
    whereClauses.push('operation_type = ?');
    params.push(filters.operationType);
  }
  if (filters.documentId) {
    whereClauses.push('document_id = ?');
    params.push(filters.documentId);
  }
  if (filters.startDate) {
    whereClauses.push('created_at >= ?');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    whereClauses.push('created_at <= ?');
    params.push(filters.endDate);
  }
  if (filters.isOffline !== undefined) {
    whereClauses.push('is_offline = ?');
    params.push(filters.isOffline ? 1 : 0);
  }

  const whereSql = whereClauses.length > 0 
    ? `WHERE ${whereClauses.join(' AND ')}` 
    : '';

  const countResult = await getQuery(
    `SELECT COUNT(*) as total FROM operation_logs ${whereSql}`,
    params
  );

  const offset = (page - 1) * pageSize;
  const logs = await allQuery(`
    SELECT * FROM operation_logs ${whereSql}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `, [...params, pageSize, offset]);

  const formattedLogs = logs.map(log => ({
    ...log,
    details: log.details ? JSON.parse(log.details) : null,
    is_offline: log.is_offline === 1,
    sync_status: log.sync_status === 1,
  }));

  return {
    total: countResult.total,
    page,
    pageSize,
    totalPages: Math.ceil(countResult.total / pageSize),
    logs: formattedLogs,
  };
};

const traceDocumentAccess = async (documentId, traceLevel = TRACE_LEVELS.MEDIUM) => {
  const document = await getQuery(
    'SELECT * FROM documents WHERE id = ?',
    [documentId]
  );

  if (!document) {
    throw new Error('文档不存在');
  }

  const accessLogs = await allQuery(`
    SELECT * FROM operation_logs 
    WHERE document_id = ? AND operation_type IN (?, ?, ?, ?)
    ORDER BY created_at DESC
  `, [documentId, OPERATION_TYPES.VIEW, OPERATION_TYPES.DOWNLOAD, OPERATION_TYPES.EDIT, OPERATION_TYPES.SHARE]);

  const permissionLogs = await allQuery(`
    SELECT * FROM operation_logs 
    WHERE document_id = ? AND operation_type = ?
    ORDER BY created_at DESC
  `, [documentId, OPERATION_TYPES.PERMISSION_CHANGE]);

  const traceData = {
    document: {
      id: document.id,
      uuid: document.doc_uuid,
      title: document.title,
      fingerprint: document.fingerprint,
      uploadedBy: document.uploader_name,
      uploadedAt: document.created_at,
    },
    accessHistory: accessLogs.map(log => ({
      user: log.username,
      operation: log.operation_type,
      timestamp: log.created_at,
      ip: log.ip_address,
      details: log.details ? JSON.parse(log.details) : null,
    })),
    permissionHistory: permissionLogs.map(log => ({
      user: log.username,
      timestamp: log.created_at,
      details: log.details ? JSON.parse(log.details) : null,
    })),
    traceLevel,
    generatedAt: new Date().toISOString(),
  };

  if (traceLevel === TRACE_LEVELS.HIGH || traceLevel === TRACE_LEVELS.CRITICAL) {
    const allLogs = await allQuery(`
      SELECT * FROM operation_logs 
      WHERE document_id = ?
      ORDER BY created_at DESC
    `, [documentId]);
    
    traceData.allOperations = allLogs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    }));
  }

  return traceData;
};

const generateTraceReport = async (criteria = {}) => {
  const {
    startDate,
    endDate,
    userId,
    documentId,
    operationType,
  } = criteria;

  const whereClauses = [];
  const params = [];

  if (startDate) {
    whereClauses.push('created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    whereClauses.push('created_at <= ?');
    params.push(endDate);
  }
  if (userId) {
    whereClauses.push('user_id = ?');
    params.push(userId);
  }
  if (documentId) {
    whereClauses.push('document_id = ?');
    params.push(documentId);
  }
  if (operationType) {
    whereClauses.push('operation_type = ?');
    params.push(operationType);
  }

  const whereSql = whereClauses.length > 0 
    ? `WHERE ${whereClauses.join(' AND ')}` 
    : '';

  const logs = await allQuery(`
    SELECT * FROM operation_logs ${whereSql}
    ORDER BY created_at DESC
  `, params);

  const stats = {
    totalOperations: logs.length,
    byType: {},
    byUser: {},
    byDate: {},
  };

  logs.forEach(log => {
    stats.byType[log.operation_type] = (stats.byType[log.operation_type] || 0) + 1;
    stats.byUser[log.username] = (stats.byUser[log.username] || 0) + 1;
    
    const date = log.created_at.split(' ')[0];
    stats.byDate[date] = (stats.byDate[date] || 0) + 1;
  });

  return {
    reportId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    criteria,
    statistics: stats,
    logs: logs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    })),
  };
};

const checkSuspiciousActivity = async (userId, timeWindowHours = 24) => {
  const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();
  
  const logs = await allQuery(`
    SELECT * FROM operation_logs 
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at DESC
  `, [userId, since]);

  const suspiciousActivities = [];
  
  const downloads = logs.filter(l => l.operation_type === OPERATION_TYPES.DOWNLOAD).length;
  if (downloads > 10) {
    suspiciousActivities.push({
      type: 'excessive_downloads',
      severity: 'warning',
      message: `在${timeWindowHours}小时内下载了${downloads}个文档，超过正常阈值`,
    });
  }

  const views = logs.filter(l => l.operation_type === OPERATION_TYPES.VIEW).length;
  if (views > 50) {
    suspiciousActivities.push({
      type: 'excessive_views',
      severity: 'info',
      message: `在${timeWindowHours}小时内查看了${views}个文档`,
    });
  }

  const offlineAccess = logs.filter(l => l.is_offline === 1).length;
  if (offlineAccess > 0) {
    suspiciousActivities.push({
      type: 'offline_access',
      severity: 'info',
      message: `检测到${offlineAccess}次离线访问`,
    });
  }

  return {
    userId,
    timeWindowHours,
    totalOperations: logs.length,
    suspiciousActivities,
    checkedAt: new Date().toISOString(),
  };
};

module.exports = {
  TRACE_LEVELS,
  OPERATION_TYPES,
  logOperation,
  batchLogOperations,
  processLogQueue,
  getOperationLogs,
  traceDocumentAccess,
  generateTraceReport,
  checkSuspiciousActivity,
};
