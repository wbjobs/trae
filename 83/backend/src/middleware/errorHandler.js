const errorHandler = (err, req, res, next) => {
  console.error('错误堆栈:', err.stack);
  
  let statusCode = err.statusCode || 500;
  let message = err.message || '服务器内部错误';
  
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = '无效的认证令牌';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = '认证令牌已过期';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = '文件大小超过限制';
  } else if (err.code === 'ENOENT') {
    statusCode = 404;
    message = '请求的资源不存在';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    statusCode = 400;
    message = '数据约束冲突，可能是重复数据';
  }

  res.status(statusCode).json({
    error: message,
    code: err.code || err.name || 'UNKNOWN_ERROR',
    timestamp: new Date().toISOString(),
    path: req.path,
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: '请求的接口不存在',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
