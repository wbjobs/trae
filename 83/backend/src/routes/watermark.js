const express = require('express');
const { runQuery, getQuery, allQuery } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logOperation, OPERATION_TYPES } = require('../utils/trace');
const { generateUserWatermark, generateInvisibleWatermark } = require('../utils/watermark');

const router = express.Router();

router.get('/configs', authenticateToken, async (req, res, next) => {
  try {
    const configs = await allQuery(`
      SELECT * FROM watermark_configs
      ORDER BY is_default DESC, created_at DESC
    `);

    res.json({ configs });
  } catch (err) {
    next(err);
  }
});

router.post('/configs', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, type, content, fontSize, opacity, angle, color, position, isDefault } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: '名称和类型不能为空' });
    }

    if (isDefault) {
      await runQuery('UPDATE watermark_configs SET is_default = 0 WHERE is_default = 1');
    }

    const result = await runQuery(`
      INSERT INTO watermark_configs 
      (name, type, content, font_size, opacity, angle, color, position, is_default, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      type,
      content || '',
      fontSize || 14,
      opacity || 0.3,
      angle || -30,
      color || '#000000',
      position || 'full',
      isDefault ? 1 : 0,
      req.user.id,
    ]);

    res.json({
      id: result.lastID,
      message: '水印配置创建成功',
    });
  } catch (err) {
    next(err);
  }
});

router.put('/configs/:id', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, content, fontSize, opacity, angle, color, position, isDefault } = req.body;

    if (isDefault) {
      await runQuery('UPDATE watermark_configs SET is_default = 0 WHERE is_default = 1 AND id != ?', [id]);
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (content !== undefined) { updates.push('content = ?'); params.push(content); }
    if (fontSize !== undefined) { updates.push('font_size = ?'); params.push(fontSize); }
    if (opacity !== undefined) { updates.push('opacity = ?'); params.push(opacity); }
    if (angle !== undefined) { updates.push('angle = ?'); params.push(angle); }
    if (color !== undefined) { updates.push('color = ?'); params.push(color); }
    if (position !== undefined) { updates.push('position = ?'); params.push(position); }
    if (isDefault !== undefined) { updates.push('is_default = ?'); params.push(isDefault ? 1 : 0); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await runQuery(
      `UPDATE watermark_configs SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ message: '水印配置更新成功' });
  } catch (err) {
    next(err);
  }
});

router.delete('/configs/:id', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const config = await getQuery('SELECT * FROM watermark_configs WHERE id = ?', [id]);
    if (!config) {
      return res.status(404).json({ error: '水印配置不存在' });
    }

    if (config.is_default === 1) {
      return res.status(400).json({ error: '不能删除默认水印配置' });
    }

    await runQuery('DELETE FROM watermark_configs WHERE id = ?', [id]);

    res.json({ message: '水印配置删除成功' });
  } catch (err) {
    next(err);
  }
});

router.get('/default', authenticateToken, async (req, res, next) => {
  try {
    const config = await getQuery('SELECT * FROM watermark_configs WHERE is_default = 1 LIMIT 1');

    if (!config) {
      const allConfigs = await allQuery('SELECT * FROM watermark_configs LIMIT 1');
      if (allConfigs.length > 0) {
        return res.json({ config: allConfigs[0] });
      }
      return res.json({ config: null });
    }

    res.json({ config });
  } catch (err) {
    next(err);
  }
});

router.post('/generate/:documentId', authenticateToken, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { configId } = req.body;

    const document = await getQuery('SELECT * FROM documents WHERE id = ?', [documentId]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    let config;
    if (configId) {
      config = await getQuery('SELECT * FROM watermark_configs WHERE id = ?', [configId]);
    } else {
      config = await getQuery('SELECT * FROM watermark_configs WHERE is_default = 1 LIMIT 1');
    }

    if (!config) {
      return res.status(404).json({ error: '未找到水印配置' });
    }

    const watermark = generateUserWatermark(req.user, document, {
      template: config.content,
      fontSize: config.font_size,
      opacity: config.opacity,
      angle: config.angle,
      color: config.color,
      position: config.position,
    });

    const invisibleWatermark = generateInvisibleWatermark({
      documentId: document.id,
      documentUuid: document.doc_uuid,
      userId: req.user.id,
      username: req.user.username,
      configId: config.id,
    });

    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.WATERMARK_APPLY,
      documentId: document.id,
      documentTitle: document.title,
      ipAddress: req.ip,
      details: {
        configId: config.id,
        configName: config.name,
        watermarkContent: watermark.content,
      },
      isOffline: req.user.isOffline,
    });

    res.json({
      visibleWatermark: watermark,
      invisibleWatermark,
      config,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
