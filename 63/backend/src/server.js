const app = require('./app');
const { PORT } = require('./config');

const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   📚 学术文献引文系统后端服务已启动                        ║
║                                                          ║
║   🚀 服务地址: http://localhost:${PORT}                     ║
║   🔍 健康检查: http://localhost:${PORT}/health              ║
║   📖 API文档: http://localhost:${PORT}/api                  ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
