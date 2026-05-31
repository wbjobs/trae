# 多模态文档解析工具

一个功能完整的多模态文档解析与知识提取系统，支持 PDF、Word、Excel、图片等多种文档格式的解析，并基于 LLM 实现实体抽取、关系抽取，构建文档知识图谱。

## 功能特性

### 文档解析
- **PDF 解析**: 提取文本内容、表格数据、内嵌图片
- **Word 解析**: 提取段落文本、表格、图片
- **Excel 解析**: 提取多 Sheet 表格数据，支持公式计算结果
- **图片解析**: 基于 Tesseract OCR 识别图片中的文字

### 知识提取
- **实体抽取**: 识别人物、组织、地点、时间、技术、产品等多种实体类型
- **关系抽取**: 识别实体之间的语义关系
- **知识图谱构建**: 自动构建文档知识图谱，支持可视化展示
- **双模式支持**: 支持 LLM 智能提取和规则提取两种模式

### 存储与检索
- **MongoDB 存储**: 文档内容、解析结果、知识图谱统一存储
- **文档检索**: 支持全文搜索、文件类型过滤、时间范围筛选
- **图谱查询**: 支持实体搜索、关系遍历、深度探索

## 技术架构

### 后端
- **框架**: FastAPI + Python 3.9+
- **文档解析**: pdfplumber, python-docx, openpyxl, pandas
- **OCR**: pytesseract + Tesseract-OCR
- **LLM**: LangChain + OpenAI API
- **数据库**: MongoDB + pymongo

### 前端
- **框架**: Vue 3 + TypeScript + Vite
- **UI 组件**: Element Plus
- **图表可视化**: ECharts
- **状态管理**: Pinia
- **HTTP 客户端**: Axios

## 项目结构

```
.
├── backend/                    # 后端服务
│   ├── app/
│   │   ├── main.py            # FastAPI 应用入口
│   │   ├── config.py          # 配置管理
│   │   ├── database.py        # 数据库连接
│   │   ├── parsers/           # 文档解析器
│   │   │   ├── base_parser.py
│   │   │   ├── pdf_parser.py
│   │   │   ├── word_parser.py
│   │   │   ├── excel_parser.py
│   │   │   ├── image_parser.py
│   │   │   └── parser_factory.py
│   │   ├── services/          # 业务服务
│   │   │   ├── document_service.py
│   │   │   ├── knowledge_extractor.py
│   │   │   └── graph_service.py
│   │   ├── routers/           # API 路由
│   │   │   ├── documents.py
│   │   │   └── graph.py
│   │   ├── schemas/           # 数据模型
│   │   │   └── document.py
│   │   ├── uploads/           # 上传文件存储
│   │   └── extracted_images/  # 提取图片存储
│   ├── requirements.txt       # Python 依赖
│   ├── .env.example           # 环境变量示例
│   └── start.bat              # 后端启动脚本
├── frontend/                  # 前端应用
│   ├── src/
│   │   ├── components/        # 可复用组件
│   │   │   ├── ResultDisplay.vue
│   │   │   └── GraphVisualizer.vue
│   │   ├── views/             # 页面视图
│   │   │   ├── UploadView.vue
│   │   │   ├── DocumentsView.vue
│   │   │   ├── DocumentDetailView.vue
│   │   │   └── GraphView.vue
│   │   ├── api/               # API 封装
│   │   ├── types/             # TypeScript 类型定义
│   │   ├── router/            # 路由配置
│   │   ├── assets/            # 静态资源
│   │   ├── App.vue
│   │   └── main.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── start.bat              # 前端启动脚本
├── start-backend.bat          # 根目录后端启动
├── start-frontend.bat         # 根目录前端启动
└── README.md
```

## 快速开始

### 环境要求
- Python 3.9+
- Node.js 16+
- MongoDB 4.4+
- Tesseract-OCR (可选，用于图片文字识别)

### 安装与启动

#### 1. 启动 MongoDB
确保 MongoDB 服务已启动，默认连接地址: `mongodb://localhost:27017`

#### 2. 启动后端服务
```bash
# 方式一：使用启动脚本
start-backend.bat

# 方式二：手动启动
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# 编辑 .env 配置文件
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

后端服务启动后，访问:
- API 服务: http://localhost:8000
- 交互式文档: http://localhost:8000/docs

#### 3. 启动前端服务
```bash
# 方式一：使用启动脚本
start-frontend.bat

# 方式二：手动启动
cd frontend
npm install
npm run dev
```

前端服务启动后，访问: http://localhost:5173

### 配置说明

#### 后端环境变量 (.env)
```
# MongoDB 配置
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=document_parser

# 文件存储路径
UPLOAD_DIR=./app/uploads
EXTRACTED_IMAGES_DIR=./app/extracted_images

# OpenAI 配置 (可选，用于 LLM 知识提取)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-3.5-turbo-1106

# Tesseract OCR 路径 (可选，用于图片识别)
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

## API 接口

### 文档管理
- `POST /api/documents/upload` - 上传并解析文档
- `GET /api/documents` - 获取文档列表
- `GET /api/documents/{id}` - 获取文档详情
- `POST /api/documents/search` - 搜索文档
- `DELETE /api/documents/{id}` - 删除文档
- `GET /api/documents/{id}/download` - 下载原始文档

### 知识图谱
- `GET /api/graph/document/{id}` - 获取文档知识图谱
- `POST /api/graph/search` - 搜索知识图谱
- `GET /api/graph/types/entities` - 获取所有实体类型
- `GET /api/graph/types/relations` - 获取所有关系类型

## 功能说明

### 1. 文档上传与解析
- 支持拖拽上传，多文件批量处理
- 可选择是否启用知识提取
- 实时显示解析进度和结果

### 2. 解析结果展示
- **文本内容**: 展示提取的完整文本，支持分页浏览
- **表格数据**: 结构化展示解析出的表格，支持展开/折叠
- **图片预览**: 展示文档中的图片，支持预览和 OCR 文本查看
- **知识图谱**: 使用 ECharts 力导向图可视化实体和关系

### 3. 文档管理
- 文档列表分页展示
- 支持按关键词、文件类型、时间范围搜索
- 支持文档下载和删除

### 4. 知识图谱搜索
- 按关键词搜索实体
- 按实体类型、关系类型过滤
- 可调节搜索深度，探索关联实体
- 实时图谱可视化和实体/关系列表

## 扩展开发

### 添加新的文档解析器
1. 继承 `BaseParser` 抽象类
2. 实现 `parse()` 方法
3. 在 `ParserFactory` 中注册文件扩展名映射

### 自定义实体类型
在 `knowledge_extractor.py` 中修改实体类型定义和正则规则，或在 LLM prompt 中添加新的实体类型。

## 许可证

MIT License
