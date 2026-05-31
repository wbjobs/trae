const express = require('express');
const axios = require('axios');
const { runQuery, getQuery, allQuery } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logOperation, OPERATION_TYPES } = require('../utils/trace');

const router = express.Router();

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;
const BATCH_SIZE = 100;

const getCloudConfig = () => ({
  baseUrl: process.env.CLOUD_SYNC_URL || 'https://cloud-api.example.com',
  apiKey: process.env.CLOUD_API_KEY || '',
  enabled: process.env.CLOUD_SYNC_ENABLED === 'true',
});

const axiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

const requestWithRetry = async (config, retries = MAX_RETRIES) => {
  let lastError = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axiosInstance(config);
      return response;
    } catch (err) {
      lastError = err;
      
      if (err.response && err.response.status < 500) {
        throw err;
      }
      
      if (i < retries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

const checkCloudConnection = async () => {
  const config = getCloudConfig();
  if (!config.enabled) {
    return { connected: false, reason: '云端同步未启用' };
  }

  try {
    const response = await requestWithRetry({
      method: 'get',
      url: `${config.baseUrl}/health`,
      timeout: 5000,
      headers: { 'X-API-Key': config.apiKey },
    });
    return { connected: true, status: response.data };
  } catch (err) {
    return { 
      connected: false, 
      reason: err.message,
      status: err.response?.status
    };
  }
};

router.get('/status', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const cloudStatus = await checkCloudConnection();
    
    const pendingSync = await getQuery(`
      SELECT COUNT(*) as count FROM sync_records WHERE status = 'pending'
    `);
    
    const failedSync = await getQuery(`
      SELECT COUNT(*) as count FROM sync_records WHERE status = 'failed'
    `);

    const offlineLogs = await getQuery(`
      SELECT COUNT(*) as count FROM operation_logs WHERE sync_status = 0
    `);

    res.json({
      mode: process.env.MODE || 'INTRANET',
      cloudSync: {
        enabled: getCloudConfig().enabled,
        connected: cloudStatus.connected,
        message: cloudStatus.reason,
      },
      statistics: {
        pendingSync: pendingSync.count,
        failedSync: failedSync.count,
        offlineLogs: offlineLogs.count,
      },
      lastSync: null,
    });
  } catch (err) {
    next(err);
  }
});

const syncBatch = async (url, data, config, batchSize = BATCH_SIZE) => {
  const total = data.length;
  let synced = 0;
  let failed = 0;
  
  for (let i = 0; i < total; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    try {
      await requestWithRetry({
        method: 'post',
        url,
        data: { items: batch, batchIndex: Math.floor(i / batchSize), totalBatches: Math.ceil(total / batchSize) },
        headers: { 'X-API-Key': config.apiKey },
      });
      synced += batch.length;
    } catch (err) {
      failed += batch.length;
      console.error(`Batch sync failed for ${url}:`, err.message);
      return { success: false, synced, failed, error: err.message };
    }
  }
  
  return { success: true, synced, failed };
};

router.post('/push', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { type = 'all' } = req.body;
    const config = getCloudConfig();

    if (!config.enabled) {
      return res.status(400).json({ error: '云端同步未启用' });
    }

    const cloudStatus = await checkCloudConnection();
    if (!cloudStatus.connected) {
      return res.status(503).json({ 
        error: '无法连接到云端服务器', 
        reason: cloudStatus.reason,
        status: cloudStatus.status
      });
    }

    const syncResults = [];

    if (type === 'all' || type === 'users') {
      const users = await allQuery('SELECT * FROM users');
      try {
        const result = await syncBatch(`${config.baseUrl}/sync/users`, users, config);
        syncResults.push({ 
          type: 'users', 
          count: users.length, 
          synced: result.synced,
          failed: result.failed,
          status: result.success ? 'success' : 'partial' 
        });
      } catch (err) {
        syncResults.push({ type: 'users', error: err.message, status: 'failed' });
      }
    }

    if (type === 'all' || type === 'documents') {
      const documents = await allQuery('SELECT * FROM documents WHERE status = 1');
      try {
        const result = await syncBatch(`${config.baseUrl}/sync/documents`, documents, config);
        syncResults.push({ 
          type: 'documents', 
          count: documents.length, 
          synced: result.synced,
          failed: result.failed,
          status: result.success ? 'success' : 'partial' 
        });
      } catch (err) {
        syncResults.push({ type: 'documents', error: err.message, status: 'failed' });
      }
    }

    if (type === 'all' || type === 'logs') {
      const logs = await allQuery('SELECT * FROM operation_logs WHERE sync_status = 0');
      try {
        const result = await syncBatch(`${config.baseUrl}/sync/logs`, logs, config);
        if (result.success) {
          await runQuery('UPDATE operation_logs SET sync_status = 1 WHERE sync_status = 0');
        }
        syncResults.push({ 
          type: 'logs', 
          count: logs.length, 
          synced: result.synced,
          failed: result.failed,
          status: result.success ? 'success' : 'partial' 
        });
      } catch (err) {
        syncResults.push({ type: 'logs', error: err.message, status: 'failed' });
      }
    }

    if (type === 'all' || type === 'permissions') {
      const permissions = await allQuery('SELECT * FROM document_permissions');
      try {
        const result = await syncBatch(`${config.baseUrl}/sync/permissions`, permissions, config);
        syncResults.push({ 
          type: 'permissions', 
          count: permissions.length, 
          synced: result.synced,
          failed: result.failed,
          status: result.success ? 'success' : 'partial' 
        });
      } catch (err) {
        syncResults.push({ type: 'permissions', error: err.message, status: 'failed' });
      }
    }

    const hasErrors = syncResults.some(r => r.status === 'failed');
    const hasPartial = syncResults.some(r => r.status === 'partial');
    
    res.status(hasErrors ? 500 : hasPartial ? 206 : 200).json({
      message: hasErrors ? '部分同步任务失败' : hasPartial ? '同步部分完成' : '同步任务已执行',
      results: syncResults,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/pull', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { type = 'all' } = req.body;
    const config = getCloudConfig();

    if (!config.enabled) {
      return res.status(400).json({ error: '云端同步未启用' });
    }

    const cloudStatus = await checkCloudConnection();
    if (!cloudStatus.connected) {
      return res.status(503).json({ 
        error: '无法连接到云端服务器',
        reason: cloudStatus.reason,
        status: cloudStatus.status
      });
    }

    const pullResults = [];

    if (type === 'all' || type === 'permissions') {
      try {
        const response = await requestWithRetry({
          method: 'get',
          url: `${config.baseUrl}/sync/permissions`,
          headers: { 'X-API-Key': config.apiKey },
        });
        
        const cloudPermissions = response.data.permissions || response.data.items || [];
        let updated = 0;
        let failed = 0;

        for (const perm of cloudPermissions) {
          try {
            const existing = await getQuery(
              'SELECT id FROM document_permissions WHERE document_id = ? AND COALESCE(user_id, -1) = COALESCE(?, -1) AND COALESCE(department, "") = COALESCE(?, "") AND COALESCE(role, "") = COALESCE(?, "")',
              [perm.document_id, perm.user_id, perm.department || '', perm.role || '']
            );

            if (!existing) {
              await runQuery(`
                INSERT INTO document_permissions 
                (document_id, user_id, department, role, permission_type, granted_by, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [perm.document_id, perm.user_id, perm.department, perm.role, perm.permission_type, perm.granted_by, perm.expires_at]);
              updated++;
            }
          } catch (err) {
            failed++;
            console.error('Pull permission failed:', err.message);
          }
        }

        pullResults.push({ 
          type: 'permissions', 
          synced: updated, 
          failed,
          status: failed === 0 ? 'success' : 'partial' 
        });
      } catch (err) {
        pullResults.push({ type: 'permissions', error: err.message, status: 'failed' });
      }
    }

    if (type === 'all' || type === 'users') {
      try {
        const response = await requestWithRetry({
          method: 'get',
          url: `${config.baseUrl}/sync/users`,
          headers: { 'X-API-Key': config.apiKey },
        });
        
        const cloudUsers = response.data.users || response.data.items || [];
        let updated = 0;
        let failed = 0;

        for (const user of cloudUsers) {
          try {
            const existing = await getQuery('SELECT id FROM users WHERE username = ?', [user.username]);
            if (!existing) {
              await runQuery(`
                INSERT INTO users (username, password, real_name, role, department, permissions, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [user.username, user.password, user.real_name, user.role, user.department, user.permissions, user.status]);
              updated++;
            }
          } catch (err) {
            failed++;
            console.error('Pull user failed:', err.message);
          }
        }

        pullResults.push({ 
          type: 'users', 
          synced: updated, 
          failed,
          status: failed === 0 ? 'success' : 'partial' 
        });
      } catch (err) {
        pullResults.push({ type: 'users', error: err.message, status: 'failed' });
      }
    }

    const hasErrors = pullResults.some(r => r.status === 'failed');
    const hasPartial = pullResults.some(r => r.status === 'partial');
    
    res.status(hasErrors ? 500 : hasPartial ? 206 : 200).json({
      message: hasErrors ? '部分拉取任务失败' : hasPartial ? '拉取部分完成' : '从云端拉取数据完成',
      results: pullResults,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/offline-logs', authenticateToken, async (req, res, next) => {
  try {
    const { logs } = req.body;

    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ error: '日志数据格式错误' });
    }

    const formattedLogs = logs.map(log => ({
      userId: log.userId || req.user.id,
      username: log.username || req.user.username,
      operationType: log.operationType,
      documentId: log.documentId || null,
      documentTitle: log.documentTitle || null,
      ipAddress: log.ipAddress || '127.0.0.1',
      userAgent: log.userAgent || null,
      details: log.details || {},
      isOffline: true,
      timestamp: log.timestamp || new Date().toISOString(),
    }));

    const { batchLogOperations } = require('../utils/trace');
    const result = await batchLogOperations(formattedLogs);

    res.json({
      message: `成功导入${result.success}条离线操作日志` + (result.failed > 0 ? `，${result.failed}条失败` : ''),
      success: result.success,
      failed: result.failed,
      total: logs.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/records', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status } = req.query;
    const offset = (page - 1) * pageSize;

    let whereSql = '';
    let params = [];

    if (status) {
      whereSql = 'WHERE status = ?';
      params.push(status);
    }

    const countResult = await getQuery(
      `SELECT COUNT(*) as total FROM sync_records ${whereSql}`,
      params
    );

    const records = await allQuery(`
      SELECT * FROM sync_records ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({
      total: countResult.total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(countResult.total / pageSize),
      records,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
