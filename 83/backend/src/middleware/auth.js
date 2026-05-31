const jwt = require('jsonwebtoken');
const { getQuery } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const offlineToken = req.headers['x-offline-token'];
  
  let token = null;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token && offlineToken) {
    try {
      const user = await getQuery(
        'SELECT * FROM users WHERE offline_token = ? AND status = 1',
        [offlineToken]
      );
      
      if (!user) {
        return res.status(401).json({ error: '离线令牌无效' });
      }

      if (user.offline_expire_at && new Date(user.offline_expire_at) < new Date()) {
        return res.status(401).json({ error: '离线令牌已过期，请联网重新认证' });
      }

      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        realName: user.real_name,
        department: user.department,
        permissions: user.permissions ? JSON.parse(user.permissions) : [],
        isOffline: true,
      };
      
      return next();
    } catch (err) {
      return res.status(500).json({ error: '离线认证失败' });
    }
  }

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getQuery(
      'SELECT * FROM users WHERE id = ? AND status = 1',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ error: '用户不存在或已被禁用' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.real_name,
      department: user.department,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
      isOffline: false,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '令牌已过期', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: '无效的认证令牌' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足，需要以下角色之一: ' + roles.join(', ') });
    }
    next();
  };
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }
    
    if (req.user.role === 'admin') {
      return next();
    }

    const userPerms = req.user.permissions || [];
    if (!userPerms.includes(permission) && !userPerms.includes('*')) {
      return res.status(403).json({ error: '缺少权限: ' + permission });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole,
  requirePermission,
};
