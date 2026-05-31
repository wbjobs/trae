# 实时人脸模糊与语音字幕系统

## 项目简介

这是一个集成了实时人脸检测、像素化模糊、语音识别和字幕渲染的Web应用系统。

### 主要功能

1. **WebAssembly人脸检测** - 使用TensorFlow.js的BlazeFace模型在浏览器端实时检测人脸
2. **像素化模糊处理** - 对检测到的人脸区域进行像素化模糊处理，保护隐私
3. **实时语音识别** - 通过WebSocket将音频流发送到后端，调用第三方语音识别服务
4. **字幕渲染** - 使用Canvas在视频流底部实时渲染识别到的文字，类似新闻直播字幕
5. **音视频同步** - 通过时间戳和延迟估计保持音视频基本同步

## 技术栈

### 前端
- HTML5 / CSS3 / JavaScript (ES6+)
- TensorFlow.js + WebAssembly后端
- Canvas API（视频处理和字幕渲染）
- WebRTC（摄像头和麦克风访问）
- WebSocket（实时通信）

### 后端
- Python 3.8+
- FastAPI（HTTP服务器）
- websockets（WebSocket服务器）
- 百度语音识别API（可替换为其他服务）

## 项目结构

```
project/
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式文件
├── js/
│   ├── face-detection.js   # 人脸检测和像素化模块
│   ├── subtitle-renderer.js # 字幕渲染模块
│   ├── websocket-client.js  # WebSocket客户端
│   └── app.js              # 主应用逻辑
├── server/
│   ├── main.py             # 启动脚本
│   ├── http_server.py      # HTTP服务器
│   ├── websocket_server.py # WebSocket服务器
│   ├── speech_recognition_service.py # 语音识别服务
│   ├── requirements.txt    # Python依赖
│   ├── .env.example        # 环境变量示例
│   └── .env                # 环境变量配置
└── README.md               # 本文件
```

## 快速开始

### 1. 安装后端依赖

```bash
cd server
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并根据需要配置：

```bash
cd server
copy .env.example .env
```

**注意**：默认启用模拟语音识别模式（`USE_MOCK_RECOGNITION=true`），无需API密钥即可测试。

### 3. 配置百度语音识别（可选）

如果需要真实的语音识别功能：

1. 访问 https://console.bce.baidu.com/ 创建应用
2. 获取 `APP_ID`、`API_KEY`、`SECRET_KEY`
3. 在 `.env` 中配置这些值
4. 设置 `USE_MOCK_RECOGNITION=false`

### 4. 启动服务器

```bash
cd server
python main.py
```

### 5. 访问应用

在浏览器中打开 http://localhost:8000

**注意**：由于浏览器安全限制，访问摄像头和麦克风需要HTTPS或localhost环境。

## 使用说明

### 控制面板

- **像素化强度** - 调整人脸模糊的程度，值越大越模糊
- **检测置信度** - 人脸检测的置信度阈值，值越高检测越严格
- **字幕大小** - 调整字幕的字体大小
- **启用人脸模糊** - 开关人脸模糊功能
- **启用字幕** - 开关字幕显示功能

### 操作步骤

1. 点击「启动系统」按钮
2. 授权浏览器访问摄像头和麦克风
3. 系统开始实时处理视频流
4. 说话时会看到实时字幕显示在视频底部
5. 点击「停止」按钮结束

## 音视频同步机制

1. 前端在发送音频块时记录当前视频时间戳
2. 后端处理后返回识别结果时带上时间戳
3. 前端通过ping/pong机制估算网络延迟
4. 根据延迟调整字幕显示时机，保持与视频同步

## 性能优化

- 使用WebAssembly加速TensorFlow.js推理
- 人脸检测结果缓存，减少重复计算
- 音频分片传输，降低内存占用
- Canvas离屏渲染，提高帧率

## 常见问题

### Q: 摄像头无法启动？
A: 请确保浏览器已授权摄像头访问权限，且摄像头未被其他程序占用。

### Q: 语音识别没有效果？
A: 检查麦克风权限是否授权，默认使用模拟模式会每隔3秒输出测试文字。

### Q: 人脸检测不准确？
A: 尝试调整「检测置信度」滑块，降低阈值可以检测到更多人脸。

### Q: 字幕延迟较高？
A: 检查网络连接，或在配置中调整音频分片大小和采样率。

## 浏览器兼容性

- Chrome 90+（推荐）
- Firefox 88+
- Edge 90+
- Safari 14+

## 许可证

MIT License
