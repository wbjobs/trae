# Code Semantic Search - 代码片段语义检索与推荐工具

基于 React + FastAPI + ChromaDB + Sentence-Transformers 开发的代码片段语义检索与推荐系统。

## 功能特性

### 1. 代码片段管理
- 支持上传/粘贴代码片段
- 配置代码语言、标签、描述
- 自动向量化处理并存储到 ChromaDB 向量数据库

### 2. 语义检索功能
- 使用自然语言进行查询（如"如何实现一个带超时的HTTP请求"）
- 查询语句向量化后在向量数据库中检索
- 支持按代码语言、标签过滤结果

### 3. 代码推荐功能
- 查看某段代码时，推荐语义相似的其他代码片段
- 基于用户历史查询和查看记录的个性化推荐

### 4. 额外功能
- 代码片段语法高亮显示（Prism.js）
- 代码复制功能
- 收藏/取消收藏
- 评论功能
- 向量数据库维护（数据导入/导出、索引重建）

## 技术栈

### 后端
- **FastAPI**: Web 框架
- **ChromaDB**: 向量数据库
- **Sentence-Transformers**: 文本向量化模型
- **SQLAlchemy**: ORM 框架
- **SQLite**: 存储用户收藏和评论数据

### 前端
- **React 18**: 前端框架
- **TypeScript**: 类型安全
- **React Router**: 路由管理
- **Tailwind CSS**: 样式框架
- **Prism.js**: 代码语法高亮
- **Lucide React**: 图标库
- **Axios**: HTTP 客户端

## 项目结构

```
.
├── backend/                    # 后端代码
│   ├── app/
│   │   ├── api/               # API 路由
│   │   │   ├── snippets.py    # 代码片段相关 API
│   │   │   ├── users.py       # 用户相关 API
│   │   │   └── maintenance.py # 数据库维护 API
│   │   ├── core/              # 核心配置
│   │   │   ├── config.py      # 配置管理
│   │   │   └── database.py    # 数据库连接
│   │   ├── models/            # 数据模型
│   │   │   └── models.py      # SQLAlchemy 模型
│   │   ├── schemas/           # Pydantic 模式
│   │   │   └── schemas.py     # 请求/响应验证
│   │   └── services/          # 业务逻辑
│   │       ├── embedding_service.py     # 向量化服务
│   │       ├── vector_db_service.py     # 向量数据库操作
│   │       └── recommendation_service.py # 推荐服务
│   ├── main.py                # 应用入口
│   └── requirements.txt       # Python 依赖
├── frontend/                  # 前端代码
│   ├── src/
│   │   ├── components/        # 通用组件
│   │   │   ├── CodeBlock.tsx  # 代码高亮组件
│   │   │   ├── Navbar.tsx     # 导航栏
│   │   │   └── SnippetCard.tsx # 代码片段卡片
│   │   ├── pages/             # 页面组件
│   │   │   ├── SearchPage.tsx       # 搜索页面
│   │   │   ├── UploadPage.tsx       # 上传页面
│   │   │   ├── SnippetDetailPage.tsx # 详情页面
│   │   │   ├── FavoritesPage.tsx    # 收藏页面
│   │   │   └── MaintenancePage.tsx  # 维护页面
│   │   ├── services/          # API 服务
│   │   │   └── api.ts         # API 调用封装
│   │   ├── types/             # TypeScript 类型
│   │   │   └── index.ts       # 类型定义
│   │   ├── App.tsx            # 应用组件
│   │   ├── index.tsx          # 入口文件
│   │   └── index.css          # 全局样式
│   ├── package.json           # Node.js 依赖
│   ├── tailwind.config.js     # Tailwind 配置
│   ├── postcss.config.js      # PostCSS 配置
│   └── tsconfig.json          # TypeScript 配置
└── data/                      # 数据存储目录
    ├── chromadb/              # ChromaDB 数据
    └── sqlite/                # SQLite 数据库
```

## 安装与运行

### 前置要求

- Python 3.8+
- Node.js 16+
- npm 或 yarn

### 后端启动

1. 进入后端目录：
```bash
cd backend
```

2. 创建虚拟环境：
```bash
python -m venv venv
```

3. 激活虚拟环境：

Windows:
```bash
venv\Scripts\activate
```

macOS/Linux:
```bash
source venv/bin/activate
```

4. 安装依赖：
```bash
pip install -r requirements.txt
```

5. 启动后端服务：
```bash
python main.py
```

后端服务将运行在 `http://localhost:8000`

API 文档：`http://localhost:8000/docs`

### 前端启动

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm start
```

前端服务将运行在 `http://localhost:3000`

### 首次运行注意事项

首次启动时，Sentence-Transformers 会自动下载 `all-MiniLM-L6-v2` 模型（约 80MB），请确保网络连接正常。

## API 接口

### 代码片段管理
- `POST /api/snippets` - 创建代码片段
- `GET /api/snippets` - 获取代码片段列表
- `GET /api/snippets/{id}` - 获取单个代码片段
- `PUT /api/snippets/{id}` - 更新代码片段
- `DELETE /api/snippets/{id}` - 删除代码片段

### 搜索与推荐
- `POST /api/snippets/search` - 语义搜索
- `GET /api/snippets/{id}/similar` - 获取相似代码
- `GET /api/users/{user_id}/recommendations` - 获取个性化推荐

### 收藏与评论
- `POST /api/snippets/{id}/favorite` - 切换收藏状态
- `GET /api/snippets/{id}/is-favorite` - 检查是否已收藏
- `GET /api/snippets/{id}/comments` - 获取评论
- `POST /api/snippets/{id}/comments` - 添加评论
- `GET /api/users/{user_id}/favorites` - 获取用户收藏列表

### 数据库维护
- `GET /api/maintenance/stats` - 获取数据库统计
- `POST /api/maintenance/rebuild-index` - 重建索引
- `GET /api/maintenance/export` - 导出数据
- `POST /api/maintenance/import` - 导入数据

## 使用说明

### 1. 上传代码片段
1. 点击导航栏的"上传"按钮
2. 填写代码标题（可选）
3. 粘贴代码或从文件上传
4. 选择编程语言
5. 添加标签（用逗号分隔）
6. 填写描述（可选）
7. 点击"保存代码片段"

### 2. 语义搜索
1. 在搜索框中输入自然语言查询（如"如何实现带超时的HTTP请求"）
2. 可选择筛选编程语言
3. 点击"搜索"或按 Enter 键
4. 查看搜索结果，点击卡片查看详情

### 3. 代码详情
- 查看完整代码（带语法高亮）
- 一键复制代码
- 收藏/取消收藏
- 查看和添加评论
- 查看相似代码片段推荐

### 4. 数据库维护
- 重建索引：重新计算所有代码片段的向量
- 导出数据：将所有代码片段导出为 JSON 文件
- 导入数据：从 JSON 文件导入代码片段

## 配置说明

### 后端配置 (`backend/app/core/config.py`)

- `EMBEDDING_MODEL`: 向量化模型名称（默认：all-MiniLM-L6-v2）
- `CHROMADB_PATH`: ChromaDB 数据存储路径
- `SQLITE_DB_PATH`: SQLite 数据库路径
- `MAX_SEARCH_RESULTS`: 最大搜索结果数
- `DEFAULT_TOP_K`: 默认返回结果数

### 前端配置 (`frontend/src/services/api.ts`)

- `API_BASE_URL`: 后端 API 地址（默认：http://localhost:8000）

## 自定义模型

如需使用其他向量化模型，修改 `backend/app/core/config.py` 中的 `EMBEDDING_MODEL` 配置。

推荐模型：
- `all-MiniLM-L6-v2`（默认，速度快，适合大多数场景）
- `all-mpnet-base-v2`（更准确，速度稍慢）
- `multi-qa-MiniLM-L6-cos-v1`（针对问答场景优化）

## 许可证

MIT License
