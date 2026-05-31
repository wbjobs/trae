# H3 地理空间聚类可视化工具

## 项目概述

这是一个高性能的地理空间聚类可视化工具，用于处理百万级出租车 GPS 轨迹数据。系统采用 H3 (Uber's Hexagonal Hierarchical Spatial Index) 进行空间聚合，结合 Deck.gl 实现交互式可视化。

## 技术栈

### 后端
- **FastAPI**: 高性能 Python Web 框架
- **Uber H3 (h3-py)**: 六边形空间索引库
- **Redis**: 缓存层，加速重复查询
- **Pandas/Numpy**: 数据处理和加速计算
- **Uvicorn**: ASGI 服务器

### 前端
- **React 18 + TypeScript**: UI 框架
- **Deck.gl**: WebGL 驱动的地理空间可视化库
- **H3-js**: JavaScript 版 H3 库
- **Vite**: 构建工具

## 核心功能

1. **百万级数据聚合**: 高效处理百万级 GPS 点数据
2. **H3 多分辨率聚合**: 支持分辨率 6-10 的动态聚合
3. **双指标可视化**: 每个六边形显示点数量和平均速度
4. **上卷/下钻**: 点击六边形下钻，按钮上卷，支持完整的层级导航
5. **Redis 缓存**: 自动缓存查询结果，显著提升响应速度
6. **3D 可视化**: 支持 3D 高度可视化，高度与点数量成正比
7. **双着色模式**: 支持按点数量或平均速度着色

## 项目结构

```
h3-clustering-tool/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI 主应用
│   │   ├── models.py            # Pydantic 数据模型
│   │   ├── data_loader.py       # 数据加载器 (已修复边界问题)
│   │   ├── h3_aggregator.py     # H3 聚合器 (已修复边界问题)
│   │   └── cache.py             # Redis 缓存管理
│   ├── data/                    # 数据目录
│   ├── generate_data.py         # 模拟数据生成器
│   ├── test_boundary_fix.py     # 边界修复测试套件
│   ├── requirements.txt
│   ├── .env.example
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx              # 主应用组件
│   │   ├── api.ts               # API 调用封装
│   │   ├── types.ts             # TypeScript 类型定义
│   │   └── utils.ts             # 工具函数
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── .env
└── README.md
```

## 快速开始

### 前置要求

- Python 3.8+
- Node.js 16+
- Redis 6.0+ (可选，用于缓存)

### 后端安装与启动

1. **进入后端目录**
```bash
cd backend
```

2. **创建虚拟环境并安装依赖**
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，配置 Redis 连接信息
```

4. **生成模拟数据 (100万点)**
```bash
python generate_data.py --points 1000000 --city shanghai
```

5. **启动 Redis (如果使用缓存)**
```bash
# Windows: 启动 Redis 服务
# macOS/Linux:
redis-server
```

6. **启动后端服务**
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端 API 文档: http://localhost:8000/docs

### 前端安装与启动

1. **进入前端目录**
```bash
cd frontend
```

2. **安装依赖**
```bash
npm install
```

3. **启动开发服务器**
```bash
npm run dev
```

前端访问地址: http://localhost:3000

## API 文档

### 1. 获取聚合数据

**GET** `/aggregate/{resolution}`

查询参数:
- `resolution`: H3 分辨率 (6-10)
- `min_lng`, `min_lat`, `max_lng`, `max_lat`: 可选的边界框
- `parent_hex`: 可选的父六边形 ID (用于精确下钻)
- `use_cache`: 是否使用缓存 (默认 true)

**POST** `/aggregate`

请求体:
```json
{
  "resolution": 8,
  "bbox": [121.45, 31.21, 121.50, 31.25],
  "parent_hex": "88308209e1fffff",
  "use_cache": true
}
```

### 2. 精确下钻 (推荐)

**POST** `/drilldown`

请求体:
```json
{
  "parent_hex_id": "88308209e1fffff",
  "target_resolution": 9,
  "bbox": [121.45, 31.21, 121.50, 31.25],
  "use_cache": true
}
```

> **重要**: 下钻时使用此端点可以避免边界漏点问题。

### 3. 获取统计信息

**GET** `/stats`

### 4. 清除缓存

**POST** `/cache/clear`

### 5. 重新加载数据

**POST** `/data/reload`

## 边界漏点问题修复说明

### 问题描述

当从分辨率 8 下钻到分辨率 9 时，某些边界附近的六边形会消失。这是因为：

1. **简单矩形裁剪**: 使用 `lng >= min_lng & lng <= max_lng` 的简单矩形裁剪
2. **H3 六边形特性**: H3 六边形是不规则蜂窝网格，边界处六边形的中心点可能落在 bbox 外
3. **缺少动态扩展**: bbox 没有根据 H3 分辨率动态扩展

### 修复方案

#### 1. 动态 bbox 扩展 (`data_loader.py`)
```python
# 根据 H3 分辨率动态扩展 bbox 边界
# 扩展量 = 六边形直径 × 2.5 / 111000 (转换为度数)
padding = self._get_h3_hexagon_diameter(resolution)
bbox = [
    min_lng - padding, min_lat - padding,
    max_lng + padding, max_lat + padding
]
```

#### 2. H3 多边形精确裁剪 (`h3_aggregator.py`)
```python
# 使用三层检测判断六边形是否与 bbox 相交:
# 1. 检查六边形边界顶点是否在 bbox 内
# 2. 检查六边形中心点是否在 bbox 内
# 3. 检查 bbox 角落是否在六边形附近
def _hex_intersects_bbox(hex_id: str, bbox: List[float]) -> bool
```

#### 3. 父六边形精确过滤 (`h3_aggregator.py`)
```python
# 下钻时，通过 parent_hex 参数精确指定父六边形
# 预先计算所有子六边形 ID，然后用集合 membership 过滤
expected_children = set(h3.h3_to_children(parent_hex, resolution))
mask = np.array([h in expected_children for h in hex_ids])
```

#### 4. 父子一致性校验 (`h3_aggregator.py`)
```python
# 验证子六边形点数之和等于父六边形点数
def validate_parent_child_consistency(...) -> Dict[str, Any]
```

### 修复验证

运行测试套件验证修复效果:
```bash
cd backend
python test_boundary_fix.py
```

测试包括:
1. 动态 bbox padding 计算
2. H3 多边形相交检测
3. 父子下钻一致性
4. 边界边缘场景模拟
5. 跨分辨率点计数一致性
6. 父六边形过滤

## 操作指南

### 基本操作

- **缩放**: 鼠标滚轮 / 双指捏合
- **平移**: 鼠标拖拽 / 双指拖动
- **旋转**: 右键拖拽 / Ctrl + 拖拽
- **倾斜**: 中键拖拽 / Shift + 拖拽

### 上卷下钻

1. **下钻**: 点击任意六边形，系统会自动下钻到下一个分辨率，并以该六边形为中心
2. **上卷**: 点击"上卷"按钮，返回到上一个分辨率
3. **分辨率滑块**: 直接拖动滑块切换分辨率
4. **下钻路径**: 点击控制面板中的历史记录快速跳转到任意层级

### 显示设置

- **着色模式**: 切换按点数量或平均速度着色
- **高度缩放**: 调整 3D 高度比例
- **显示标签**: 开关六边形上的文字标签

## 性能优化

### 后端优化

1. **Numpy 向量化**: 使用 numpy 数组操作替代 Python 循环，性能提升 5-10 倍
2. **Redis 缓存**: 相同查询直接返回缓存结果，响应时间 < 10ms
3. **bbox 过滤**: 只处理视口范围内的数据，减少计算量
4. **动态扩展**: 仅在必要时扩展 bbox，平衡精度和性能

### 前端优化

1. **Deck.gl WebGL 渲染**: 百万级六边形流畅渲染
2. **视口查询**: 只请求当前视口内的数据
3. **增量更新**: 分辨率切换时平滑过渡
4. **条件渲染**: 六边形数量 > 500 时自动隐藏标签

## H3 分辨率参考

| 分辨率 | 六边形边长 | 面积 | 典型用途 |
|--------|-----------|------|---------|
| 6 | ~3.23 km | ~36 km² | 城市级 |
| 7 | ~1.22 km | ~5 km² | 区县级 |
| 8 | ~461 m | ~0.7 km² | 街道级 (默认) |
| 9 | ~174 m | ~0.1 km² | 社区级 |
| 10 | ~66 m | ~0.015 km² | 地块级 |

## 常见问题

### Q: 为什么下钻时有些六边形消失了？
A: 这是边界裁剪问题。**修复方案已实施**，请使用 `/drilldown` 端点或传递 `parent_hex` 参数。

### Q: 如何处理真实的出租车轨迹数据？
A: 将你的 CSV 文件放到 `backend/data/` 目录，确保包含 `lat`, `lng`, `speed` 列，然后修改 `.env` 中的 `DATA_PATH`。

### Q: 可以不使用 Redis 吗？
A: 可以。如果没有 Redis，系统会自动禁用缓存功能，所有请求实时计算。

### Q: 如何添加 Mapbox 底图？
A: 在 `frontend/src/App.tsx` 中设置 `MAPBOX_ACCESS_TOKEN`。

## 许可证

MIT License
