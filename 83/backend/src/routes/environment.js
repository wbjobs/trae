const express = require('express');
const { runQuery, getQuery, allQuery } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/active', async (req, res, next) => {
  try {
    const config = await getQuery(
      'SELECT * FROM environment_configs WHERE is_active = 1 LIMIT 1'
    );

    if (!config) {
      return res.status(404).json({ error: '未找到激活的环境配置' });
    }

    res.json({
      id: config.id,
      envName: config.env_name,
      envType: config.env_type,
      baseUrl: config.base_url,
      cloudSyncEnabled: config.cloud_sync_enabled === 1,
      cloudSyncUrl: config.cloud_sync_url,
      offlineEnabled: config.offline_enabled === 1,
      maxOfflineDays: config.max_offline_days,
      sessionTimeout: config.session_timeout,
      loginFailLimit: config.login_fail_limit,
      securityLevel: config.security_level,
      auditEnabled: config.audit_enabled === 1,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/list', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const configs = await allQuery('SELECT * FROM environment_configs ORDER BY created_at DESC');
    res.json(configs);
  } catch (err) {
    next(err);
  }
});

router.post('/create', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const {
      envName,
      envType = 'intranet',
      baseUrl,
      cloudSyncUrl,
      cloudApiKey,
      cloudSyncEnabled = false,
      offlineEnabled = true,
      maxOfflineDays = 30,
      sessionTimeout = 3600,
      loginFailLimit = 5,
      securityLevel = 'high',
      auditEnabled = true,
    } = req.body;

    if (!envName) {
      return res.status(400).json({ error: '环境名称不能为空' });
    }

    const result = await runQuery(`
      INSERT INTO environment_configs 
      (env_name, env_type, base_url, cloud_sync_url, cloud_api_key, cloud_sync_enabled,
       offline_enabled, max_offline_days, session_timeout, login_fail_limit, 
       security_level, audit_enabled, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      envName,
      envType,
      baseUrl,
      cloudSyncUrl,
      cloudApiKey,
      cloudSyncEnabled ? 1 : 0,
      offlineEnabled ? 1 : 0,
      maxOfflineDays,
      sessionTimeout,
      loginFailLimit,
      securityLevel,
      auditEnabled ? 1 : 0,
    ]);

    res.json({ id: result.lastID, message: '环境配置创建成功' });
  } catch (err) {
    next(err);
  }
});

router.put('/update/:id', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      envName,
      envType,
      baseUrl,
      cloudSyncUrl,
      cloudApiKey,
      cloudSyncEnabled,
      offlineEnabled,
      maxOfflineDays,
      sessionTimeout,
      loginFailLimit,
      securityLevel,
      auditEnabled,
    } = req.body;

    const existing = await getQuery('SELECT * FROM environment_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: '环境配置不存在' });
    }

    const updateFields = [];
    const updateParams = [];

    if (envName !== undefined) {
      updateFields.push('env_name = ?');
      updateParams.push(envName);
    }
    if (envType !== undefined) {
      updateFields.push('env_type = ?');
      updateParams.push(envType);
    }
    if (baseUrl !== undefined) {
      updateFields.push('base_url = ?');
      updateParams.push(baseUrl);
    }
    if (cloudSyncUrl !== undefined) {
      updateFields.push('cloud_sync_url = ?');
      updateParams.push(cloudSyncUrl);
    }
    if (cloudApiKey !== undefined) {
      updateFields.push('cloud_api_key = ?');
      updateParams.push(cloudApiKey);
    }
    if (cloudSyncEnabled !== undefined) {
      updateFields.push('cloud_sync_enabled = ?');
      updateParams.push(cloudSyncEnabled ? 1 : 0);
    }
    if (offlineEnabled !== undefined) {
      updateFields.push('offline_enabled = ?');
      updateParams.push(offlineEnabled ? 1 : 0);
    }
    if (maxOfflineDays !== undefined) {
      updateFields.push('max_offline_days = ?');
      updateParams.push(maxOfflineDays);
    }
    if (sessionTimeout !== undefined) {
      updateFields.push('session_timeout = ?');
      updateParams.push(sessionTimeout);
    }
    if (loginFailLimit !== undefined) {
      updateFields.push('login_fail_limit = ?');
      updateParams.push(loginFailLimit);
    }
    if (securityLevel !== undefined) {
      updateFields.push('security_level = ?');
      updateParams.push(securityLevel);
    }
    if (auditEnabled !== undefined) {
      updateFields.push('audit_enabled = ?');
      updateParams.push(auditEnabled ? 1 : 0);
    }

    updateFields.push('updated_at = ?');
    updateParams.push(new Date().toISOString());
    updateParams.push(id);

    await runQuery(`
      UPDATE environment_configs 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `, updateParams);

    res.json({ message: '环境配置更新成功' });
  } catch (err) {
    next(err);
  }
});

router.post('/activate/:id', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const config = await getQuery('SELECT * FROM environment_configs WHERE id = ?', [id]);
    if (!config) {
      return res.status(404).json({ error: '环境配置不存在' });
    }

    await runQuery('UPDATE environment_configs SET is_active = 0 WHERE is_active = 1');
    await runQuery('UPDATE environment_configs SET is_active = 1 WHERE id = ?', [id]);

    res.json({ 
      message: `已激活环境: ${config.env_name}`,
      activeEnv: {
        id: config.id,
        name: config.env_name,
        type: config.env_type,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/delete/:id', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const config = await getQuery('SELECT * FROM environment_configs WHERE id = ?', [id]);
    if (!config) {
      return res.status(404).json({ error: '环境配置不存在' });
    }

    if (config.is_active === 1) {
      return res.status(400).json({ error: '无法删除当前激活的环境配置' });
    }

    await runQuery('DELETE FROM environment_configs WHERE id = ?', [id]);
    res.json({ message: '环境配置删除成功' });
  } catch (err) {
    next(err);
  }
});

router.get('/client-config', authenticateToken, async (req, res, next) => {
  try {
    const config = await getQuery(
      'SELECT * FROM environment_configs WHERE is_active = 1 LIMIT 1'
    );

    if (!config) {
      return res.status(404).json({ error: '未找到激活的环境配置' });
    }

    res.json({
      envType: config.env_type,
      cloudSyncEnabled: config.cloud_sync_enabled === 1,
      offlineEnabled: config.offline_enabled === 1,
      maxOfflineDays: config.max_offline_days,
      sessionTimeout: config.session_timeout,
      securityLevel: config.security_level,
      features: {
        watermark: true,
        trace: true,
        borrow: true,
        sync: config.cloud_sync_enabled === 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
