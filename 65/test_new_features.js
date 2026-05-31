const { GameCore } = require('./src/core/gameCore');
const WeatherSystem = require('./src/modules/weather');
const { NetworkDebouncer, StateThrottler, PacketMerger } = require('./src/network/debouncer');
const { ReplayRecorder, ReplayPlayer, ReplayManager } = require('./src/core/replaySystem');
const CombatSystem = require('./src/core/combatSystem');
const ScoreSystem = require('./src/core/scoreSystem');
const EventSystem = require('./src/core/eventSystem');
const { MapConfig } = require('./src/config/mapConfig');
const CoordinateSystem = require('./src/modules/coordinate');
const CollisionDetector = require('./src/modules/collision');

function runTests() {
  console.log('=== 空域对战游戏新功能测试 ===\n');

  let allPassed = true;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`);
      allPassed = false;
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || '断言失败');
    }
  }

  test('MapConfig 自定义地图导入导出', () => {
    const mapConfig = new MapConfig({ customMapsDir: './test_data/maps' });
    
    const testMap = {
      id: 'test_map_1',
      name: '测试空域',
      description: '测试用自定义地图',
      bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 1000, minAlt: 100, maxAlt: 5000 },
      spawnPoints: [
        { x: 100, y: 100, altitude: 1000 },
        { x: 900, y: 900, altitude: 1000 }
      ]
    };

    const result = mapConfig.importCustomMap(testMap);
    assert(result.success, '导入应该成功');
    
    const loaded = mapConfig.getMapConfig('test_map_1');
    assert(loaded && loaded.name === '测试空域', '地图名称应该正确');
    
    const allMaps = mapConfig.getAllMaps();
    assert(allMaps.some(m => m.id === 'test_map_1'), '应该出现在地图列表中');
    
    const exported = mapConfig.exportMap('test_map_1');
    assert(exported.id === 'test_map_1', '导出应该正确');
    
    const deleteResult = mapConfig.deleteCustomMap('test_map_1');
    assert(deleteResult.success, '删除应该成功');
  });

  test('WeatherSystem 基础功能', () => {
    const coordSystem = new CoordinateSystem({ 
      minX: 0, maxX: 2000, minY: 0, maxY: 2000, minAlt: 100, maxAlt: 10000 
    });
    const weatherSystem = new WeatherSystem(coordSystem);
    
    assert(weatherSystem.weatherZones instanceof Map, '应该初始化天气区域集合');
    
    const zoneId = weatherSystem.createWeatherZone({
      type: 'storm',
      position: { x: 500, y: 500, altitude: 3000 },
      radius: 200,
      intensity: 0.8
    });
    
    assert(zoneId, '应该创建天气区域');
    assert(weatherSystem.weatherZones.size === 1, '应该有一个天气区域');
    
    const summary = weatherSystem.getActiveWeatherSummary();
    assert(Array.isArray(summary), '应该返回天气摘要数组');
  });

  test('NetworkDebouncer 防抖功能', () => {
    const debouncer = new NetworkDebouncer({ defaultDebounceTime: 50 });
    let callCount = 0;
    let receivedData = [];
    
    const callback = (data) => {
      callCount++;
      receivedData = data;
    };
    
    debouncer.debounce('test_key', { val: 1 }, callback);
    debouncer.debounce('test_key', { val: 2 }, callback);
    debouncer.debounce('test_key', { val: 3 }, callback);
    
    assert(callCount === 0, '防抖期间不应该立即调用');
    assert(debouncer.isPending('test_key'), '应该有待处理数据');
  });

  test('StateThrottler 节流功能', () => {
    const throttler = new StateThrottler({ throttleTime: 100 });
    let sendCount = 0;
    
    const callback = (data) => { sendCount++; };
    
    throttler.throttle('player1', { pos: 1 }, callback);
    throttler.throttle('player1', { pos: 2 }, callback);
    throttler.throttle('player1', { pos: 3 }, callback);
    
    assert(throttler.lastValues.size > 0, '应该缓存最新值');
  });

  test('PacketMerger 数据包合并', () => {
    const merger = new PacketMerger({ flushInterval: 50, enabled: true });
    
    merger.addPacket('room1', 'player_move', { id: 1, x: 100 });
    merger.addPacket('room1', 'player_move', { id: 1, x: 110 });
    merger.addPacket('room1', 'player_move', { id: 2, x: 200 });
    
    assert(merger.getPendingCount('room1') === 3, '应该有3个待处理包');
    
    const flushed = merger.flushAll();
    assert(flushed.length >= 1, '应该有合并后的数据包');
    assert(merger.getPendingCount('room1') === 0, 'flush后应该没有待处理包');
  });

  test('ReplayRecorder 回放录制', () => {
    const recorder = new ReplayRecorder('test_game', { map: 'default' });
    
    recorder.start();
    assert(recorder.isRecording(), '应该处于录制状态');
    
    recorder.recordFrame({ aircrafts: [], resources: [] });
    recorder.recordFrame({ aircrafts: [], resources: [] });
    recorder.recordEvent({ type: 'kill', data: {} });
    
    const data = recorder.stop();
    assert(data.frames.length === 2, '应该录制2帧');
    assert(data.events.length === 1, '应该录制1个事件');
    assert(data.metadata.duration >= 0, '应该有持续时间');
  });

  test('ReplayPlayer 回放播放', () => {
    const recorder = new ReplayRecorder('test_game2', {});
    recorder.start();
    recorder.recordFrame({ timestamp: 0, aircrafts: [{ id: 1, x: 0 }] });
    recorder.recordFrame({ timestamp: 100, aircrafts: [{ id: 1, x: 100 }] });
    recorder.recordFrame({ timestamp: 200, aircrafts: [{ id: 1, x: 200 }] });
    const data = recorder.stop();
    
    const player = new ReplayPlayer(data);
    player.play();
    player.seek(150);
    
    assert(player.getCurrentTime() >= 150, '时间轴应该正确');
    assert(player.getFrames().length === 3, '应该有3帧');
  });

  test('CombatSystem 战斗系统', () => {
    const coordSystem = new CoordinateSystem({});
    const collisionDetector = new CollisionDetector(coordSystem);
    const combat = new CombatSystem(collisionDetector);
    
    assert(combat.config.baseDamage > 0, '应该有基础伤害配置');
    
    const stats = combat.getStats();
    assert(stats.totalFires === 0, '初始开火次数应该为0');
  });

  test('ScoreSystem 积分系统', () => {
    const score = new ScoreSystem();
    
    score.addScore('player1', 100, 'kill');
    score.addKill('player1');
    
    const stats = score.getStats();
    assert(stats.players && stats.players.player1, '应该有玩家统计');
    assert(stats.players.player1.kills === 1, '击杀数应该正确');
  });

  test('EventSystem 事件系统', () => {
    const events = new EventSystem();
    let received = [];
    
    events.on('test_event', (data) => received.push(data));
    events.emit('test_event', { value: 1 });
    
    const allEvents = events.getEvents();
    assert(allEvents.length === 1, '应该记录1个事件');
    assert(received.length === 1, '监听器应该被调用1次');
  });

  test('GameCore 集成所有新系统', () => {
    const game = new GameCore({
      mapId: 'default',
      enableWeather: true,
      enableReplay: true,
      gameDuration: 30000
    });
    
    game.addPlayer('p1', '玩家1');
    game.addPlayer('p2', '玩家2');
    
    assert(game.weatherSystem, '应该初始化天气系统');
    assert(game.combatSystem, '应该初始化战斗系统');
    assert(game.scoreSystem, '应该初始化积分系统');
    assert(game.eventSystem, '应该初始化事件系统');
    assert(game.replayManager, '应该初始化回放系统');
    
    game.setPlayerReady('p1', true);
    game.setPlayerReady('p2', true);
    
    assert(game.status === 'playing', '游戏应该开始');
    assert(game.replayId !== null, '应该开始录制回放');
    
    game.end('test_end');
    
    assert(game.status === 'finished', '游戏应该结束');
    
    const result = game.getGameResult();
    assert(result.replayId !== null, '结果应该包含回放ID');
    assert(result.combatStats !== undefined, '应该包含战斗统计');
    assert(result.scoreStats !== undefined, '应该包含积分统计');
  });

  test('完整游戏流程模拟', () => {
    const game = new GameCore({
      mapId: 'default',
      enableWeather: true,
      enableReplay: true,
      gameDuration: 60000
    });
    
    game.addPlayer('p1', '玩家A');
    game.addPlayer('p2', '玩家B');
    game.setPlayerReady('p1', true);
    game.setPlayerReady('p2', true);
    
    game.setRoute('p1', [
      { x: 500, y: 500, altitude: 3000 },
      { x: 1000, y: 1000, altitude: 4000 }
    ]);
    
    game.setRoute('p2', [
      { x: 1500, y: 1500, altitude: 3000 },
      { x: 1000, y: 1000, altitude: 4000 }
    ]);
    
    for (let i = 0; i < 5; i++) {
      game.tick(100);
    }
    
    const state = game.getGameState();
    assert(state.weather !== undefined, '应该有天气数据');
    assert(state.combatStats !== undefined, '应该有战斗统计');
    assert(state.scores.length === 2, '应该有2个玩家的积分');
    
    game.end('test_complete');
    const result = game.getGameResult();
    assert(result.events.length > 0, '应该有游戏事件记录');
  });

  console.log('\n=== 测试完成 ===');
  if (allPassed) {
    console.log('所有测试通过！ ✓');
  } else {
    console.log('部分测试失败！ ✗');
  }
  
  return allPassed;
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
