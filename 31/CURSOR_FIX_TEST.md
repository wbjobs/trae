# 光标冲突修复验证指南

## 问题描述

在实时协作场景中，当两个用户在同一小节同一拍位置同时移动光标时，后端CRDT合并算法会出现状态分叉，导致光标位置互相覆盖。

## 修复方案

### 核心算法：Lamport时间戳 + 优先级判定

#### 1. Lamport时钟算法
- 每个客户端维护一个本地Lamport时钟
- 发送事件前：`clock = clock + 1`
- 接收事件后：`clock = max(localClock, remoteClock) + 1`

#### 2. 冲突解决策略
```
if (incoming.lamportTime > existing.lamportTime):
    accept incoming
elif (incoming.lamportTime == existing.lamportTime):
    if (incoming.userId > existing.userId):
        accept incoming
    else:
        reject incoming
else:
    reject incoming
```

#### 3. 后端权威状态
- 后端维护每个房间的权威光标状态
- 所有光标更新必须经过后端验证
- 被拒绝的更新会收到`cursor-rejected`事件，包含正确的状态

## 验证方法

### 测试场景1：同时移动光标

**步骤：**
1. 打开两个浏览器窗口，加入同一个房间
2. 在两个窗口中同时快速移动鼠标到相同位置
3. 观察两个窗口的光标显示

**预期结果：**
- 两个窗口显示的光标位置一致
- 不会出现光标"打架"或互相覆盖的情况
- 控制台不会输出光标被拒绝的警告（正常情况）

### 测试场景2：网络延迟模拟

**使用Chrome DevTools模拟网络延迟：**
1. 打开DevTools -> Network -> Throttling
2. 为两个窗口设置不同的延迟（如200ms和500ms）
3. 同时移动光标

**预期结果：**
- 即使网络延迟不同，最终光标状态一致
- 时间戳较大的更新获胜

### 测试场景3：新用户加入

**步骤：**
1. 用户A在房间内移动光标到位置P1
2. 用户B加入房间
3. 观察用户B是否能看到用户A的光标

**预期结果：**
- 用户B加入后立即能看到用户A的光标在P1位置
- 光标状态从后端权威状态同步

## 代码变更摘要

### 后端
- `types.ts`：为`CursorPosition`添加`lamportTime`字段，为`RoomState`添加`cursorStates`和`maxLamportTime`
- `roomManager.ts`：添加`updateCursor()`函数实现Lamport时间戳冲突解决
- `index.ts`：修改`cursor-move`事件处理，集成冲突解决逻辑

### 前端
- `types.ts`：同步后端类型变更
- `socket.ts`：添加Lamport时钟维护，自动为光标消息添加时间戳
- `EditorPage.tsx`：处理`cursor-rejected`事件，同步权威状态

## 性能影响

- 每个光标消息增加4字节（Lamport时间戳）
- 后端增加O(1)的时间戳比较操作
- 对整体性能影响可忽略不计

## 边缘情况处理

1. **时钟回绕**：使用4字节无符号整数，足够支撑长时间运行
2. **用户断线重连**：重连后从后端同步最新状态
3. **极端冲突**：相同时间戳时使用userId作为tie-breaker，确保确定性
