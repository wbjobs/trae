# ✋ 手势分类器 - TensorFlow.js + MediaPipe + Node.js + MinIO

一个完整的浏览器内手势分类系统，支持实时采集、训练和推理。

## 功能特性

- 🎥 **实时手势关键点采集** - 使用 MediaPipe Hands 获取手部21个3D关键点
- 🤖 **MLP 分类器** - 使用 TensorFlow.js 在浏览器内训练神经网络
- 📊 **训练可视化** - 实时显示训练曲线（Loss 和 Accuracy）
- 🎯 **实时推理** - 训练后可立即进行手势识别
- 💾 **模型持久化** - 训练好的模型权重存储到 MinIO 对象存储
- 👆 **3类手势支持** - 握拳、五指张开、OK

## 技术栈

### 前端
- **MediaPipe Hands** - 手部关键点检测（21个3D关键点）
- **TensorFlow.js** - 浏览器内深度学习训练和推理
- **Chart.js** - 训练曲线可视化
- 纯 HTML/CSS/JavaScript，无需构建工具

### 后端
- **Node.js + Express** - REST API 服务
- **MinIO** - 对象存储，用于保存训练好的模型
- **Multer** - 文件上传处理

## 项目结构

```
gesture-classifier/
├── public/
│   ├── index.html      # 主页面
│   └── app.js          # 前端应用逻辑
├── server.js           # Node.js 后端服务
├── package.json        # 项目依赖
├── docker-compose.yml  # MinIO 服务配置
├── .env                # 环境变量
└── .env.example        # 环境变量示例
```

## 快速开始

### 1. 启动 MinIO 服务

使用 Docker 启动 MinIO：

```bash
docker-compose up -d
```

MinIO 控制台将在 http://localhost:9001 可用
- 用户名: `minioadmin`
- 密码: `minioadmin`

### 2. 安装 Node.js 依赖

```bash
npm install
```

### 3. 启动后端服务

```bash
npm start
```

或者使用开发模式（自动重启）：

```bash
npm run dev
```

### 4. 访问应用

在浏览器中打开 http://localhost:3000

## 使用说明

### 数据采集阶段

1. 允许浏览器访问摄像头
2. 选择要采集的手势（握拳、五指张开、OK）
3. 按下 **R 键** 或点击"开始采集"按钮
4. 系统将自动采集30帧数据（约1-2秒）
5. 对所有3类手势重复此过程
6. 建议每类手势至少采集30个样本

### 模型训练

1. 确保每类手势至少有10个样本
2. 点击"训练模型"按钮
3. 观察训练曲线，等待50个epoch完成
4. 训练完成后，模型自动保存在内存中

### 实时推理

1. 训练完成后，点击"开始推理"按钮
2. 在摄像头前做出手势
3. 查看实时预测置信度和结果
4. 置信度 > 70% 会显示确定结果
5. 置信度 40%-70% 显示可能结果

### 模型管理

- **保存模型** - 输入模型名称，点击"保存到服务器"，模型将存储到 MinIO
- **列出模型** - 查看所有已保存的模型
- **加载模型** - 加载之前保存的模型进行推理
- **删除模型** - 从 MinIO 删除不需要的模型

## API 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/model/save` | 保存模型到 MinIO |
| GET | `/api/model/:objectName` | 从 MinIO 加载模型 |
| GET | `/api/models` | 列出所有模型 |
| DELETE | `/api/model/:objectName` | 删除模型 |
| GET | `/api/health` | 健康检查 |

## 模型架构

MLP 分类器结构：

```
输入层 (63个特征 = 21关键点 × 3坐标)
    ↓
Dense(64, ReLU) + Dropout(0.3)
    ↓
Dense(32, ReLU) + Dropout(0.2)
    ↓
Dense(16, ReLU)
    ↓
输出层 (3, Softmax)
```

训练参数：
- 优化器: Adam (learning rate = 0.001)
- 损失函数: Categorical Crossentropy
- 批次大小: 16
- Epochs: 50
- 验证集比例: 20%

## 关键点预处理

1. **平移归一化** - 以手腕点（第0个关键点）为原点
2. **尺度归一化** - 除以最大距离进行尺度归一化
3. **特征向量化** - 将21个3D关键点展平为63维特征向量

## 环境变量

复制 `.env.example` 为 `.env` 并根据需要修改：

```bash
cp .env.example .env
```

| 变量 | 默认值 | 描述 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| MINIO_ENDPOINT | localhost | MinIO 地址 |
| MINIO_PORT | 9000 | MinIO 端口 |
| MINIO_USE_SSL | false | 是否使用 SSL |
| MINIO_ACCESS_KEY | minioadmin | MinIO 访问密钥 |
| MINIO_SECRET_KEY | minioadmin | MinIO 秘密密钥 |
| MINIO_BUCKET | gesture-models | 存储桶名称 |

## 注意事项

1. **浏览器兼容性** - 建议使用 Chrome 或 Edge 浏览器
2. **HTTPS 要求** - MediaPipe 需要 HTTPS 或 localhost 才能访问摄像头
3. **光照条件** - 良好的光照可以提高关键点检测精度
4. **背景简洁** - 简洁的背景有助于减少误检
5. **手势多样性** - 采集时尝试不同角度和距离，提高模型泛化能力

## 故障排除

### 摄像头无法访问
- 检查浏览器权限设置
- 确保没有其他应用占用摄像头
- 尝试使用 HTTPS 访问

### MinIO 连接失败
- 确认 Docker 容器正在运行：`docker ps`
- 检查 MinIO 端口是否被占用
- 验证 `.env` 中的配置是否正确

### 模型训练准确率低
- 增加每类手势的样本数量（建议每类50+）
- 确保采集时手势清晰、角度多样
- 尝试重新训练

## 许可证

MIT License
