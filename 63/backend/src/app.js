const express = require('express');
const corsMiddleware = require('./middleware/cors');
const loggerMiddleware = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(loggerMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: '学术文献引文系统运行正常',
    timestamp: new Date().toISOString()
  });
});

app.use(errorHandler);

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

module.exports = app;
