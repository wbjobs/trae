# AutoScript Recorder - 桌面自动化脚本录制工具

一个功能完整的桌面自动化脚本录制与回放工具，支持全局钩子录制、脚本编辑和智能回放。

## 功能特性

### 🎯 核心功能
- **全局钩子录制**: 使用 uiohook-napi 监听全局鼠标、键盘事件
- **窗口切换检测**: 自动记录窗口切换事件
- **敏感输入过滤**: 自动检测并过滤密码框等敏感输入
- **Monaco 编辑器**: 集成 VS Code 同款编辑器，支持 JSON 语法高亮
- **智能回放引擎**: 支持条件等待、循环、变量等高级功能
- **DPI 自适应**: 自动检测屏幕缩放比例，支持跨设备回放
- **图像识别定位**: 通过 OpenCV 模板匹配，截图锚点替代绝对坐标

### 🎮 录制功能
- 鼠标移动、点击、滚轮事件
- 键盘按键、文本输入
- 窗口切换事件
- 可配置的录制选项（鼠标移动阈值等）
- 实时事件日志

### 🔧 回放引擎
- **条件等待**: 等待像素颜色变化、变量条件
- **循环控制**: 支持指定次数的循环执行
- **变量系统**: 支持变量定义、修改和引用
- **条件判断**: if/else 逻辑分支
- **播放速度调节**: 0.1x - 5x 速度控制
- **暂停/继续**: 随时暂停和恢复回放

### 🔒 安全特性
- 自动检测敏感窗口（登录、密码、银行等）
- 敏感上下文下的键盘输入自动脱敏
- 可配置的敏感窗口标题和进程列表

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动应用

```bash
npm start
```

### 开发模式

```bash
npm run dev
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+R` | 开始/停止录制 |
| `Ctrl+Shift+S` | 停止录制 |
| `Ctrl+Shift+P` | 播放/暂停 |

## 脚本格式说明

### 基本结构

```json
{
  "version": "1.0",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "description": "脚本描述",
  "variables": {
    "varName": "value"
  },
  "events": [...]
}
```

### 支持的事件类型

#### 1. 鼠标移动
```json
{
  "type": "mouseMove",
  "x": 500,
  "y": 300,
  "delay": 100
}
```

#### 2. 鼠标点击
```json
{
  "type": "mouseClick",
  "action": "down",
  "x": 500,
  "y": 300,
  "button": "left",
  "clicks": 1,
  "delay": 0
}
```

#### 3. 文本输入
```json
{
  "type": "typeText",
  "text": "Hello, World!",
  "hasSensitive": false,
  "delay": 500
}
```

#### 4. 按键
```json
{
  "type": "keyPress",
  "action": "press",
  "key": "Enter",
  "keycode": 36,
  "delay": 200
}
```

#### 5. 等待（固定时间）
```json
{
  "type": "wait",
  "duration": 1000,
  "delay": 0
}
```

#### 6. 条件等待（像素颜色）
```json
{
  "type": "wait",
  "condition": {
    "type": "pixelColor",
    "x": 100,
    "y": 100,
    "color": "ff0000",
    "tolerance": 30
  },
  "timeout": 10000,
  "interval": 500,
  "delay": 0
}
```

#### 7. 循环
```json
{
  "type": "loop",
  "times": 3,
  "events": [
    { "type": "comment", "text": "循环体" }
  ],
  "delay": 0
}
```

#### 8. 条件判断
```json
{
  "type": "if",
  "condition": {
    "type": "variable",
    "name": "counter",
    "operator": ">",
    "value": 5
  },
  "then": [
    { "type": "comment", "text": "条件满足时执行" }
  ],
  "else": [
    { "type": "comment", "text": "条件不满足时执行" }
  ],
  "delay": 0
}
```

#### 9. 设置变量
```json
{
  "type": "setVariable",
  "name": "counter",
  "value": 10,
  "delay": 0
}
```

### 变量引用

使用 `${variableName}` 语法引用变量：

```json
{
  "type": "mouseMove",
  "x": "${targetX}",
  "y": "${targetY}",
  "delay": 0
}
```

### 条件类型

#### pixelColor
检查指定位置的像素颜色：
```json
{
  "type": "pixelColor",
  "x": 100,
  "y": 100,
  "color": "ff0000",
  "tolerance": 30
}
```

#### variable
检查变量值：
```json
{
  "type": "variable",
  "name": "counter",
  "operator": ">",
  "value": 5
}
```

支持的运算符：`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `matches`

#### and/or/not
组合条件：
```json
{
  "type": "and",
  "conditions": [
    { "type": "variable", "name": "a", "operator": ">", "value": 0 },
    { "type": "variable", "name": "b", "operator": "<", "value": 10 }
  ]
}
```

## 项目结构

```
e:\trae\76\
├── main.js              # Electron 主进程
├── package.json         # 项目配置
├── index.html           # 主页面
├── css/
│   └── style.css        # 样式文件
├── src/
│   ├── hooks/
│   │   └── GlobalHook.js      # 全局钩子模块
│   ├── recorder/
│   │   └── Recorder.js        # 录制引擎
│   ├── player/
│   │   └── Player.js          # 回放引擎
│   ├── security/
│   │   └── SensitiveFilter.js # 敏感输入过滤
│   ├── utils/
│   │   └── DPIManager.js      # DPI 缩放管理器
│   └── renderer/
│       └── app.js             # 渲染进程逻辑
└── examples/
    └── example-script.json    # 示例脚本
```

## 技术栈

- **Electron**: 跨平台桌面应用框架
- **uiohook-napi**: 全局输入钩子
- **robotjs**: 自动化操作库
- **Monaco Editor**: 代码编辑器
- **active-win**: 活动窗口检测
- **OpenCV (可选)**: 高性能模板匹配
- **pngjs**: PNG 图像处理
- **pixelmatch**: 像素级图像比较
- **jimp**: JavaScript 图像处理

## 注意事项

1. **权限**: 在某些操作系统上，录制全局输入可能需要特殊权限
2. **敏感数据**: 虽然有自动过滤机制，但建议在录制前关闭敏感应用
3. **回放风险**: 回放脚本时请确保屏幕分辨率和窗口布局与录制时一致
4. **紧急停止**: 如果回放失控，可以使用 `Ctrl+Shift+P` 暂停

## 许可证

MIT License
