const GameState = require('./game_state');
const PacketCompressor = require('./network/packet_compressor');
const MapEditor = require('./scenes/map_editor');
const WeatherSystem = require('./behaviors/weather_system');
const ClueSystem = require('./behaviors/clue_system');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('废墟秘境潜行游戏框架 - 模块功能验证测试');
console.log('='.repeat(60));
console.log('');

let testResults = [];

function test(name, fn) {
  try {
    console.log(`测试: ${name}`);
    const result = fn();
    console.log(`  ✓ 通过`);
    testResults.push({ name, success: true });
    return result;
  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}`);
    console.log(`  堆栈: ${error.stack}`);
    testResults.push({ name, success: false, error: error.message, stack: error.stack });
    return null;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '断言失败');
  }
}

console.log('--- 1. 数据包压缩传输模块测试 ---');
console.log('');

test('数据包压缩模块初始化', () => {
  const compressor = new PacketCompressor({
    compressionThreshold: 100,
    compressionLevel: 6,
    useDictionary: true
  });
  assert(compressor !== null, '压缩模块初始化失败');
  assert(compressor.compressionThreshold === 100, '压缩阈值设置错误');
  return compressor;
});

test('数据包压缩和解压缩', () => {
  const compressor = new PacketCompressor({ compressionThreshold: 10 });
  const originalData = JSON.stringify({
    type: 'state_sync',
    players: Array(10).fill(null).map((_, i) => ({
      id: `player_${i}`,
      x: Math.random() * 100,
      y: Math.random() * 100,
      health: 100,
      stealth: 50 + Math.random() * 50
    }))
  });
  
  const result = compressor.compress(originalData);
  assert(result !== null, '压缩失败');
  
  const decompressed = compressor.decompress(result.data);
  assert(decompressed !== null, '解压缩失败');
  
  const parsed = JSON.parse(decompressed.data);
  assert(parsed.type === 'state_sync', '解压缩后数据不匹配');
  assert(parsed.players.length === 10, '玩家数据丢失');
  
  return {
    originalSize: originalData.length,
    compressedSize: result.compressedSize,
    ratio: result.ratio
  };
});

test('压缩统计功能', () => {
  const compressor = new PacketCompressor({ compressionThreshold: 10 });
  
  for (let i = 0; i < 10; i++) {
    const data = JSON.stringify({ test: 'data', index: i, large: Array(100).fill('x') });
    compressor.compress(data);
  }
  
  const stats = compressor.getCompressionStats();
  assert(stats.totalPackets === 10, '总数据包统计错误');
  assert(stats.totalOriginalSize > 0, '原始大小统计错误');
  assert(stats.compressionPercentage >= 0, '压缩百分比计算错误');
  
  return stats;
});

test('优化数据包创建和解析', () => {
  const compressor = new PacketCompressor();
  const packet = compressor.createOptimizedPacket('player_move', { x: 10, y: 20 }, { sequenceId: 1, reliable: true });
  
  assert(packet.t === 'player_move', '数据包类型错误');
  assert(packet.d.x === 10, '位置数据错误');
  assert(packet.s === 1, '序列号错误');
  assert(packet.r === 1, '可靠标记错误');
  
  const parsed = compressor.parseOptimizedPacket(packet);
  assert(parsed.type === 'player_move', '解析后类型错误');
  assert(parsed.data.x === 10, '解析后位置错误');
  
  return packet;
});

console.log('');
console.log('--- 2. 天气系统模块测试 ---');
console.log('');

test('天气系统初始化', () => {
  const weatherSystem = new WeatherSystem();
  assert(weatherSystem !== null, '天气系统初始化失败');
  assert(weatherSystem.currentWeather !== null, '初始天气未设置');
  return weatherSystem;
});

test('天气系统对潜行值的影响', () => {
  const weatherSystem = new WeatherSystem();
  const player = { x: 0, y: 0, posture: 'crouch', movement_type: 'crawl' };
  const baseStealth = 70;
  
  const modifiedStealth = weatherSystem.getModifiedPlayerStealth(player, baseStealth);
  assert(typeof modifiedStealth === 'number', '返回值类型错误');
  assert(modifiedStealth > 0, '修改后的潜行值无效');
  
  return { base: baseStealth, modified: modifiedStealth };
});

test('天气系统对敌人检测范围的影响', () => {
  const weatherSystem = new WeatherSystem();
  const enemy = { detection_range: 5, awareness: 0 };
  
  const modifiedEnemy = weatherSystem.getModifiedEnemyDetection(enemy);
  assert(modifiedEnemy !== null, '返回值为空');
  assert(typeof modifiedEnemy.detection_range === 'number', '检测范围类型错误');
  
  return { original: enemy.detection_range, modified: modifiedEnemy.detection_range };
});

test('天气系统更新和状态获取', () => {
  const weatherSystem = new WeatherSystem();
  const initialWeather = weatherSystem.currentWeather.type;
  
  weatherSystem.update(100000);
  const state = weatherSystem.getWeatherState();
  
  assert(state !== null, '天气状态获取失败');
  assert(state.type !== null, '天气类型为空');
  assert(typeof state.visibility === 'number', '能见度数值错误');
  
  return state;
});

console.log('');
console.log('--- 3. 线索推演系统模块测试 ---');
console.log('');

test('线索系统初始化', () => {
  const gameState = { players: new Map() };
  const clueSystem = new ClueSystem(gameState);
  assert(clueSystem !== null, '线索系统初始化失败');
  return clueSystem;
});

test('线索生成和收集', () => {
  const gameState = { players: new Map() };
  const clueSystem = new ClueSystem(gameState);
  
  const map = {
    width: 20,
    height: 20,
    tiles: Array(20).fill(null).map((_, y) =>
      Array(20).fill(null).map((_, x) => ({
        type: x === 0 || y === 0 || x === 19 || y === 19 ? 'wall' : 'ground',
        passable: !(x === 0 || y === 0 || x === 19 || y === 19)
      }))
    )
  };
  
  clueSystem.initialize(map);
  const initialClueCount = clueSystem.clues.size;
  assert(initialClueCount > 0, '没有生成任何线索');
  
  const player = { id: 'player_1', x: 5, y: 5 };
  gameState.players.set('player_1', player);
  
  const clues = Array.from(clueSystem.clues.values());
  if (clues.length > 0) {
    const clue = clues[0];
    player.x = clue.x;
    player.y = clue.y;
    
    const result = clueSystem.collectClue('player_1', clue.id);
    assert(result.success, '线索收集失败');
    assert(result.clue !== null, '返回的线索为空');
    assert(clue.collected, '线索标记为未收集');
  }
  
  return { initialClueCount, collected: clues.length > 0 ? 1 : 0 };
});

test('线索统计功能', () => {
  const gameState = { players: new Map() };
  const clueSystem = new ClueSystem(gameState);
  
  const map = {
    width: 20,
    height: 20,
    tiles: Array(20).fill(null).map((_, y) =>
      Array(20).fill(null).map((_, x) => ({
        type: 'ground',
        passable: true
      }))
    )
  };
  
  clueSystem.initialize(map);
  gameState.players.set('player_1', { id: 'player_1', x: 0, y: 0 });
  
  const clues = Array.from(clueSystem.clues.values()).slice(0, 3);
  for (const clue of clues) {
    gameState.players.get('player_1').x = clue.x;
    gameState.players.get('player_1').y = clue.y;
    clueSystem.collectClue('player_1', clue.id);
  }
  
  const stats = clueSystem.getClueStats('player_1');
  assert(stats.total === clues.length, '收集的线索数量统计错误');
  assert(stats.fragments > 0, '碎片数量统计错误');
  
  return stats;
});

test('线索推演功能', () => {
  const gameState = { players: new Map() };
  const clueSystem = new ClueSystem(gameState);
  
  const map = {
    width: 30,
    height: 30,
    tiles: Array(30).fill(null).map((_, y) =>
      Array(30).fill(null).map((_, x) => ({
        type: 'ground',
        passable: true
      }))
    )
  };
  
  clueSystem.initialize(map);
  gameState.players.set('player_1', { id: 'player_1', x: 0, y: 0 });
  
  const clues = Array.from(clueSystem.clues.values()).slice(0, 5);
  for (const clue of clues) {
    gameState.players.get('player_1').x = clue.x;
    gameState.players.get('player_1').y = clue.y;
    clueSystem.collectClue('player_1', clue.id);
  }
  
  const collected = clueSystem.getCollectedClues('player_1');
  if (collected.length >= 2) {
    const clueIds = collected.slice(0, 2).map(c => c.id);
    const result = clueSystem.startDeduction('player_1', clueIds);
    
    assert(result.success, '推演启动失败');
    assert(result.deductionId !== null, '推演ID为空');
    assert(typeof result.successRate === 'number', '成功率数值错误');
    
    const completeResult = clueSystem.completeDeduction('player_1', result.deductionId);
    assert(completeResult.success, '推演完成失败');
    
    return {
      deductionId: result.deductionId,
      successRate: result.successRate,
      deductionSuccess: completeResult.deductionSuccess
    };
  }
  
  return { skipped: true, reason: '收集的线索不足' };
});

console.log('');
console.log('--- 4. 地图编辑工具模块测试 ---');
console.log('');

test('地图编辑器初始化', () => {
  const mapEditor = new MapEditor(20, 20);
  assert(mapEditor !== null, '地图编辑器初始化失败');
  assert(mapEditor.width === 20, '地图宽度错误');
  assert(mapEditor.height === 20, '地图高度错误');
  return mapEditor;
});

test('地图编辑器设置地块类型', () => {
  const mapEditor = new MapEditor(10, 10);
  mapEditor.setTile(5, 5, 'building');
  const tile = mapEditor.getTile(5, 5);
  assert(tile.type === 'building', '地块类型设置错误');
  return tile;
});

test('地图编辑器填充区域', () => {
  const mapEditor = new MapEditor(10, 10);
  mapEditor.fillRegion(2, 2, 5, 5, 'rubble');
  
  let filledCount = 0;
  for (let y = 2; y <= 5; y++) {
    for (let x = 2; x <= 5; x++) {
      if (mapEditor.getTile(x, y).type === 'rubble') {
        filledCount++;
      }
    }
  }
  
  assert(filledCount === 16, '填充区域大小错误');
  return filledCount;
});

test('地图编辑器保存和加载', () => {
  const mapEditor = new MapEditor(10, 10);
  mapEditor.setTile(3, 3, 'building');
  mapEditor.setTile(7, 7, 'trap');
  
  const saved = mapEditor.saveMap();
  assert(saved !== null, '地图保存失败');
  
  const newEditor = new MapEditor(10, 10);
  newEditor.loadMap(saved);
  
  assert(newEditor.getTile(3, 3).type === 'building', '加载后地块类型错误');
  assert(newEditor.getTile(7, 7).type === 'trap', '加载后地块类型错误');
  
  return saved;
});

test('地图编辑器导出功能', () => {
  const mapEditor = new MapEditor(5, 5);
  const exported = mapEditor.exportForGame();
  
  assert(exported.width === 5, '导出宽度错误');
  assert(exported.height === 5, '导出高度错误');
  assert(Array.isArray(exported.tiles), '导出的地块不是数组');
  assert(exported.tiles.length === 5, '导出的地块行数错误');
  
  return exported;
});

console.log('');
console.log('--- 5. 画面适配配置文件测试 ---');
console.log('');

test('画面配置文件加载', () => {
  const configPath = path.join(__dirname, 'configs', 'graphics_config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(config !== null, '配置文件加载失败');
  assert(config.profiles !== null, '配置文件缺少profiles');
  return config;
});

test('设备配置文件完整性', () => {
  const configPath = path.join(__dirname, 'configs', 'graphics_config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const requiredProfiles = [
    'low_end_mobile', 'mid_range_mobile', 'high_end_mobile',
    'desktop_low', 'desktop_medium', 'desktop_high',
    'ultrawide', 'tablet', 'tv'
  ];
  
  for (const profile of requiredProfiles) {
    assert(config.profiles[profile] !== undefined, `缺少配置文件: ${profile}`);
    assert(config.profiles[profile].resolution !== undefined, `${profile} 缺少分辨率配置`);
    assert(config.profiles[profile].rendering !== undefined, `${profile} 缺少渲染配置`);
    assert(config.profiles[profile].ui !== undefined, `${profile} 缺少UI配置`);
  }
  
  return { profileCount: Object.keys(config.profiles).length };
});

test('配色方案完整性', () => {
  const configPath = path.join(__dirname, 'configs', 'graphics_config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const requiredSchemes = ['default', 'dark', 'light', 'sepia', 'protanopia', 'deuteranopia', 'tritanopia'];
  
  for (const scheme of requiredSchemes) {
    assert(config.color_schemes[scheme] !== undefined, `缺少配色方案: ${scheme}`);
    assert(config.color_schemes[scheme].primary !== undefined, `${scheme} 缺少主色调`);
    assert(config.color_schemes[scheme].background !== undefined, `${scheme} 缺少背景色`);
  }
  
  return { schemeCount: Object.keys(config.color_schemes).length };
});

console.log('');
console.log('--- 6. 游戏核心集成测试 ---');
console.log('');

test('游戏状态初始化 - 所有模块集成', () => {
  const gameState = new GameState();
  gameState.initialize();
  
  assert(gameState.map !== null, '地图未生成');
  assert(gameState.weatherSystem !== null, '天气系统未初始化');
  assert(gameState.clueSystem !== null, '线索系统未初始化');
  assert(gameState.weatherSystem.currentWeather !== null, '天气系统未激活');
  assert(gameState.clueSystem.clues.size > 0, '线索系统未生成线索');
  
  return {
    mapWidth: gameState.map.width,
    mapHeight: gameState.map.height,
    clueCount: gameState.clueSystem.clues.size,
    playerCount: gameState.players.size
  };
});

test('玩家移动 - 天气和环境影响', () => {
  const gameState = new GameState();
  gameState.initialize();
  
  const player = gameState.addPlayer('TestPlayer');
  const initialStealth = player.current_stealth;
  
  const nearbyPassable = gameState.map.tiles.flat().find(t => 
    t.passable && Math.abs(t.x - player.x) <= 1 && Math.abs(t.y - player.y) <= 1
  );
  
  if (nearbyPassable) {
    const result = gameState.movePlayer(player.id, nearbyPassable.x, nearbyPassable.y, 'crouch');
    assert(result.success, '玩家移动失败');
    assert(typeof result.player.current_stealth === 'number', '移动后潜行值无效');
  }
  
  return { initialStealth, moved: nearbyPassable !== undefined };
});

test('线索收集集成', () => {
  const gameState = new GameState();
  gameState.initialize();
  
  const player = gameState.addPlayer('ClueHunter');
  
  const clues = Array.from(gameState.clueSystem.clues.values());
  if (clues.length > 0) {
    const clue = clues[0];
    player.x = clue.x;
    player.y = clue.y;
    
    const result = gameState.playerAction(player.id, 'collect_clue', { clue_id: clue.id });
    assert(result.success, '线索收集动作失败');
    assert(result.clue !== null, '返回的线索为空');
  }
  
  return { cluesAvailable: clues.length };
});

test('游戏Tick更新', () => {
  const gameState = new GameState();
  gameState.initialize();
  
  const initialWeather = gameState.weatherSystem.currentWeather.type;
  const initialClueCount = gameState.clueSystem.clues.size;
  
  gameState.tick(1000);
  gameState.tick(1000);
  gameState.tick(1000);
  
  assert(gameState.gameTime > 0, '游戏时间未更新');
  
  return {
    gameTime: gameState.gameTime,
    initialWeather,
    currentWeather: gameState.weatherSystem.currentWeather.type,
    clueCount: gameState.clueSystem.clues.size
  };
});

console.log('');
console.log('='.repeat(60));
console.log('测试结果汇总');
console.log('='.repeat(60));

const passed = testResults.filter(r => r.success).length;
const total = testResults.length;
const failed = total - passed;

console.log(`总共测试: ${total}`);
console.log(`通过: ${passed} ✓`);
console.log(`失败: ${failed} ✗`);
console.log(`成功率: ${((passed / total) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('');
  console.log('失败的测试:');
  testResults.filter(r => !r.success).forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
}

console.log('');
console.log('='.repeat(60));

if (failed === 0) {
  console.log('所有测试通过！✓');
  process.exit(0);
} else {
  console.log('部分测试失败，请检查代码。');
  process.exit(1);
}
