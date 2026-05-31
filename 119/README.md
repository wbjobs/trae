# 点云压缩可视化工具

基于 Babylon.js + Python 的点云压缩/解压工具，支持 LAS/LAZ 文件处理与 Draco 压缩。

## 功能特性

- LAS/LAZ 点云文件读取（支持百万级点，含 RGB）
- Draco 几何压缩（可调压缩参数）
- WebGL 着色器实时渲染
- RGB 颜色 / 高度着色模式切换
- 实时显示压缩比和渲染帧率
- 支持点大小、不透明度、自动旋转等参数调节

## 项目结构

```
.
├── server.py       # Python Flask 后端服务器
├── index.html      # 前端页面（Babylon.js 渲染）
├── requirements.txt # Python 依赖
└── README.md       # 说明文档
```

## 环境要求

- Python 3.8+
- 现代浏览器（支持 WebGL 2.0）

## 安装步骤

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 2. 启动后端服务器

```bash
python server.py
```

服务器将在 `http://localhost:5000` 启动。

### 3. 打开前端页面

直接在浏览器中打开 `index.html`，或使用任意静态服务器：

```bash
# 使用 Python 内置服务器
python -m http.server 8080
# 然后访问 http://localhost:8080
```

## 使用说明

1. **上传文件**：点击 "选择 LAS/LAZ 文件" 按钮上传点云文件
2. **调整参数**（可选）：
   - 位置量化位数：值越大精度越高，压缩比越低
   - 颜色量化位数：值越大颜色保真度越高
3. **开始压缩**：点击 "开始压缩" 按钮进行 Draco 压缩
4. **查看结果**：
   - 压缩比、压缩大小、压缩耗时实时显示
   - 点云在视口自动渲染
5. **渲染控制**：
   - 着色模式：切换 RGB 颜色或高度着色
   - 点大小：调整渲染点的大小
   - 不透明度：调整点云透明度
   - 自动旋转：开关自动旋转
   - 包围盒：显示/隐藏包围盒

## API 接口

### POST /api/compress
上传 LAS/LAZ 文件进行 Draco 压缩

**请求**：multipart/form-data，包含 `file` 字段

**响应**：
```json
{
  "numPoints": 1000000,
  "hasRGB": true,
  "originalSize": 32000000,
  "compressedSize": 8000000,
  "ratio": 4.0,
  "compressionTime": 2.3,
  "bounds": { "minX": 0, "minY": 0, "minZ": 0, "maxX": 100, "maxY": 50, "maxZ": 30 },
  "filename": "output.drc"
}
```

### GET /api/download/<filename>
下载压缩后的 .drc 文件

### GET /api/sample?count=N
生成 N 个点的示例 LAS 文件

## 技术栈

- **后端**：Python Flask + laspy + draco3d
- **前端**：Babylon.js + WebGL Shader
- **压缩算法**：Google Draco（几何压缩）
