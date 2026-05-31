require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs-extra');

const db = require('./config/database');
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/document');
const permissionRoutes = require('./routes/permission');
const logRoutes = require('./routes/log');
const watermarkRoutes = require('./routes/watermark');
const syncRoutes = require('./routes/sync');
const borrowRoutes = require('./routes/borrow');
const envRoutes = require('./routes/environment');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, '../database/encrypted_files');
const logDir = path.join(__dirname, '../database/logs');
fs.ensureDirSync(uploadDir);
fs.ensureDirSync(logDir);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost:5173', 'http://localhost:8080'] 
    : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Offline-Token'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: '请求过于频繁，请稍后再试' },
});
app.use(limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/document', authenticateToken, documentRoutes);
app.use('/api/permission', authenticateToken, permissionRoutes);
app.use('/api/log', authenticateToken, logRoutes);
app.use('/api/watermark', authenticateToken, watermarkRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/borrow', authenticateToken, borrowRoutes);
app.use('/api/environment', envRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: process.env.MODE || 'INTRANET',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

db.initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  涉密文档溯源系统后端服务已启动`);
    console.log(`  端口: ${PORT}`);
    console.log(`  运行模式: ${process.env.MODE || 'INTRANET'}`);
    console.log(`  访问地址: http://localhost:${PORT}`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在优雅关闭...');
  db.close();
  process.exit(0);
});
