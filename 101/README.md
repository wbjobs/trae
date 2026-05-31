# dConfig Sync — 去中心化配置同步工具

基于 **Electron + libp2p Kademlia DHT** 的去中心化配置同步桌面应用。每个节点运行独立的 libp2p 实例，加入 Kademlia DHT 网络，配置变更时发布到 DHT + gossipsub，其他节点自动拉取并自动合并冲突版本。

## 特性

- 🟣 **Electron 桌面前端**：显示网络节点数、已连接 peers、监听地址、实时事件日志、配置版本历史
- 🕸️ **Kademlia DHT**：使用 `@libp2p/kad-dht` 做分布式键值发现，支持 `put/get`
- 📡 **Pub/Sub (Gossipsub)**：配置变更时广播，实时同步
- 🤝 **自定义协议拉取快照**：新节点连接时通过 `/dconfig-sync/config/1.0.0` 协议拉取全量配置
- ⚔️ **冲突合并策略**：
  - `Last-Write-Wins (LWW)`：时间戳高的覆盖时间戳低的
  - `CRDT (LWW Register)`：基于单调时间戳的无冲突复制数据类型
- 🔐 **Noise + Yamux**：安全加密与流多路复用
- 🔌 **TCP + WebSocket**：双传输支持

## 目录结构

```
.
├── package.json
├── main.js              # Electron 主进程入口，IPC 桥接
├── preload.js           # 上下文隔离 preload，暴露 dconfig API
├── src/
│   ├── p2pNode.js       # libp2p 节点（DHT + PubSub + 自定义协议）
│   └── configStore.js   # 配置存储、版本历史、合并策略
└── renderer/
    ├── index.html       # 前端界面
    ├── app.js           # 前端逻辑
    └── styles.css       # 样式
```

## 快速开始

```bash
npm install
npm start
```

## 使用方式

1. 打开应用，点击 **"启动节点"** 启动本地 libp2p 节点
2. 在另一个终端/机器启动第二个节点：
   - 将第一个节点在界面显示的监听地址（如 `/ip4/127.0.0.1/tcp/52341/p2p/QmXxx`）填入 Bootstrap 输入框
   - 点击启动，第二个节点会自动连接并拉取配置快照
3. 在任意节点修改配置 → 通过 PubSub 实时广播 + DHT 持久化 → 其他节点自动合并

## 合并策略

在启动前或运行中切换下拉框可选择合并策略：

| 策略 | 行为 |
|------|------|
| **LWW** | 时间戳较新的覆盖较旧的；相等时间戳保留本地 |
| **CRDT** | 严格单调时间戳（`timestamp` 作 Lamport 时间），并发写以时间戳大者为准 |

## 事件

界面会记录以下事件：

- `started`：节点启动
- `peer-connect` / `peer-disconnect`：peer 连接/断开
- `config-change`：收到远端配置变更
- `snapshot-imported`：从远端拉取到全量配置快照
- `update` / `delete`：本地配置变更

## 技术栈

- Electron 31
- libp2p 1.x
- @libp2p/kad-dht 12.x
- @chainsafe/libp2p-gossipsub 13.x
- @chainsafe/libp2p-noise 15.x
- @chainsafe/libp2p-yamux 6.x
