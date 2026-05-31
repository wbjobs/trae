# WebRTC实时协同乐谱编辑器

一个支持多人同时编辑ABC记谱法格式的实时协同乐谱编辑器。

## 技术栈

- **前端**: React + TypeScript + Fabric.js + Vite
- **后端**: Node.js + Express + Socket.IO + TypeScript
- **数据库**: PostgreSQL
- **协同算法**: CRDT (Yjs)
- **音频**: Web MIDI API / Web Audio API

## 功能特性

- 房间创建/加入
- 实时光标位置同步
- 乐谱变更的CRDT自动合并
- MIDI实时预览播放
- 五线谱和简谱两种视图切换
- 版本历史记录

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 环境变量

在 `server/.env` 中配置：

```
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/sheet_music
```

在 `client/.env` 中配置：

```
VITE_SERVER_URL=http://localhost:3001
```
