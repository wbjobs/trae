# 回合制策略游戏 AI 对战系统

这是一个完整的回合制策略游戏AI对战系统，包含Python后端（游戏逻辑+AI算法）和Unity前端（游戏界面）。

## 项目结构

```
e:\trae\49\
├── backend/                    # Python 后端
│   ├── src/
│   │   ├── __init__.py
│   │   ├── constants.py        # 游戏常量定义
│   │   ├── unit.py             # 单位类
│   │   ├── terrain.py          # 地形系统
│   │   ├── battle.py           # 战斗系统核心
│   │   ├── ai.py               # AI算法（Minimax、决策树等）
│   │   ├── logger.py           # 日志和统计系统
│   │   ├── game_manager.py     # 游戏管理器
│   │   └── server.py           # WebSocket服务器
│   ├── tests/
│   │   └── test_battle.py      # 测试脚本
│   ├── logs/                   # 对战日志存储
│   ├── data/                   # 统计数据存储
│   └── requirements.txt        # Python依赖
└── UnityClient/                # Unity 前端
    └── Assets/
        └── Scripts/
            ├── Core/           # 核心脚本
            │   ├── UnitData.cs
            │   ├── TerrainData.cs
            │   ├── BattleState.cs
            │   ├── GameManager.cs
            │   └── MainThreadDispatcher.cs
            ├── Network/        # 网络通信
            │   ├── WebSocketClient.cs
            │   └── GameClient.cs
            └── UI/             # UI脚本
                ├── BattleGridUI.cs
                ├── GridCell.cs
                ├── UnitView.cs
                ├── MainMenuUI.cs
                └── BattleHUDUI.cs
```

## 游戏规则

### 基本规则
- 支持 2v2 回合制对战
- 8x8 网格地图
- 每回合单位可以移动一次+行动一次（攻击/技能/防御）
- 回合顺序由单位速度决定
- 最大回合数：50回合

### 单位类型
| 单位 | 生命 | 攻击 | 防御 | 速度 | 攻击范围 | 移动范围 | 技能 |
|------|------|------|------|------|----------|----------|------|
| 战士 | 120 | 25 | 15 | 10 | 1 | 3 | 重击、盾击 |
| 法师 | 80 | 35 | 5 | 8 | 3 | 2 | 火球术、治疗 |
| 弓箭手 | 90 | 30 | 8 | 12 | 4 | 3 | 精准射击、毒箭 |
| 坦克 | 180 | 15 | 25 | 6 | 1 | 2 | 嘲讽、坚守 |

### 地形加成
| 地形 | 攻击加成 | 防御加成 | 速度加成 | 可通行 |
|------|----------|----------|----------|--------|
| 平原 | +0% | +0% | +0% | ✓ |
| 森林 | +0% | +20% | -10% | ✓ |
| 山地 | +10% | +30% | -20% | ✓ |
| 水域 | -10% | -10% | -30% | ✗ |

## 后端部署

### 环境要求
- Python 3.8+

### 安装依赖
```bash
cd backend
pip install -r requirements.txt
```

### 启动服务器
```bash
cd backend
python -m src.server
```

服务器将在 `ws://localhost:8765` 启动。

### 运行测试
```bash
cd backend
python tests/test_battle.py
```

## Unity 前端配置

### 依赖
- Unity 2021.3+
- WebSocketSharp 库（需导入）

### 设置步骤
1. 打开 Unity，创建新项目
2. 将 `UnityClient/Assets/Scripts` 目录复制到项目中
3. 导入 WebSocketSharp 库
4. 创建两个场景：
   - `MainMenuScene` - 主菜单场景，添加 `MainMenuUI` 脚本
   - `BattleScene` - 战斗场景，添加 `BattleGridUI` 和 `BattleHUDUI` 脚本
5. 创建 Prefab：
   - `CellPrefab` - 地形格子，添加 `GridCell` 脚本
   - `UnitPrefab` - 单位，添加 `UnitView` 脚本
6. 在 Build Settings 中添加两个场景

### 使用说明
1. 启动 Python 后端服务器
2. 运行 Unity 游戏
3. 在主菜单选择单位和AI类型
4. 点击"开始游戏"进入战斗
5. 选中己方单位后，可以：
   - 点击"移动"按钮，然后点击目标格子
   - 点击"攻击"按钮，然后点击敌方单位
   - 点击技能按钮使用技能
   - 点击"防御"按钮进入防御姿态
   - 点击"结束回合"让AI行动

## AI 算法

### 可用AI类型
1. **RandomAI** - 随机选择有效行动
2. **GreedyAI** - 贪心算法，选择即时收益最高的行动
3. **MinimaxAI** - Minimax算法带Alpha-Beta剪枝（默认）
4. **DecisionTreeAI** - 决策树搜索

### Minimax 算法特点
- 支持自定义搜索深度（默认3层）
- Alpha-Beta剪枝优化
- 启发式评估函数考虑：
  - 生命值比例
  - 单位存活数量
  - 地形加成
  - 状态效果
  - 攻击距离

## API 协议

WebSocket消息格式：
```json
{
  "type": "create_battle",
  "player_units": ["warrior", "mage"],
  "enemy_units": ["archer", "tank"],
  "enemy_ai_type": "minimax"
}
```

### 消息类型
- `create_battle` - 创建战斗
- `start_battle` - 开始战斗
- `execute_action` - 执行行动
- `end_turn` - 结束回合
- `get_state` - 获取战斗状态
- `get_valid_actions` - 获取有效行动
- `execute_ai_turn` - 执行AI回合
- `ai_vs_ai` - AI vs AI模式
- `get_statistics` - 获取统计数据

## 数据存储

### 对战日志
- 存储位置：`backend/logs/`
- 格式：JSON文件，包含完整战斗过程
- 命名：`battle_{id}_{timestamp}.json`

### 统计数据
- 存储位置：`backend/data/statistics.json`
- 包含：总战斗数、胜率、AI对战统计、单位使用统计

## 扩展开发

### 添加新单位
1. 在 `constants.py` 的 `UNIT_TEMPLATES` 中添加单位模板
2. 在 `SKILLS` 中添加技能定义（如果需要）

### 添加新地形
1. 在 `constants.py` 的 `TerrainType` 枚举中添加
2. 在 `TERRAIN_BONUSES` 中添加加成数据

### 添加新AI算法
1. 在 `ai.py` 中创建新的AI类
2. 实现 `get_best_action` 方法
3. 在 `AIFactory` 中注册新AI类型

## 许可证

MIT License
