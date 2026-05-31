# WebGPU Particle System

一个使用 WebGPU + TypeScript + WGSL 实现的高性能粒子系统，包含 10 万个粒子，支持 GPU 加速的物理模拟和渲染。

## 功能特性

- 🎮 **10 万个粒子**：GPU 加速的粒子模拟和渲染
- 🔄 **物理模拟**：粒子绕中心旋转，受 FBM 噪声场影响
- 🖱️ **相机控制**：鼠标拖拽旋转视角，滚轮缩放
- 🎨 **多种分布形态**：球体、立方体、圆盘、星系
- 🌈 **颜色主题**：彩虹、火焰、海洋、星云、柔和色
- ⚙️ **实时参数调节**：旋转速度、噪声强度可动态调整
- 🔙 **Go 后端 API**：提供粒子初始状态配置

## 技术栈

### 前端
- **WebGPU**：原生 GPU 加速
- **TypeScript**：类型安全
- **WGSL**：WebGPU 着色器语言
- **Vite**：构建工具
- **gl-matrix**：矩阵运算

### 后端
- **Go**：高性能 API 服务
- **Gin**：Web 框架

## 项目结构

```
.
├── backend/                    # Go 后端
│   ├── main.go                # API 服务入口
│   └── go.mod                 # Go 模块配置
└── frontend/                   # 前端
    ├── src/
    │   └── main.ts            # 主程序入口
    ├── shaders/
    │   ├── compute.wgsl       # 计算着色器（粒子物理）
    │   └── render.wgsl        # 渲染着色器（粒子绘制）
    ├── index.html             # HTML 入口
    ├── style.css              # 样式文件
    ├── package.json           # 前端依赖
    ├── tsconfig.json          # TypeScript 配置
    └── vite.config.ts         # Vite 配置
```

## API 接口

### GET /api/config
获取默认粒子配置（10 万个球体分布，彩虹色）

### POST /api/config
生成自定义粒子配置

请求体：
```json
{
  "distribution": "sphere",    // sphere | cube | disk | galaxy
  "colorTheme": "rainbow",     // rainbow | fire | ocean | nebula | pastel
  "count": 100000              // 1000 - 200000
}
```

### GET /api/distributions
获取可用的分布类型列表

### GET /api/themes
获取可用的颜色主题列表

## 快速开始

### 1. 启动后端服务

```bash
cd backend
go mod download
go run main.go
```

后端服务将在 `http://localhost:8080` 启动

### 2. 启动前端开发服务器

```bash
cd frontend
npm install
npm run dev
```

前端将在 `http://localhost:3000` 启动

### 3. 使用说明

- **鼠标拖拽**：旋转相机视角
- **滚轮**：缩放
- **左侧控制面板**：
  - 选择粒子分布形态
  - 选择颜色主题
  - 调整粒子数量（1000 - 200000）
  - 点击 "Regenerate" 重新生成粒子
  - 实时调节旋转速度和噪声强度

## 浏览器要求

需要支持 WebGPU 的浏览器：
- Chrome 113+
- Edge 113+
- Safari 17+（技术预览版）
- Firefox Nightly（需要启用 WebGPU 标志）

在 Chrome 地址栏输入 `chrome://flags/#enable-unsafe-webgpu` 启用 WebGPU（如果尚未默认启用）。

## 核心实现细节

### 计算着色器 (compute.wgsl)
- 使用 FBM（分形布朗运动）噪声生成自然的粒子运动
- 粒子受三种力影响：噪声力、旋转力、弹簧力（保持在中心附近）
- 速度阻尼和最大速度限制，防止粒子飞散
- 边界约束，粒子超出最大距离时反弹

### 渲染着色器 (render.wgsl)
- 使用实例化渲染，每个粒子由 2 个三角形组成（四边形）
- 基于距离的软粒子效果，圆形渐变透明度
- 加法混合模式，创建发光效果
- 基于相机距离的粒子大小自动调整

### 性能优化
- 所有粒子数据存储在 GPU 缓冲区中
- 计算和渲染完全在 GPU 上执行，CPU 只负责更新 uniform 数据
- 粒子更新使用计算着色器并行处理（256 个 workgroup）
- 实例化渲染减少 draw call 数量

## License

MIT
