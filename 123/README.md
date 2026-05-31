# 在线容器终端 (Online Container Terminal)

一个基于 Web 的 Docker 容器终端应用，支持通过浏览器直接访问 Docker 容器的交互式终端。

## 功能特性

- 🐳 **Docker 容器管理** - 支持任意 Docker 镜像的容器创建和销毁
- 💻 **交互式终端** - 基于 Xterm.js 的完整终端模拟器
- 📡 **WebSocket 双向通信** - 实时 STDIN/STDOUT 绑定
- 📐 **终端大小自适应** - 自动检测窗口大小变化并同步到容器
- ⏱️ **自动超时销毁** - 闲置 10 分钟后自动销毁容器
- 📊 **实时资源监控** - 显示 CPU 和内存使用情况

## 项目结构

```
.
├── backend/              # 后端服务 (Node.js + Express + Docker SDK)
│   ├── src/
│   │   ├── index.js      # 服务器入口
│   │   ├── dockerService.js  # Docker 操作服务
│   │   └── wsServer.js   # WebSocket 服务
│   └── package.json
└── frontend/             # 前端应用 (React + Xterm.js)
    ├── src/
    │   ├── App.js        # 主应用组件
    │   ├── index.js      # 应用入口
    │   ├── styles.css    # 样式文件
    │   ├── components/
    │   │   ├── Terminal.jsx      # 终端组件
    │   │   ├── ControlPanel.jsx  # 控制面板组件
    │   │   └── StatsPanel.jsx    # 资源监控组件
    │   └── services/
    │       └── socket.js # WebSocket 服务
    ├── public/
    │   └── index.html
    └── package.json
```

## 快速开始

### 前置要求

- Node.js >= 14
- Docker (已安装并运行)
- npm 或 yarn

### 安装后端依赖

```bash
cd backend
npm install
```

### 安装前端依赖

```bash
cd frontend
npm install
```

### 启动后端服务

```bash
cd backend
npm start
```

后端服务默认运行在 http://localhost:3001

### 启动前端应用

在另一个终端中:

```bash
cd frontend
npm start
```

前端应用默认运行在 http://localhost:3000

## 使用说明

1. 打开浏览器访问 http://localhost:3000
2. 在左侧面板中输入 Docker 镜像名称（如 `alpine:latest`）
3. 点击 "启动容器" 按钮
4. 在右侧终端中开始使用容器
5. 左侧面板实时显示容器的 CPU 和内存使用情况
6. 点击 "销毁容器" 可以手动停止并删除容器

## API 接口

### REST API

- `GET /api/health` - 健康检查
- `GET /api/containers` - 获取活跃容器列表
- `GET /api/config` - 获取配置信息
- `POST /api/cleanup` - 清理所有容器

### WebSocket 消息

- `create` - 创建容器
  ```json
  { "type": "create", "image": "alpine:latest", "cmd": ["/bin/sh"] }
  ```
- `input` - 发送输入到容器
  ```json
  { "type": "input", "data": "ls -la\n" }
  ```
- `resize` - 调整终端大小
  ```json
  { "type": "resize", "cols": 80, "rows": 24 }
  ```
- `stats` - 请求容器资源统计
  ```json
  { "type": "stats" }
  ```
- `destroy` - 销毁容器
  ```json
  { "type": "destroy" }
  ```

## 配置

### 后端配置

环境变量:
- `PORT` - 服务器端口 (默认: 3001)

### 容器配置

在 `backend/src/dockerService.js` 中可以修改:

- `DEFAULT_IMAGE` - 默认镜像 (默认: `alpine:latest`)
- `IDLE_TIMEOUT` - 闲置超时时间 (默认: 10 分钟)
- 容器资源限制 (默认: 256MB 内存, 1 CPU)

## 安全注意事项

⚠️ 这是一个开发/演示项目，生产环境使用时需要注意:

- 添加用户认证
- 限制可用的镜像
- 加强容器隔离
- 添加速率限制
- 启用 HTTPS

## 技术栈

**后端:**
- Node.js
- Express.js
- Dockerode (Docker SDK)
- WebSocket (ws)

**前端:**
- React 18
- Xterm.js
- Recharts (可选，用于图表)

## License

MIT
