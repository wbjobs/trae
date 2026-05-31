# H.265 视频帧级滤镜处理器

基于 FFmpeg WASM + WebGL + WebWorker 的浏览器端视频滤镜处理系统。

## 项目架构

```
├── backend/                 # Python FastAPI 后端
│   ├── main.py            # FastAPI 主入口
│   ├── style_transfer.py   # TensorFlow 风格迁移引擎
│   └── requirements.txt  # Python 依赖
├── frontend/                # 前端应用
│   ├── index.html        # 主页面
│   ├── css/
│   │   └── style.css     # 样式文件
│   └── js/
│       ├── app.js           # 主应用逻辑
│       ├── ffmpegDecoder.js # FFmpeg WASM 解码器
│       ├── frameBufferPool.js  # 帧缓存池
│       ├── webglRenderer.js # WebGL 滤镜渲染器
│       ├── videoEncoder.js # 视频编码器
│       └── workers/
│           └── frameProcessor.worker.js  # 帧处理 WebWorker
```

## 核心功能

1. **视频解码**: 使用 FFmpeg WASM 在浏览器端解码 H.265/HEVC 视频
2. **帧级处理**: WebWorker 多线程并行处理帧数据
3. **实时滤镜**: WebGL 硬件加速渲染 10+ 种滤镜效果
4. **风格迁移**: 集成 TensorFlow Lite 的 AI 风格迁移
5. **视频编码**: MediaRecorder API 编码输出视频

## 滤镜列表

| 滤镜 | 说明 |
|------|------|
| 素描 (Sketch) | 基于 Sobel 边缘检测的素描效果 |
| 油画 (Oil) | Kuwahara 油画效果 |
| 像素化 (Pixelate) | 马赛克像素化效果 |
| 灰度 (Grayscale) | 标准灰度转换 |
| 复古棕 (Sepia) | 怀旧褐色调 |
| 模糊 (Blur) | 高斯模糊 |
| 锐化 (Sharpen) | USM 锐化 |
| 边缘检测 (Edge) | Sobel 边缘检测 |
| 复古风格 (Vintage) | 老电影效果 |
| 卡通化 (Cartoon) | 卡通渲染效果 |
| 风格迁移 (Style Transfer) | AI 艺术风格迁移 |

## 快速开始

### 1. 启动后端服务

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端服务将在 `http://localhost:8000` 启动

### 2. 启动前端服务

由于使用了 ES Modules 和 WebWorker，需要通过 HTTP 服务器访问前端：

```bash
cd frontend
python -m http.server 8080
```

然后在浏览器中打开 `http://localhost:8080`

### 3. 使用说明

1. 点击上传区域或拖拽 HEVC/H.265 视频文件
2. 点击"提取帧"按钮从视频中提取帧
3. 从下拉菜单选择滤镜效果
4. 调整滤镜参数（实时预览）
5. 点击"应用滤镜"处理所有帧
6. 点击"编码输出"生成处理后的视频

## API 接口

### 健康检查
```
GET /health
```

### 获取可用风格
```
GET /styles
```

### 单帧风格迁移
```
POST /stylize/single
Content-Type: multipart/form-data

file: 图片文件
style: 风格名称 (van_gogh/picasso/monet/sketch)
```

### 批量风格迁移
```
POST /stylize/batch
Content-Type: application/json

{
  "frames": [
    {
      "frame_index": 0,
      "image_base64": "base64编码的图片数据"
    }
  ],
  "style": "van_gogh"
}
```

### 查询任务状态
```
GET /tasks/{task_id}
```

## 技术细节

### 帧缓存池优化

- 实现了循环帧缓存池，避免频繁的内存分配和释放
- 支持 LRU 缓存策略，自动回收旧帧
- 线程安全的帧访问机制

### WebWorker 多线程

- 可配置的工作线程数 (1-8)
- 帧数据通过 Transferable Objects 传输，避免复制开销
- 任务队列管理，自动负载均衡

### WebGL 渲染

- 所有滤镜均为 GLSL 片段着色器实现
- 支持实时参数调整
- 硬件加速，60fps 实时预览

## 浏览器兼容性

- Chrome 69+
- Firefox 63+
- Safari 15+
- Edge 79+

需要支持：
- WebAssembly
- WebGL 1.0
- Web Workers
- MediaRecorder API
- OffscreenCanvas (可选)

## 性能优化建议

1. **内存管理**: 及时调用 `destroy()` 方法释放资源
2. **帧采样**: 处理长视频时，设置合理的 `maxFrames`
3. **WebWorker 数量**: 根据 CPU 核心数调整工作线程数
4. **WebGL 纹理**: 复用纹理对象，避免频繁创建销毁

## 许可证

MIT License
