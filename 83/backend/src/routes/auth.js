const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { runQuery, getQuery, allQuery } = require('../config/database');
const { requireRole, authenticateToken } = require('../middleware/auth');
const { logOperation, OPERATION_TYPES } = require('../utils/trace');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = await getQuery(
      'SELECT * FROM users WHERE username = ? AND status = 1',
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await logOperation({
        userId: user.id,
        username: user.username,
        operationType: OPERATION_TYPES.LOGIN,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { success: false, reason: '密码错误' },
      });
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const offlineToken = crypto.randomBytes(32).toString('hex');
    const offlineExpireDays = parseInt(process.env.OFFLINE_EXPIRE_DAYS) || 30;
    const offlineExpireAt = new Date();
    offlineExpireAt.setDate(offlineExpireAt.getDate() + offlineExpireDays);

    await runQuery(
      'UPDATE users SET offline_token = ?, offline_expire_at = ? WHERE id = ?',
      [offlineToken, offlineExpireAt.toISOString(), user.id]
    );

    await logOperation({
      userId: user.id,
      username: user.username,
      operationType: OPERATION_TYPES.LOGIN,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { success: true },
    });

    res.json({
      token,
      offlineToken,
      offlineExpireAt: offlineExpireAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        role: user.role,
        department: user.department,
        permissions: user.permissions ? JSON.parse(user.permissions) : [],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    await logOperation({
      userId: req.user.id,
      username: req.user.username,
      operationType: OPERATION_TYPES.LOGOUT,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {},
    });

    res.json({ message: '退出登录成功' });
  } catch (err) {
    next(err);
  }
});

router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    const user = await getQuery(
      'SELECT id, username, real_name, role, department, permissions, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      ...user,
      real_name: user.real_name,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
      isOffline: req.user.isOffline,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/password', authenticateToken, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' });
    }

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const isValidPassword = await bcrypt.compare(oldPassword, user.password);

    if (!isValidPassword) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await runQuery(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    res.json({ message: '密码修改成功' });
  } catch (err) {
    next(err);
  }
});

router.get('/users', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    let whereSql = '';
    let params = [];

    if (keyword) {
      whereSql = 'WHERE username LIKE ? OR real_name LIKE ? OR department LIKE ?';
      params = [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`];
    }

    const countResult = await getQuery(
      `SELECT COUNT(*) as total FROM users ${whereSql}`,
      params
    );

    const users = await allQuery(`
      SELECT id, username, real_name, role, department, status, created_at, offline_expire_at
      FROM users ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({
      total: countResult.total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(countResult.total / pageSize),
      users,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/users', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { username, password, realName, role, department, permissions } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await runQuery(`
      INSERT INTO users (username, password, real_name, role, department, permissions)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      username,
      hashedPassword,
      realName || username,
      role || 'user',
      department || '',
      JSON.stringify(permissions || []),
    ]);

    res.json({
      id: result.lastID,
      message: '用户创建成功',
    });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { realName, role, department, permissions, status, password } = req.body;

    const updates = [];
    const params = [];

    if (realName !== undefined) {
      updates.push('real_name = ?');
      params.push(realName);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (department !== undefined) {
      updates.push('department = ?');
      params.push(department);
    }
    if (permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(permissions));
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await runQuery(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ message: '用户信息更新成功' });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: '不能删除当前登录用户' });
    }

    await runQuery('DELETE FROM users WHERE id = ?', [id]);

    res.json({ message: '用户删除成功' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
