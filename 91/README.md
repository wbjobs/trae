# 任务调度系统

一个基于 Go + Vue3 的任务调度系统，支持任务依赖管理和 DAG 可视化展示。

## 功能特性

- ✅ 任务增删改查
- ✅ 任务依赖管理（支持多上游依赖）
- ✅ 循环依赖检测
- ✅ DAG 有向图可视化展示
- ✅ Canvas 绘制节点和连线
- ✅ 支持拖拽节点、缩放画布、平移视图
- ✅ PostgreSQL 存储

## 技术栈

### 后端
- Go 1.21+
- Gin (Web 框架)
- GORM (ORM)
- PostgreSQL

### 前端
- Vue 3
- Vite
- Axios
- Canvas API

## 项目结构

```
task-scheduler/
├── backend/                 # Go 后端
│   ├── main.go             # 入口文件
│   ├── go.mod
│   ├── .env                # 环境变量
│   ├── init.sql            # 数据库初始化脚本
│   ├── config/
│   │   └── database.go     # 数据库配置
│   ├── models/
│   │   └── task.go         # 数据模型
│   ├── services/
│   │   └── task_service.go # 业务逻辑
│   └── handlers/
│       └── task_handler.go # API 处理器
└── frontend/               # Vue3 前端
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        ├── style.css
        ├── api/
        │   └── task.js     # API 服务
        └── components/
            ├── DAGCanvas.vue  # DAG 画布组件
            └── TaskForm.vue   # 任务表单组件
```

## 快速开始

### 1. 数据库准备

确保已安装 PostgreSQL，然后执行初始化脚本：

```bash
psql -U postgres -f backend/init.sql
```

或者手动执行 SQL 文件中的内容。

### 2. 配置环境变量

修改 `backend/.env` 文件：

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=task_scheduler
SERVER_PORT=8080
```

### 3. 启动后端

```bash
cd backend
go mod download
go run main.go
```

后端服务将在 `http://localhost:8080` 启动。

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:3000` 启动。

## API 接口

### 任务管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/tasks` | 创建任务 |
| GET | `/api/tasks` | 获取所有任务 |
| GET | `/api/tasks/:id` | 获取单个任务 |
| PUT | `/api/tasks/:id` | 更新任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |
| PATCH | `/api/tasks/:id/position` | 更新任务位置 |

### 依赖管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/dependencies` | 添加依赖 |
| DELETE | `/api/dependencies/:taskId/:upstreamTaskId` | 移除依赖 |
| GET | `/api/tasks/:id/dependencies` | 获取任务的上游依赖 |
| GET | `/api/tasks/:id/downstream` | 获取任务的下游依赖 |

### 图数据

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/graph` | 获取完整 DAG 图数据 |

## 使用说明

### 创建任务
1. 点击左侧边栏的「新增任务」按钮
2. 填写任务名称、描述、Cron 表达式
3. 点击确定保存

### 设置依赖
1. 双击画布上的任务节点，或点击左侧任务列表
2. 在弹出的编辑窗口中，选择上游任务并添加
3. 系统会自动检测循环依赖

### 画布操作
- **拖拽节点**：鼠标按住节点拖动
- **平移画布**：在空白区域按住拖动
- **缩放**：使用鼠标滚轮
- **适应视图**：点击工具栏「适应视图」按钮
- **重置视图**：点击工具栏「重置视图」按钮

### 删除任务
1. 选中要删除的任务
2. 目前删除功能需要通过 API 调用，或直接在数据库中操作

## 数据模型

### Task 任务表
- `id`: 主键
- `name`: 任务名称
- `description`: 任务描述
- `status`: 状态 (pending/running/success/failed)
- `cron_expr`: Cron 调度表达式
- `position_x`: X 坐标
- `position_y`: Y 坐标
- `created_at`: 创建时间
- `updated_at`: 更新时间

### TaskDependency 依赖表
- `id`: 主键
- `task_id`: 任务 ID
- `upstream_task_id`: 上游任务 ID
- `created_at`: 创建时间
