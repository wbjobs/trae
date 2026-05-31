# 部署指南

## 本地开发

### 方式一：使用 Docker Compose（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 访问前端
# http://localhost:3000

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 方式二：手动启动

#### 前置要求
- Node.js >= 18
- PostgreSQL >= 14

#### 步骤

1. **安装依赖**
```bash
npm install
cd server && npm install
cd ../client && npm install
```

2. **配置数据库**
```bash
# 创建数据库
createdb sheet_music

# 初始化表结构
psql -d sheet_music -f server/init-db.sql
```

3. **配置环境变量**
```bash
# 服务端
cp server/.env.example server/.env
# 修改 DATABASE_URL 为你的数据库连接字符串

# 客户端
cp client/.env.example client/.env
```

4. **启动服务**
```bash
# 启动后端 (端口 3001)
cd server && npm run dev

# 启动前端 (端口 3000)
cd client && npm run dev
```

5. **访问应用**
打开浏览器访问 http://localhost:3000

## 生产部署

### 使用 PM2 部署

```bash
# 全局安装 pm2
npm install -g pm2

# 构建前端
cd client && npm run build

# 启动后端
cd ../server
npm run build
pm2 start dist/index.js --name sheet-music-server

# 配置 nginx 反向代理
# 参考下方 nginx 配置示例
```

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 和 WebSocket
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 项目结构

```
├── client/                 # 前端应用
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── store/         # 状态管理 (Zustand)
│   │   └── utils/         # 工具函数
│   └── package.json
├── server/                # 后端服务
│   ├── src/
│   │   ├── db.ts          # 数据库操作
│   │   ├── roomManager.ts # 房间管理
│   │   └── index.ts       # 入口文件
│   ├── init-db.sql        # 数据库初始化脚本
│   └── package.json
├── examples/              # 示例乐谱
├── docker-compose.yml     # Docker 编排
└── README.md
```

## 常见问题

### 数据库连接失败
检查 PostgreSQL 是否启动，以及 `.env` 中的 `DATABASE_URL` 是否正确。

### WebSocket 连接失败
确保 Nginx 配置中正确处理了 WebSocket 升级。

### 多人协同不同步
检查 Socket.IO 连接状态，确保服务端和客户端版本兼容。
