module.exports = (req, res, next) => {
  const start = Date.now();
  const { method, url, ip } = req;
  
  console.log(`[${new Date().toISOString()}] ${method} ${url} - IP: ${ip}`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${method} ${url} - Status: ${res.statusCode} - Duration: ${duration}ms`);
  });
  
  next();
};
