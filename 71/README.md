# 多人视频批注系统

一个支持多人同时观看同一视频并实时同步批注的Web应用。

## 功能特性

- 🎬 **视频播放同步**：多人同时观看，播放/暂停/跳转实时同步
- ✏️ **实时批注**：支持箭头、矩形、文本三种批注类型
- 🔄 **WebSocket实时同步**：所有批注和操作即时同步给所有观看者
- 👥 **用户权限管理**：主持人和观众角色，主持人可清除所有批注
- 💾 **数据持久化**：MongoDB存储批注数据，附带时间戳和坐标
- 🎨 **多种颜色**：6种批注颜色可选
- 📱 **响应式Canvas**：批注坐标自动适配不同屏幕尺寸

## 技术栈

- **后端**：Node.js + Express + Socket.io + MongoDB
- **前端**：原生HTML5 + CSS3 + JavaScript + Canvas API
- **实时通信**：WebSocket (Socket.io)
- **数据库**：MongoDB + Mongoose

## 项目结构

```
video-annotation/
├── models/
│   ├── Annotation.js      # 批注数据模型
│   └── Room.js            # 房间数据模型
├── public/
│   ├── index.html         # 首页（创建/加入房间）
│   ├── room.html          # 视频房间页面
│   ├── style.css          # 样式文件
│   └── app.js             # 前端核心逻辑
├── server.js              # 服务器入口
├── package.json
└── README.md
```

## 安装和运行

### 前置要求

- Node.js >= 14.0.0
- MongoDB >= 4.0

### 安装依赖

```bash
npm install
```

### 启动MongoDB

确保MongoDB服务已启动，默认连接地址：`mongodb://localhost:27017/video-annotation`

### 启动服务

```bash
npm start
```

或使用开发模式（自动重启）：

```bash
npm run dev
```

服务将在 `http://localhost:3000` 启动

## 使用说明

### 1. 创建房间

1. 访问 `http://localhost:3000`
2. 输入昵称和视频URL（MP4格式）
3. 点击"创建房间"
4. 复制房间ID分享给其他用户

### 2. 加入房间

1. 访问 `http://localhost:3000`
2. 输入昵称和房间ID
3. 点击"加入房间"

### 3. 使用批注工具

- **箭头**：在视频画面上拖拽绘制箭头
- **矩形**：在视频画面上拖拽绘制矩形框
- **文本**：点击视频画面，输入文本内容
- **删除**：选择删除工具后点击批注可删除
- **清除所有**：主持人可一键清除所有批注

### 4. 视频同步

- 任何用户的播放、暂停、跳转操作都会同步给所有其他用户
- 批注会关联当前视频时间戳，在对应时间点显示

## API接口

### 创建房间
```
POST /api/room/create
Body: { userName, videoUrl }
Response: { roomId, hostId, videoUrl, hostName }
```

### 获取房间信息
```
GET /api/room/:roomId
Response: { roomId, videoUrl, hostName }
```

### 获取房间批注
```
GET /api/room/:roomId/annotations
Response: [Annotation]
```

## WebSocket事件

### 客户端发送

- `join-room`: 加入房间
- `video-control`: 视频控制（play/pause/seek）
- `sync-time`: 同步播放时间
- `annotation`: 发送批注
- `delete-annotation`: 删除批注
- `clear-annotations`: 清除所有批注（仅主持人）

### 服务端推送

- `room-state`: 房间状态
- `user-joined`: 用户加入
- `user-left`: 用户离开
- `host-changed`: 主持人变更
- `video-play`: 播放视频
- `video-pause`: 暂停视频
- `video-seek`: 跳转视频
- `annotation`: 新批注
- `annotation-deleted`: 批注已删除
- `annotations-cleared`: 所有批注已清除

## 数据模型

### Annotation（批注）

```javascript
{
  roomId: String,           // 房间ID
  type: String,             // 类型: arrow/rectangle/text
  data: Mixed,              // 批注数据（坐标、文本等）
  timestamp: Number,        // 视频时间戳（秒）
  userId: String,           // 用户ID
  userName: String,         // 用户名
  color: String,            // 颜色
  createdAt: Date           // 创建时间
}
```

### Room（房间）

```javascript
{
  roomId: String,           // 房间ID
  videoUrl: String,         // 视频URL
  hostId: String,           // 主持人ID
  hostName: String,         // 主持人名称
  createdAt: Date           // 创建时间
}
```

## 注意事项

1. 视频URL需要支持CORS跨域访问
2. 批注会在当前时间戳±5秒范围内显示
3. 用户只能删除自己的批注，主持人可以删除所有批注
4. 主持人离开后，系统会自动将第一个用户提升为主持人
