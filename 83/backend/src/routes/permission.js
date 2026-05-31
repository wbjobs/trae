const express = require('express');
const { runQuery, getQuery, allQuery } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logOperation, OPERATION_TYPES } = require('../utils/trace');

const router = express.Router();

router.post('/document/:documentId', authenticateToken, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { userId, department, role, permissionType, expiresAt } = req.body;

    const document = await getQuery('SELECT * FROM documents WHERE id = ?', [documentId]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    if (req.user.role !== 'admin' && document.uploader_id !== req.user.id) {
      return res.status(403).json({ error: '没有权限管理该文档的权限' });
    }

    if (!userId && !department && !role) {
      return res.status(400).json({ error: '必须指定用户、部门或角色' });
    }

    const result = await runQuery(`
      INSERT INTO document_permissions 
      (document_id, user_id, department, role, permission_type, granted_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      documentId,
      userId || null,
      department || null,
      role || null,
      permissionType || 'read',
      req.user.id,
      expiresAt || null,
    ]);

    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.PERMISSION_CHANGE,
      documentId: parseInt(documentId),
      documentTitle: document.title,
      ipAddress: req.ip,
      details: {
        action: 'grant',
        targetUser: userId,
        targetDepartment: department,
        targetRole: role,
        permissionType,
        expiresAt,
      },
      isOffline: req.user.isOffline,
    });

    res.json({
      id: result.lastID,
      message: '权限授权成功',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/document/:documentId', authenticateToken, async (req, res, next) => {
  try {
    const { documentId } = req.params;

    const document = await getQuery('SELECT * FROM documents WHERE id = ?', [documentId]);
    if (!document) {
      return res.status(404).json({ error: '文档不存在' });
    }

    if (req.user.role !== 'admin' && document.uploader_id !== req.user.id) {
      return res.status(403).json({ error: '没有权限查看该文档的权限配置' });
    }

    const permissions = await allQuery(`
      SELECT dp.*, 
             u.username as user_name,
             u.real_name as user_real_name
      FROM document_permissions dp
      LEFT JOIN users u ON dp.user_id = u.id
      WHERE dp.document_id = ?
      ORDER BY dp.granted_at DESC
    `, [documentId]);

    res.json({ permissions });
  } catch (err) {
    next(err);
  }
});

router.delete('/:permissionId', authenticateToken, async (req, res, next) => {
  try {
    const { permissionId } = req.params;

    const permission = await getQuery(
      'SELECT dp.*, d.uploader_id FROM document_permissions dp JOIN documents d ON dp.document_id = d.id WHERE dp.id = ?',
      [permissionId]
    );

    if (!permission) {
      return res.status(404).json({ error: '权限不存在' });
    }

    if (req.user.role !== 'admin' && permission.uploader_id !== req.user.id) {
      return res.status(403).json({ error: '没有权限撤销该权限' });
    }

    await runQuery('DELETE FROM document_permissions WHERE id = ?', [permissionId]);

    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.PERMISSION_CHANGE,
      documentId: permission.document_id,
      ipAddress: req.ip,
      details: {
        action: 'revoke',
        permissionId,
      },
      isOffline: req.user.isOffline,
    });

    res.json({ message: '权限撤销成功' });
  } catch (err) {
    next(err);
  }
});

router.get('/my', authenticateToken, async (req, res, next) => {
  try {
    const permissions = await allQuery(`
      SELECT dp.*, d.title as document_title, d.file_name, d.secret_level,
             u.username as granter_name
      FROM document_permissions dp
      JOIN documents d ON dp.document_id = d.id
      LEFT JOIN users u ON dp.granted_by = u.id
      WHERE dp.user_id = ? OR dp.department = ? OR dp.role = ?
      AND d.status = 1
      ORDER BY dp.granted_at DESC
    `, [req.user.id, req.user.department || '', req.user.role]);

    res.json({ permissions });
  } catch (err) {
    next(err);
  }
});

router.post('/batch', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { documentIds, userIds, departments, roles, permissionType, expiresAt } = req.body;

    if (!documentIds || documentIds.length === 0) {
      return res.status(400).json({ error: '必须指定文档ID列表' });
    }

    const results = [];

    for (const docId of documentIds) {
      if (userIds) {
        for (const userId of userIds) {
          const result = await runQuery(`
            INSERT INTO document_permissions 
            (document_id, user_id, permission_type, granted_by, expires_at)
            VALUES (?, ?, ?, ?, ?)
          `, [docId, userId, permissionType || 'read', req.user.id, expiresAt || null]);
          results.push(result.lastID);
        }
      }
      if (departments) {
        for (const dept of departments) {
          const result = await runQuery(`
            INSERT INTO document_permissions 
            (document_id, department, permission_type, granted_by, expires_at)
            VALUES (?, ?, ?, ?, ?)
          `, [docId, dept, permissionType || 'read', req.user.id, expiresAt || null]);
          results.push(result.lastID);
        }
      }
      if (roles) {
        for (const role of roles) {
          const result = await runQuery(`
            INSERT INTO document_permissions 
            (document_id, role, permission_type, granted_by, expires_at)
            VALUES (?, ?, ?, ?, ?)
          `, [docId, role, permissionType || 'read', req.user.id, expiresAt || null]);
          results.push(result.lastID);
        }
      }
    }

    res.json({
      message: `批量授权成功，共创建${results.length}条权限记录`,
      count: results.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
