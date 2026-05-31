# Local RAG Service

基于 FastAPI + Llama.cpp + ChromaDB 的本地检索增强生成（RAG）服务。

## 功能特性

- 📁 **文档上传**：支持 PDF 和 TXT 格式文档上传
- 🔍 **智能分块**：自动将文档分块并使用本地嵌入模型向量化
- 🗄️ **向量存储**：使用 ChromaDB 持久化存储向量
- 🤖 **本地推理**：集成 Llama.cpp 进行本地大模型推理
- ⚡ **流式输出**：支持 SSE 流式响应，实时展示生成内容
- ⚙️ **配置界面**：可调整 top_k、temperature、max_tokens 等参数

## 项目结构

```
.
├── main.py                 # FastAPI 主应用
├── config.py               # 配置管理
├── document_processor.py   # 文档处理与分块
├── embedding_manager.py    # 嵌入模型管理
├── vector_store.py         # ChromaDB 向量存储
├── llama_client.py         # Llama.cpp 客户端
├── templates/
│   └── index.html          # 前端界面
├── requirements.txt        # Python 依赖
├── .env                    # 环境变量
└── README.md               # 项目说明
```

## 安装步骤

1. **克隆项目**
```bash
cd e:\trae\158
```

2. **安装依赖**
```bash
pip install -r requirements.txt
```

3. **配置 Llama.cpp 服务**
   
   确保 Llama.cpp 服务正在运行。默认配置为 `http://localhost:8080`，可在 `.env` 文件中修改：
   ```
   LLAMA_CPP_BASE_URL=http://localhost:8080
   ```

4. **启动服务**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

5. **访问界面**
   
   打开浏览器访问：`http://localhost:8000`

## API 接口

### 文档管理

- `POST /api/upload` - 上传文档
- `GET /api/documents` - 获取文档列表
- `DELETE /api/documents/{source}` - 删除指定文档
- `DELETE /api/documents` - 清空所有文档

### 查询接口

- `POST /api/query` - 普通查询（返回完整响应）
- `POST /api/query/stream` - 流式查询（SSE）

### 配置管理

- `GET /api/config` - 获取当前配置
- `PUT /api/config` - 更新配置

### 健康检查

- `GET /api/health` - 服务健康状态

## 配置说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `CHROMA_DB_DIR` | ./chroma_db | ChromaDB 数据存储目录 |
| `COLLECTION_NAME` | documents | 集合名称 |
| `EMBEDDING_MODEL_NAME` | BAAI/bge-small-zh-v1.5 | 嵌入模型名称 |
| `EMBEDDING_DEVICE` | cpu | 嵌入模型运行设备 (cpu/cuda) |
| `CHUNK_SIZE` | 512 | 文档分块大小 |
| `CHUNK_OVERLAP` | 50 | 分块重叠大小 |
| `TOP_K` | 3 | 检索返回的文档数量 |
| `TEMPERATURE` | 0.7 | 生成温度 (0-2) |
| `MAX_TOKENS` | 2048 | 最大生成令牌数 |
| `LLAMA_CPP_BASE_URL` | http://localhost:8080 | Llama.cpp 服务地址 |

## 使用流程

1. 启动 Llama.cpp 服务
2. 启动本 RAG 服务
3. 在 Web 界面上传 PDF/TXT 文档
4. 文档自动分块并嵌入到向量数据库
5. 输入问题进行查询
6. 查看引用来源和 AI 回答

## 技术栈

- **后端框架**: FastAPI
- **向量数据库**: ChromaDB
- **嵌入模型**: sentence-transformers (BAAI/bge-small-zh-v1.5)
- **LLM 推理**: Llama.cpp
- **前端**: Tailwind CSS + 原生 JavaScript
