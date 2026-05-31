const readline = require('readline');
const GameClient = require('./network/game_client');

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000';
const PLAYER_NAME = process.env.PLAYER_NAME || `玩家_${Math.floor(Math.random() * 1000)}`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('========================================');
console.log('    废墟秘境 - 游戏客户端');
console.log('========================================');
console.log();

console.log(`[连接] 正在连接到服务器: ${SERVER_URL}...`);
const client = new GameClient(SERVER_URL);

let currentPosture = 'stand';
let gameState = null;

client.connect(PLAYER_NAME)
  .then(() => {
    console.log(`[连接] 成功连接！玩家名称: ${PLAYER_NAME}`);
    console.log();
    showHelp();
    startInputLoop();
  })
  .catch((error) => {
    console.error('[连接失败]', error.message);
    process.exit(1);
  });

client.on('player_joined', (data) => {
  console.log(`[系统] 你已加入游戏，ID: ${data.player.id}`);
  console.log(`[系统] 出生位置: (${data.player.x}, ${data.player.y})`);
  console.log();
});

client.on('player_join', (data) => {
  console.log(`[系统] 玩家 ${data.name} 加入了游戏`);
});

client.on('player_leave', (data) => {
  console.log(`[系统] 玩家 ${data.playerId} 离开了游戏`);
});

client.on('player_move', (data) => {
  if (data.playerId !== client.playerId) {
    console.log(`[系统] 玩家移动到 (${data.x}, ${data.y})`);
  }
});

client.on('player_action', (data) => {
  if (data.action === 'search' && data.data.found.length > 0) {
    console.log(`[发现] 找到了 ${data.data.found.length} 个隐藏物品！`);
    data.data.found.forEach(item => {
      console.log(`  - ${item.name} (${item.rarity})`);
    });
  }
});

client.on('state_sync', (state) => {
  gameState = state;
});

client.on('delta_sync', (delta) => {
  if (gameState) {
    client.applyDelta(delta);
  }
});

client.on('item_pickup', (data) => {
  if (data.playerId === client.playerId) {
    console.log(`[拾取] 获得物品: ${data.item.name}`);
  }
});

client.on('danger_alert', (data) => {
  console.log(`[警告] 危险等级: ${data.dangerLevel} - ${data.source}`);
});

client.on('environment_change', (data) => {
  console.log(`[环境] ${data.event.type} 事件发生！`);
});

client.on('chat', (data) => {
  console.log(`[聊天] ${data.playerId}: ${data.message}`);
});

client.on('error', (data) => {
  console.error(`[错误] ${data.message}`);
});

client.on('pong', (data) => {
  if (Math.random() < 0.1) {
    console.log(`[网络] 延迟: ${data.latency}ms`);
  }
});

client.on('disconnected', (data) => {
  console.log(`[断开] 连接已断开: ${data.reason}`);
  rl.close();
  process.exit(0);
});

function showHelp() {
  console.log('可用命令:');
  console.log('  move <x> <y> [posture]  - 移动到指定位置 (posture: stand/crouch/prone)');
  console.log('  posture <stand|crouch|prone> - 切换姿势');
  console.log('  search                  - 搜索当前位置的隐藏物品');
  console.log('  pickup <item_id>        - 拾取物品');
  console.log('  use <item_id>           - 使用物品');
  console.log('  status                  - 查看当前状态');
  console.log('  env                     - 查看环境状态');
  console.log('  chat <message>          - 发送聊天消息');
  console.log('  help                    - 显示此帮助');
  console.log('  exit                    - 退出游戏');
  console.log();
}

function startInputLoop() {
  rl.question('> ', (input) => {
    handleCommand(input.trim());
    if (client.isConnectedToServer()) {
      startInputLoop();
    }
  });
}

function handleCommand(input) {
  if (!input) return;

  const parts = input.split(/\s+/);
  const command = parts[0].toLowerCase();

  switch (command) {
    case 'move':
      handleMove(parts);
      break;
    case 'posture':
      handlePosture(parts);
      break;
    case 'search':
      client.action('search');
      console.log('[动作] 正在搜索...');
      break;
    case 'pickup':
      handlePickup(parts);
      break;
    case 'use':
      handleUseItem(parts);
      break;
    case 'status':
      showStatus();
      break;
    case 'env':
      showEnvironment();
      break;
    case 'chat':
      handleChat(parts);
      break;
    case 'help':
      showHelp();
      break;
    case 'exit':
      console.log('[退出] 正在断开连接...');
      client.disconnect();
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('[错误] 未知命令，输入 help 查看可用命令');
  }
}

function handleMove(parts) {
  if (parts.length < 3) {
    console.log('[错误] 用法: move <x> <y> [posture]');
    return;
  }

  const x = parseInt(parts[1]);
  const y = parseInt(parts[2]);
  const posture = parts[3] || currentPosture;

  if (isNaN(x) || isNaN(y)) {
    console.log('[错误] 坐标必须是数字');
    return;
  }

  if (['stand', 'crouch', 'prone'].indexOf(posture) === -1) {
    console.log('[错误] 姿势必须是 stand, crouch 或 prone');
    return;
  }

  currentPosture = posture;
  client.move(x, y, posture);
  console.log(`[移动] 移动到 (${x}, ${y})，姿势: ${posture}`);
}

function handlePosture(parts) {
  const posture = parts[1];
  if (!posture || ['stand', 'crouch', 'prone'].indexOf(posture) === -1) {
    console.log('[错误] 用法: posture <stand|crouch|prone>');
    return;
  }

  currentPosture = posture;
  client.action('change_posture', { posture });
  console.log(`[姿势] 切换到: ${posture}`);
}

function handlePickup(parts) {
  const itemId = parts[1];
  if (!itemId) {
    console.log('[错误] 用法: pickup <item_id>');
    return;
  }
  client.pickupItem(itemId);
}

function handleUseItem(parts) {
  const itemId = parts[1];
  if (!itemId) {
    console.log('[错误] 用法: use <item_id>');
    return;
  }
  client.action('use_item', { item_id: itemId });
}

function handleChat(parts) {
  const message = parts.slice(1).join(' ');
  if (!message) {
    console.log('[错误] 消息不能为空');
    return;
  }
  client.chat(message);
}

function showStatus() {
  const state = client.getState();
  if (!state || !state.player) {
    console.log('[状态] 暂无数据');
    return;
  }

  const p = state.player;
  console.log('======== 玩家状态 ========');
  console.log(`  名称: ${p.name}`);
  console.log(`  位置: (${p.x}, ${p.y})`);
  console.log(`  生命值: ${p.health}/${p.max_health}`);
  console.log(`  潜行值: ${p.stealth}`);
  console.log(`  姿势: ${p.posture}`);
  console.log(`  背包: ${p.inventory}件物品`);
  console.log(`  得分: ${p.score}`);
  console.log(`  检测等级: ${p.detection_level}`);
  console.log('=========================');
  console.log();
}

function showEnvironment() {
  if (gameState && gameState.data && gameState.data.environmental_effects) {
    const env = gameState.data.environmental_effects;
    console.log('======== 环境状态 ========');
    console.log(`  时间: ${env.time_of_day}`);
    console.log(`  天气: ${env.weather}`);
    console.log(`  能见度: ${env.visibility * 100}%`);
    console.log(`  风力: ${env.wind}`);
    if (env.active_events && env.active_events.length > 0) {
      console.log(`  活跃事件: ${env.active_events.length}个`);
      env.active_events.forEach(e => {
        console.log(`    - ${e.type} (剩余${Math.ceil(e.remaining / 1000)}秒)`);
      });
    }
    console.log('=========================');
  } else {
    console.log('[环境] 暂无数据');
  }
  console.log();
}

process.on('SIGINT', () => {
  console.log();
  console.log('[退出] 正在断开连接...');
  client.disconnect();
  rl.close();
  process.exit(0);
});
