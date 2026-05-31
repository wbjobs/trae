const GameState = require('./game_state');
const GameServer = require('./network/game_server');

const PORT = process.env.PORT || 3000;

console.log('========================================');
console.log('    废墟秘境 - 游戏服务器');
console.log('========================================');
console.log();

console.log('[初始化] 正在初始化游戏状态...');
const gameState = new GameState();
gameState.initialize();

console.log('[初始化] 游戏状态初始化完成');
console.log(`  - 地图大小: ${gameState.map.width}x${gameState.map.height}`);
console.log(`  - 敌人数量: ${gameState.enemies.length}`);
console.log(`  - 出生点: ${gameState.map.spawnPoints.length}个`);
console.log();

console.log('[启动] 正在启动WebSocket服务器...');
const server = new GameServer(PORT);
server.start(gameState);

console.log('[运行] 服务器已启动，等待客户端连接...');
console.log(`  - 监听端口: ${PORT}`);
console.log(`  - 游戏状态: ${gameState.gamePhase}`);
console.log();

console.log('[提示] 按 Ctrl+C 停止服务器');
console.log();

process.on('SIGINT', () => {
  console.log();
  console.log('[关闭] 正在关闭服务器...');
  server.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[错误] 未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[错误] 未处理的Promise拒绝:', reason);
});

module.exports = { gameState, server };
