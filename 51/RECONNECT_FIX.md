# WebSocket重连修复说明

## 修复的问题

1. **WebSocket断开后无法自动重连** - 原代码中重连逻辑有问题，Promise无法正确处理递归重连
2. **重连后字幕停止渲染** - 重连成功后没有重新启动音频流
3. **缺少降级处理** - 重连失败后没有提示用户

## 修复内容

### 1. WebSocketClient 类增强 (`js/websocket-client.js`)

- 添加 `isManualDisconnect` 标记，区分用户主动断开和异常断开
- 添加 `reconnectTimer` 管理重连定时器
- 新增 `onReconnectSuccessCallback` 和 `onReconnectFailedCallback` 回调
- 重连逻辑重构：
  - 异常断开后自动尝试重连5次，每次间隔2秒
  - 重连成功后触发 `onReconnectSuccessCallback`
  - 5次重连失败后触发 `onReconnectFailedCallback`
  - 用户主动断开（调用 `disconnect()`）不会触发重连
- 新增 `reconnecting` 和 `reconnect_failed` 状态

### 2. 前端界面增强 (`index.html`)

- 添加红色提示条 `no-subtitle-banner` - 重连失败后显示"字幕服务已断开，当前为无字幕模式"
- 添加橙色提示条 `reconnecting-banner` - 重连过程中显示"正在重连字幕服务..."

### 3. 样式增强 (`css/style.css`)

- 添加 `.no-subtitle-banner` 红色渐变样式，带脉冲动画
- 添加 `.reconnecting-banner` 橙色渐变样式
- 添加 `.hidden` 通用隐藏类

### 4. 主应用逻辑增强 (`js/app.js`)

- 设置重连成功回调：重新启动音频流，恢复字幕功能
- 设置重连失败回调：清除现有字幕，显示红色提示条
- 根据连接状态显示/隐藏对应的提示条
- 更新 WebSocket 状态显示，支持 "重连中..." 和 "已断开(无字幕)" 状态
- 停止系统时清除所有提示条

## 测试方法

1. 启动服务器：
   ```bash
   cd server
   python main.py
   ```

2. 在浏览器中打开 http://localhost:8000

3. 点击"启动系统"，确认正常工作

4. 重启后端服务模拟断开：
   - 按 Ctrl+C 停止服务器
   - 观察前端显示橙色"正在重连字幕服务..."提示
   - 2秒后看到重连尝试日志
   - 在10秒内（5次 × 2秒）重启服务器
   - 观察前端恢复正常，橙色提示消失

5. 测试重连失败场景：
   - 停止服务器后不重启
   - 等待约10秒（5次重连尝试）
   - 观察前端显示红色"字幕服务已断开，当前为无字幕模式"提示
   - 人脸检测和模糊功能继续正常工作（无字幕模式）

## 状态流转

```
已连接
   ↓ (异常断开)
重连中... (显示橙色提示)
   ↓ (重试5次，间隔2秒)
   ├─ 成功 → 已连接 (隐藏提示，恢复音频流)
   └─ 失败 → 无字幕模式 (显示红色提示)
```
