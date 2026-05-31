const express = require('express');
const { runQuery, getQuery, allQuery } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logOperation, OPERATION_TYPES } = require('../utils/trace');

const router = express.Router();

const getBorrowRuleBySecretLevel = async (secretLevel) => {
  return await getQuery(
    'SELECT * FROM borrow_rules WHERE secret_level = ? AND is_default = 1 LIMIT 1',
    [secretLevel]
  );
};

const checkBorrowLimit = async (userId, secretLevel) => {
  const rule = await getBorrowRuleBySecretLevel(secretLevel);
  if (!rule) return { allowed: false, reason: '未找到对应的借阅规则' };

  const activeBorrows = await getQuery(
    `SELECT COUNT(*) as count FROM document_borrows 
     WHERE user_id = ? AND status = 'active'`,
    [userId]
  );

  if (activeBorrows.count >= rule.max_borrow_count) {
    return { 
      allowed: false, 
      reason: `已达到最大借阅数量限制 (${rule.max_borrow_count}本)` 
    };
  }

  return { allowed: true, rule };
};

router.post('/apply', authenticateToken, async (req, res, next) => {
  try {
    const { documentId, borrowType = 'offline', borrowReason, dueAt } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    const document = await getQuery(
      'SELECT * FROM documents WHERE id = ? AND status = 1',
      [documentId]
    );

    if (!document) {
      return res.status(404).json({ error: '文档不存在或已被删除' });
    }

    const limitCheck = await checkBorrowLimit(userId, document.secret_level);
    if (!limitCheck.allowed) {
      return res.status(400).json({ error: limitCheck.reason });
    }

    const rule = limitCheck.rule;

    if (rule.allow_offline === 0 && borrowType === 'offline') {
      return res.status(400).json({ error: '该密级文档不允许离线借阅' });
    }

    const existingBorrow = await getQuery(
      `SELECT * FROM document_borrows 
       WHERE document_id = ? AND user_id = ? AND status = 'active'`,
      [documentId, userId]
    );

    if (existingBorrow) {
      return res.status(400).json({ error: '您已借阅该文档' });
    }

    const maxBorrowDays = rule.max_borrow_days;
    const calculatedDueAt = dueAt || new Date(Date.now() + maxBorrowDays * 24 * 60 * 60 * 1000).toISOString();
    
    const maxDueDate = new Date(Date.now() + maxBorrowDays * 24 * 60 * 60 * 1000);
    if (new Date(calculatedDueAt) > maxDueDate) {
      return res.status(400).json({ 
        error: `借阅时间不能超过最大借阅期限 (${maxBorrowDays}天)` 
      });
    }

    let status = 'active';
    if (rule.require_approval === 1) {
      status = 'pending';
    }

    const result = await runQuery(`
      INSERT INTO document_borrows 
      (document_id, user_id, borrower_name, borrow_type, borrow_reason, 
       due_at, status, max_offline_hours, auto_return, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      documentId,
      userId,
      username,
      borrowType,
      borrowReason,
      calculatedDueAt,
      status,
      rule.max_offline_hours,
      rule.auto_return,
      userId,
    ]);

    await logOperation({
      userId,
      username,
      operationType: OPERATION_TYPES.OFFLINE_ACCESS,
      documentId,
      documentTitle: document.title,
      details: {
        borrowId: result.lastID,
        borrowType,
        dueAt: calculatedDueAt,
        status,
      },
    });

    res.json({
      id: result.lastID,
      message: status === 'pending' ? '借阅申请已提交，等待审批' : '借阅成功',
      status,
      dueAt: calculatedDueAt,
      maxOfflineHours: rule.max_offline_hours,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/my', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status } = req.query;
    const offset = (page - 1) * pageSize;
    const userId = req.user.id;

    let whereSql = 'WHERE user_id = ?';
    let params = [userId];

    if (status) {
      whereSql += ' AND status = ?';
      params.push(status);
    }

    const countResult = await getQuery(
      `SELECT COUNT(*) as total FROM document_borrows ${whereSql}`,
      params
    );

    const borrows = await allQuery(`
      SELECT db.*, d.title as document_title, d.file_name, d.secret_level, d.file_size
      FROM document_borrows db
      LEFT JOIN documents d ON db.document_id = d.id
      ${whereSql}
      ORDER BY db.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    const now = new Date();
    const formattedBorrows = borrows.map(borrow => {
      const dueDate = new Date(borrow.due_at);
      const remainingHours = Math.max(0, Math.ceil((dueDate - now) / (1000 * 60 * 60)));
      const isOverdue = dueDate < now && borrow.status === 'active';
      
      return {
        ...borrow,
        remaining_hours: remainingHours,
        is_overdue: isOverdue,
      };
    });

    res.json({
      total: countResult.total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      list: formattedBorrows,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/return/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const borrow = await getQuery(
      'SELECT * FROM document_borrows WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!borrow) {
      return res.status(404).json({ error: '借阅记录不存在' });
    }

    if (borrow.status !== 'active') {
      return res.status(400).json({ error: '该借阅不是有效状态' });
    }

    await runQuery(`
      UPDATE document_borrows 
      SET status = 'returned', returned_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), id]);

    const document = await getQuery('SELECT title FROM documents WHERE id = ?', [borrow.document_id]);

    await logOperation({
      userId,
      username: req.user.username,
      operationType: 'return',
      documentId: borrow.document_id,
      documentTitle: document?.title,
      details: {
        borrowId: id,
        borrowHours: Math.ceil((Date.now() - new Date(borrow.borrow_at)) / (1000 * 60 * 60)),
      },
    });

    res.json({ message: '归还成功' });
  } catch (err) {
    next(err);
  }
});

router.post('/extend/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { extendDays } = req.body;
    const userId = req.user.id;

    const borrow = await getQuery(
      'SELECT db.*, d.secret_level FROM document_borrows db ' +
      'LEFT JOIN documents d ON db.document_id = d.id ' +
      'WHERE db.id = ? AND db.user_id = ?',
      [id, userId]
    );

    if (!borrow) {
      return res.status(404).json({ error: '借阅记录不存在' });
    }

    if (borrow.status !== 'active') {
      return res.status(400).json({ error: '该借阅不是有效状态' });
    }

    const rule = await getBorrowRuleBySecretLevel(borrow.secret_level);
    if (!rule || rule.allow_extension === 0) {
      return res.status(400).json({ error: '该密级文档不允许续借' });
    }

    const extensionCount = await getQuery(
      `SELECT COUNT(*) as count FROM document_borrows 
       WHERE id = ? AND extension_count >= ?`,
      [id, rule.max_extensions]
    );

    if (extensionCount.count > 0) {
      return res.status(400).json({ 
        error: `已达到最大续借次数 (${rule.max_extensions}次)` 
      });
    }

    const currentDueDate = new Date(borrow.due_at);
    const newDueDate = new Date(currentDueDate.getTime() + extendDays * 24 * 60 * 60 * 1000);
    const maxDueDate = new Date(Date.now() + rule.max_borrow_days * 24 * 60 * 60 * 1000);

    if (newDueDate > maxDueDate) {
      return res.status(400).json({ 
        error: `续借后总借阅时间不能超过最大期限 (${rule.max_borrow_days}天)` 
      });
    }

    await runQuery(`
      UPDATE document_borrows 
      SET due_at = ?, extension_count = COALESCE(extension_count, 0) + 1
      WHERE id = ?
    `, [newDueDate.toISOString(), id]);

    res.json({ 
      message: '续借成功', 
      newDueAt: newDueDate.toISOString(),
      remainingExtensions: rule.max_extensions - (borrow.extension_count || 0) - 1,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/rules', authenticateToken, async (req, res, next) => {
  try {
    const rules = await allQuery('SELECT * FROM borrow_rules ORDER BY secret_level');
    res.json(rules);
  } catch (err) {
    next(err);
  }
});

router.get('/overdue', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    const countResult = await getQuery(`
      SELECT COUNT(*) as total FROM document_borrows 
      WHERE status = 'active' AND due_at < ?
    `, [new Date().toISOString()]);

    const overdueBorrows = await allQuery(`
      SELECT db.*, d.title as document_title, d.secret_level, u.real_name as user_real_name
      FROM document_borrows db
      LEFT JOIN documents d ON db.document_id = d.id
      LEFT JOIN users u ON db.user_id = u.id
      WHERE db.status = 'active' AND db.due_at < ?
      ORDER BY db.due_at ASC
      LIMIT ? OFFSET ?
    `, [new Date().toISOString(), parseInt(pageSize), offset]);

    res.json({
      total: countResult.total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      list: overdueBorrows,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pending', authenticateToken, requireRole('manager'), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    let whereSql = "WHERE status = 'pending'";
    let params = [];

    if (req.user.role !== 'admin') {
      whereSql += ' AND EXISTS (SELECT 1 FROM documents d WHERE d.id = document_borrows.document_id AND d.department = ?)';
      params.push(req.user.department);
    }

    const countResult = await getQuery(
      `SELECT COUNT(*) as total FROM document_borrows ${whereSql}`,
      params
    );

    const pendingBorrows = await allQuery(`
      SELECT db.*, d.title as document_title, d.secret_level, u.real_name as user_real_name
      FROM document_borrows db
      LEFT JOIN documents d ON db.document_id = d.id
      LEFT JOIN users u ON db.user_id = u.id
      ${whereSql}
      ORDER BY db.created_at ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({
      total: countResult.total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      list: pendingBorrows,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/approve/:id', authenticateToken, requireRole('manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    const userId = req.user.id;

    const borrow = await getQuery(
      'SELECT * FROM document_borrows WHERE id = ? AND status = ?',
      [id, 'pending']
    );

    if (!borrow) {
      return res.status(404).json({ error: '待审批的借阅记录不存在' });
    }

    const newStatus = approved ? 'active' : 'rejected';
    await runQuery(`
      UPDATE document_borrows 
      SET status = ?, approved_by = ?, approved_at = ?
      WHERE id = ?
    `, [newStatus, userId, new Date().toISOString(), id]);

    res.json({ 
      message: approved ? '审批通过' : '已拒绝',
      status: newStatus,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/check-access/:documentId', authenticateToken, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;

    const borrow = await getQuery(`
      SELECT db.*, d.secret_level 
      FROM document_borrows db
      LEFT JOIN documents d ON db.document_id = d.id
      WHERE db.document_id = ? AND db.user_id = ? AND db.status = 'active'
    `, [documentId, userId]);

    if (!borrow) {
      return res.json({
        allowed: false,
        reason: '未找到有效的借阅记录',
      });
    }

    const now = new Date();
    const dueDate = new Date(borrow.due_at);

    if (dueDate < now) {
      return res.json({
        allowed: false,
        reason: '借阅已过期，请续借或归还',
        isOverdue: true,
      });
    }

    await runQuery(`
      UPDATE document_borrows 
      SET access_count = COALESCE(access_count, 0) + 1, last_access_at = ?
      WHERE id = ?
    `, [now.toISOString(), borrow.id]);

    const remainingHours = Math.ceil((dueDate - now) / (1000 * 60 * 60));

    res.json({
      allowed: true,
      borrowId: borrow.id,
      borrowType: borrow.borrow_type,
      dueAt: borrow.due_at,
      remainingHours,
      maxOfflineHours: borrow.max_offline_hours,
      accessCount: (borrow.access_count || 0) + 1,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
