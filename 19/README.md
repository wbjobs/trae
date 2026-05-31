# Web 3D Point Cloud Application

一个功能完整的 Web 3D 点云可视化应用，支持大规模点云的加载、GPU 聚类和交互式分析。

## 核心功能

### 1. 点云加载
- 支持 LAS/LAZ/PLY 格式
- 后端八叉树 LOD 生成
- 二进制压缩传输

### 2. GPU 聚类分割
- **K-Means**: 快速 K-Means 算法
- **DBSCAN**: GPU 加速的密度聚类初筛

### 3. 交互式可视化
- 鼠标悬停高亮：悬停簇变为半透明红色
- 其他点云自动灰显
- 流畅的 3D 交互

### 4. 颜色映射方案
- 热度图渐变
- 高度渐变
- 聚类颜色
- 原始颜色

## 项目结构

```
point-cloud-app/
├── backend/
│   ├── app.py                    # Flask API 服务
│   ├── point_cloud_processor.py  # 点云处理核心
│   ├── requirements.txt          # Python 依赖
│   ├── generate_test_data.py     # 测试数据生成
│   └── data/                     # 点云数据目录
├── src/
│   ├── main.js                   # 应用入口
│   ├── api.js                    # API 服务层
│   ├── PointCloudViewer.js       # 点云渲染引擎
│   ├── gpuClusterer.js           # GPU 聚类器
│   └── shaders.js                # WebGL 着色器
├── index.html                    # 前端页面
├── package.json                  # Node.js 依赖
└── vite.config.js                # Vite 配置
```

## 安装与运行

### 后端设置

```bash
cd backend
pip install -r requirements.txt
python generate_test_data.py  # 生成测试数据（可选）
python app.py
```

后端将在 `http://localhost:5000` 启动。

### 前端设置

```bash
npm install
npm run dev
```

前端将在 `http://localhost:3000` 启动。

## 使用说明

1. **加载点云**
   - 点击"上传点云文件"选择本地 LAS/PLY 文件
   - 或从下拉菜单选择已上传的文件
   - 点击"加载点云"按钮

2. **运行聚类**
   - 选择聚类算法（K-Means 或 DBSCAN）
   - 调整 K 值（仅 K-Means）
   - 点击"运行聚类"

3. **颜色映射**
   - 从"颜色映射方案"下拉选择
   - 支持：热度图、高度渐变、聚类颜色、原始颜色

4. **交互操作**
   - 鼠标左键：旋转视角
   - 鼠标右键：平移
   - 滚轮：缩放
   - 悬停聚类：高亮显示

## API 端点

### 文件管理
- `GET /api/files` - 列出可用文件
- `POST /api/upload` - 上传点云文件

### 点云操作
- `GET /api/load/<filename>` - 加载点云元数据
- `POST /api/octree/<filename>` - 构建八叉树 LOD
- `GET /api/octree/<filename>/nodes` - 获取 LOD 节点
- `GET /api/points/<filename>/sample` - 获取采样点

## 技术栈

### 前端
- **Three.js**: 3D 渲染引擎
- **WebGL Shaders**: GPU 加速
- **Vite**: 构建工具

### 后端
- **Flask**: Web 框架
- **Open3D**: 点云处理
- **laspy**: LAS/LAZ 格式支持
- **NumPy**: 数值计算
- **zlib**: 数据压缩

## 性能特性

- ✅ 支持 200 万+ 点云
- ✅ 八叉树 LOD 渐进式加载
- ✅ GPU 着色器加速渲染
- ✅ 二进制压缩传输
- ✅ 实时 FPS 监控

## 许可证

MIT
