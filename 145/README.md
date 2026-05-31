# 斗兽棋实时对战游戏

基于 Cocos Creator + TypeScript + WebSocket + Redis 的实时对战游戏

## 项目结构

```
e:\trae\145\
├── server/                 # 后端服务器
│   ├── src/
│   │   ├── index.ts       # 服务器入口
│   │   ├── types.ts       # 类型定义
│   │   ├── game/          # 游戏逻辑
│   │   │   ├── Board.ts   # 棋盘管理
│   │   │   ├── Rules.ts   # 游戏规则
│   │   │   └── Game.ts    # 游戏状态管理
│   │   ├── rooms/         # 房间管理
│   │   │   └── RoomManager.ts
│   │   ├── matchmaking/   # 匹配系统
│   │   │   └── Matchmaking.ts
│   │   ├── redis/         # Redis管理
│   │   │   └── RedisManager.ts
│   │   └── websocket/     # WebSocket服务
│   │       └── GameServer.ts
│   ├── package.json
│   └── tsconfig.json
│
└── client/                 # 前端Cocos Creator项目
    ├── assets/
    │   ├── scripts/       # TypeScript脚本
    │   │   ├── types.ts
    │   │   ├── GameConstants.ts
    │   │   ├── NetworkManager.ts
    │   │   ├── BoardView.ts
    │   │   ├── GameManager.ts
    │   │   └── Main.ts
    │   └── scenes/        # 游戏场景
    │       └── GameScene.scene
    └── settings/
```

## 游戏规则

### 棋子等级（从弱到强）
1. 鼠 - 可以进入河中，可以吃象
2. 猫
3. 狗
4. 狼
5. 豹
6. 虎 - 可以跳过河
7. 狮 - 可以跳过河
8. 象 - 不能进入河中，怕鼠

### 特殊规则
- **鼠入河**: 鼠是唯一可以进入河中的棋子
- **狮虎跳河**: 狮和虎可以横向或纵向跳过河，但河中有鼠时不能跳
- **陷阱**: 进入对方陷阱的棋子等级降为0，可以被任何棋子吃掉
- **兽穴**: 不能进入自己的兽穴，进入对方兽穴获胜

### 棋盘布局
- 8x9 的棋盘
- 中间有两条河流（3行x2列）
- 双方各有8个棋子

## 快速开始

### 1. 启动后端服务器

```bash
cd server
npm install
npm run dev
```

服务器默认运行在 `ws://localhost:8080/ws`

### 2. 启动前端

使用 Cocos Creator 打开 `client` 目录，运行 GameScene 场景

## 功能特性

### 匹配系统
- 基于 Redis 队列的匹配机制
- 自动匹配两名玩家
- 匹配超时30秒

### 实时对战
- WebSocket 实时通信
- 回合制对战
- 移动验证和游戏规则执行

### 观战模式
- 可以观看正在进行的对局
- 实时同步游戏状态

### 掉线重连
- 自动检测断线
- 10秒重连窗口期
- 重连成功后恢复游戏状态

## 协议说明

### 消息类型
- `match_request`: 请求匹配
- `match_cancel`: 取消匹配
- `match_success`: 匹配成功
- `game_state`: 游戏状态更新
- `move`: 移动棋子
- `move_result`: 移动结果
- `spectate_enter`: 进入观战
- `spectate_leave`: 离开观战
- `reconnect_request`: 重连请求
- `reconnect_success`: 重连成功
- `chat`: 聊天消息
- `game_over`: 游戏结束

### 移动请求格式
```json
{
  "type": "move",
  "data": {
    "roomId": "房间ID",
    "playerId": "玩家ID",
    "from": { "row": 0, "col": 0 },
    "to": { "row": 1, "col": 0 }
  }
}
```

## 依赖

### 后端
- ws: WebSocket 库
- ioredis: Redis 客户端
- uuid: ID生成
- typescript: 类型系统

### 前端
- Cocos Creator 3.8.0
- TypeScript

## 配置

### 环境变量
- `PORT`: 服务器端口（默认8080）
- `REDIS_URL`: Redis连接地址（默认redis://localhost:6379）

## 开发计划

- [x] 棋盘和棋子渲染
- [x] 游戏规则实现
- [x] 匹配系统
- [x] 观战模式
- [x] 掉线重连
- [ ] 排行榜
- [ ] 音效
- [ ] 棋子动画
- [ ] 移动端适配

## License

MIT
