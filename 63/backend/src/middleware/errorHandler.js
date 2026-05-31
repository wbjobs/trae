module.exports = (err, req, res, next) => {
  console.error('[Error]', err.message, err.stack);
  
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    message: err.message || '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };
  
  res.status(statusCode).json(response);
};
