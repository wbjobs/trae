# 多模态搜索系统

基于 CLIP + ChromaDB + Cross-Encoder 的图文混合搜索系统，支持用户输入文本描述或上传图片，返回相关的图片和文本片段。

## 功能特性

- 🔍 **多模态搜索**: 支持纯文本、纯图片、图文混合查询
- 🖼️ **CLIP 模型**: 使用 HuggingFace Transformers 的 CLIP 模型进行图文嵌入
- 💾 **向量数据库**: 使用 ChromaDB 进行高效的向量相似度搜索
- 📊 **结果重排序**: 使用 Cross-Encoder 对搜索结果进行智能重排序
- 🌐 **Web 界面**: 美观的前端界面，支持拖拽上传图片
- ⚡ **FastAPI 后端**: 高性能的 RESTful API，支持自动文档

## 技术架构

```
用户输入 (文本/图片)
    ↓
CLIP 模型 (openai/clip-vit-base-patch32)
    ↓ 生成嵌入向量
ChromaDB 向量数据库
    ↓ 相似度搜索
初步搜索结果 (Top-K * 3)
    ↓
Cross-Encoder (cross-encoder/ms-marco-MiniLM-L-6-v2)
    ↓ 智能重排序
最终排序结果
    ↓
前端展示
```

## 项目结构

```
multimodal-search/
├── backend/
│   └── app/
│       ├── __init__.py
│       ├── main.py              # FastAPI 主应用
│       └── models.py            # Pydantic 数据模型
├── services/
│   ├── __init__.py
│   ├── clip_service.py          # CLIP 嵌入服务
│   ├── vector_db.py             # ChromaDB 向量数据库服务
│   └── cross_encoder.py         # Cross-Encoder 重排序服务
├── static/
│   └── index.html               # 前端页面
├── scripts/
│   └── index_samples.py         # 示例数据索引脚本
├── data/
│   ├── uploads/                 # 上传图片存储目录
│   └── chroma_db/               # ChromaDB 持久化目录
├── requirements.txt             # Python 依赖
├── .env                         # 环境配置
├── start.bat                    # Windows 启动脚本
├── start_celery.bat             # Celery Worker 启动脚本
├── celery_app.py                # Celery 应用配置
└── README.md                    # 项目说明
```

## 快速开始

### 1. 环境要求

- Python 3.8+
- 推荐使用虚拟环境

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 索引示例数据（可选）

```bash
python scripts/index_samples.py
```

### 4. 启动服务

**Windows 用户**:
```bash
start.bat
```

**通用方式**:
```bash
python -m backend.app.main
```

### 5. 访问应用

- 前端界面: http://localhost:8000
- API 文档: http://localhost:8000/docs

## 使用说明

### 搜索功能

1. **纯文本搜索**: 在搜索框输入描述文本，点击"搜索"
   - 示例: "蓝色的汽车"、"可爱的猫咪"

2. **纯图片搜索**: 上传一张图片，留空文本框，点击"搜索"

3. **图文混合搜索**: 同时输入文本描述和上传图片
   - 示例: 上传一张汽车图片，文本输入"蓝色的，类似这样的"

### 上传索引

1. 切换到"上传索引"标签页
2. 上传图片（必填）
3. 可选：添加文本描述帮助更好地索引
4. 点击"上传并索引"

### 管理功能

1. 切换到"管理"标签页
2. 查看所有已索引的项目
3. 清空所有索引（谨慎操作）

### 搜索选项

- **使用 Cross-Encoder 重排序**: 对初步搜索结果进行语义重排序，提高准确性
- **混合排序**: 结合向量相似度和 Cross-Encoder 分数进行综合排序

## API 接口

### 搜索接口

- `POST /api/upload-and-search` - 上传图片并搜索（支持图文混合）
- `POST /api/search/text` - 纯文本搜索
- `POST /api/search/image` - 图片搜索
- `POST /api/search/multimodal` - 多模态搜索

### 索引接口

- `POST /api/upload` - 上传图片并索引
- `POST /api/index/text` - 索引文本
- `POST /api/index/image` - 索引图片路径

### 管理接口

- `GET /api/stats` - 获取系统统计
- `GET /api/items` - 获取所有索引项目
- `DELETE /api/items/{id}` - 删除指定项目
- `DELETE /api/items` - 清空所有索引

## 配置说明

编辑 `.env` 文件可调整配置：

```env
CLIP_MODEL_NAME=openai/clip-vit-base-patch32           # CLIP 模型名称
CROSS_ENCODER_MODEL_NAME=cross-encoder/ms-marco-MiniLM-L-6-v2  # Cross-Encoder 模型
CHROMA_PERSIST_DIR=./data/chroma_db                    # ChromaDB 存储目录
CHROMA_COLLECTION_NAME=multimodal_search               # 集合名称
UPLOAD_DIR=./data/uploads                              # 上传目录
MAX_UPLOAD_SIZE=10485760                               # 最大上传大小 (10MB)
PORT=8000                                              # 服务端口
HOST=0.0.0.0                                           # 监听地址
```

## 模型说明

### CLIP (Contrastive Language-Image Pre-training)

- **用途**: 将文本和图片映射到同一向量空间
- **模型**: `openai/clip-vit-base-patch32`
- **嵌入维度**: 512 维
- **特点**: 支持零样本学习，能够理解图文语义关联

### Cross-Encoder

- **用途**: 对搜索结果进行语义重排序
- **模型**: `cross-encoder/ms-marco-MiniLM-L-6-v2`
- **特点**: 直接计算查询和候选结果的相似度，比双编码器更准确

### ChromaDB

- **用途**: 向量数据库，存储和检索嵌入向量
- **相似度度量**: 余弦相似度
- **特点**: 轻量级、持久化、易于集成

## 性能优化建议

1. **GPU 加速**: 安装 CUDA 版本的 PyTorch 可显著提升速度
2. **批量索引**: 大量数据建议使用批量索引接口
3. **缓存策略**: 可考虑对高频查询结果进行缓存
4. **增量更新**: 新增数据时只索引新增部分

## 常见问题

**Q: 首次启动很慢？**
A: 首次启动需要下载 CLIP 和 Cross-Encoder 模型（约 600MB），请耐心等待。

**Q: 如何更换 CLIP 模型？**
A: 修改 `.env` 文件中的 `CLIP_MODEL_NAME`，支持 HuggingFace 上的任何 CLIP 模型。

**Q: 搜索结果不准确怎么办？**
A: 1. 确保索引了足够多的数据；2. 尝试使用图文混合查询；3. 开启 Cross-Encoder 重排序。

**Q: 如何清空所有数据？**
A: 在管理标签页点击"清空所有索引"，或删除 `data/chroma_db` 目录。

## 许可证

MIT License
