# P2P 实时位置共享桌面应用 - 技术规范

## 1. 项目概述

### 项目名称
**LocationShare** - P2P Real-time Location Sharing Desktop Application

### 核心功能
基于Electron的桌面应用，通过WebRTC实现点对点位置共享，使用Redis作为信令服务器，支持地理围栏和本地通知。

### 技术栈
- **框架**: Electron 28.x
- **地图**: Leaflet 1.9.x + OpenStreetMap
- **P2P通信**: WebRTC (simple-peer)
- **序列化**: Protocol Buffers (protobufjs)
- **信令服务**: Redis 7.x
- **消息队列**: MQTT.js (模拟GPS设备)
- **构建工具**: Vite + electron-builder
- **UI框架**: 纯HTML/CSS/JavaScript (无框架)

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Electron Main Process                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Redis Client│  │ MQTT Client  │  │ Local Notifications│   │
│  │  (Signaling) │  │(GPS Simulate)│  │                    │   │
│  └─────────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ IPC
┌─────────────────────────────────────────────────────────────┐
│                    Electron Renderer Process                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Leaflet Map │  │ WebRTC Mesh  │  │  Geofence Engine  │   │
│  │   + Markers │  │   + Protobuf │  │  + Notifications  │   │
│  └─────────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 功能规格

### 3.1 房间系统

#### 创建房间
- 用户点击"创建房间"按钮
- 系统生成6位数字邀请码（如：`482716`）
- 用户成为房间创建者（Host）
- 邀请码保存到Redis，TTL = 1小时

#### 加入房间
- 用户输入6位邀请码
- 系统验证邀请码有效性
- 验证通过后建立WebRTC连接
- 加入成功后显示所有在线成员

#### 房间数据结构 (Redis)
```json
{
  "roomCode": "482716",
  "hostId": "peer_abc123",
  "members": ["peer_abc123", "peer_def456"],
  "createdAt": 1703001234567,
  "ttl": 3600
}
```

### 3.2 P2P通信层

#### WebRTC连接建立
1. Peer A (Host) 创建房间，获取自己的offer
2. Host通过Redis信令发送offer给新成员
3. 新成员收到offer，生成answer
4. 新成员通过Redis信令发送answer
5. Host收到answer，P2P通道建立成功

#### Protobuf消息格式
```protobuf
syntax = "proto3";

message LocationUpdate {
  string peer_id = 1;
  double latitude = 2;
  double longitude = 3;
  float accuracy = 4;
  float speed = 5;
  float heading = 6;
  int64 timestamp = 7;
}

message PeerInfo {
  string peer_id = 1;
  string nickname = 2;
  string avatar_color = 3;
}

message GeofenceEvent {
  string peer_id = 1;
  string geofence_id = 2;
  string geofence_name = 3;
  bool entered = 4;  // true=进入, false=离开
  int64 timestamp = 5;
}
```

### 3.3 地图显示

#### 地图组件
- Leaflet地图，OpenStreetMap瓦片
- 默认缩放级别：15
- 默认中心：北京天安门 (39.9042, 116.4074)
- 支持手动调整中心和缩放

#### 成员标记
- 自定义Marker图标（圆形头像）
- 显示成员昵称标签
- 成员颜色由avatar_color指定
- 点击Marker显示成员信息弹窗

#### 轨迹显示
- 使用Leaflet.Polyline显示历史轨迹
- 轨迹线条颜色与成员颜色一致
- 轨迹平滑化：使用贝塞尔曲线插值
- 保留最近100个轨迹点
- 轨迹线条宽度：3px

### 3.4 地理围栏

#### 围栏类型
1. **圆形围栏**
   - 指定中心点和半径（米）
   - 使用Leaflet.Circle组件

2. **多边形围栏**
   - 点击地图添加顶点
   - 至少3个顶点
   - 使用Leaflet.Polygon组件

#### 围栏数据结构
```json
{
  "id": "gf_001",
  "name": "公司范围",
  "type": "circle",  // or "polygon"
  "color": "#FF5733",
  "center": [39.9042, 116.4074],
  "radius": 500,  // 仅圆形
  "vertices": [],  // 仅多边形
  "createdBy": "peer_abc123"
}
```

#### 围栏检测逻辑
- 使用Turf.js进行几何计算
- 每500ms检测一次所有成员的实时位置
- 状态变化时触发通知（进入/离开）

### 3.5 本地通知

#### 通知类型
1. **围栏进入通知**
   - 标题: "进入地理围栏"
   - 内容: "{成员昵称} 进入了 {围栏名称}"

2. **围栏离开通知**
   - 标题: "离开地理围栏"
   - 内容: "{成员昵称} 离开了 {围栏名称}"

3. **成员加入通知**
   - 标题: "新成员加入"
   - 内容: "{成员昵称} 加入了房间"

4. **成员离开通知**
   - 标题: "成员离开"
   - 内容: "{成员昵称} 离开了房间"

#### 通知实现
- 使用Electron Notification API
- 支持系统托盘通知
- 通知持久化（点击后聚焦应用）

### 3.6 MQTT模拟GPS设备

#### MQTT配置
- Broker: Mosca (本地MQTT broker)
- 端口: 1883
- Topic: `gps/simulate/{deviceId}`

#### 模拟设备
- 模拟3-5个GPS设备
- 设备沿预设路径移动
- 位置更新频率: 1秒/次
- 模拟精度: ±5米随机误差

#### 消息格式 (MQTT -> App)
```json
{
  "deviceId": "sim_001",
  "latitude": 39.9042,
  "longitude": 116.4074,
  "accuracy": 3.5,
  "speed": 5.2,
  "heading": 90,
  "timestamp": 1703001234567
}
```

---

## 4. UI设计

### 4.1 整体布局
```
┌─────────────────────────────────────────────────┐
│  标题栏 (Custom Titlebar)                        │
├───────────────┬─────────────────────────────────┤
│               │                                 │
│   侧边栏      │          地图区域                │
│   (280px)     │                                 │
│               │                                 │
│  - 房间信息    │                                 │
│  - 成员列表    │                                 │
│  - 围栏列表    │                                 │
│               │                                 │
├───────────────┴─────────────────────────────────┤
│  底部工具栏                                        │
└─────────────────────────────────────────────────┘
```

### 4.2 侧边栏组件

#### 房间信息卡片
- 房间邀请码（大字体显示）
- 复制邀请码按钮
- 房间成员数量

#### 成员列表
- 每个成员显示：颜色标记、昵称、最后更新时间
- 在线状态指示（绿点）

#### 围栏管理
- 添加圆形围栏按钮
- 添加多边形围栏按钮
- 围栏列表（可删除）

### 4.3 底部工具栏
- 地图类型切换（街道/卫星）
- 定位到我的位置
- 全屏切换
- 设置按钮

### 4.4 颜色方案
```css
--primary: #2563EB;      /* 主色-蓝色 */
--secondary: #64748B;    /* 次要-灰色 */
--success: #10B981;      /* 成功-绿色 */
--warning: #F59E0B;      /* 警告-橙色 */
--danger: #EF4444;       /* 危险-红色 */
--background: #F8FAFC;   /* 背景 */
--surface: #FFFFFF;      /* 卡片表面 */
--text: #1E293B;         /* 主文字 */
--text-muted: #94A3B8;   /* 次要文字 */
```

### 4.5 字体
- 主字体: Inter, system-ui, sans-serif
- 等宽字体: JetBrains Mono (显示坐标)

---

## 5. 数据流

### 5.1 位置更新流程
```
GPS设备(MQTT) → Main Process → IPC → Renderer → WebRTC Broadcast → 其他Peer
                                              ↓
                                         地图更新 + 围栏检测
```

### 5.2 信令流程
```
1. 创建房间: Peer A → Redis (room:create)
2. 加入房间: Peer B → Redis (room:join) → Peer A (通知)
3. WebRTC Offer: Peer A → Redis (signal:offer) → Peer B
4. WebRTC Answer: Peer B → Redis (signal:answer) → Peer A
5. ICE Candidate: 双方 → Redis (signal:ice)
```

---

## 6. 项目结构

```
location-share/
├── package.json
├── vite.config.js
├── electron-builder.json
├── protobuf/
│   └── location.proto
├── src/
│   ├── main/
│   │   ├── main.js              # Electron主进程
│   │   ├── preload.js           # 预加载脚本
│   │   ├── redis-client.js      # Redis客户端
│   │   ├── mqtt-client.js        # MQTT客户端
│   │   └── notifications.js      # 通知服务
│   └── renderer/
│       ├── index.html
│       ├── styles/
│       │   └── main.css
│       ├── js/
│       │   ├── app.js            # 主应用
│       │   ├── map.js            # 地图管理
│       │   ├── webrtc.js         # WebRTC管理
│       │   ├── geofence.js       # 地理围栏
│       │   ├── protobuf.js       # Protobuf序列化
│       │   └── ui.js             # UI组件
│       └── assets/
│           └── icons/
└── README.md
```

---

## 7. 依赖清单

### 生产依赖
- electron: ^28.0.0
- leaflet: ^1.9.4
- simple-peer: ^9.11.1
- protobufjs: ^6.11.4
- ioredis: ^5.3.2
- mqtt: ^5.3.0
- @turf/turf: ^6.5.0

### 开发依赖
- vite: ^5.0.0
- electron-builder: ^24.9.1
- @vitejs/plugin-basic-ssl: ^1.0.2

---

## 8. 验收标准

### 8.1 核心功能
- [ ] 可以创建房间并获取6位邀请码
- [ ] 可以通过邀请码加入房间
- [ ] 成员位置实时同步（P2P）
- [ ] 地图上显示所有成员位置
- [ ] 成员轨迹以贝塞尔曲线平滑显示
- [ ] 可以创建圆形围栏
- [ ] 可以创建多边形围栏
- [ ] 进入/离开围栏触发本地通知
- [ ] MQTT模拟GPS设备正常工作

### 8.2 性能要求
- 位置更新延迟 < 100ms
- 地图渲染流畅无卡顿
- 内存占用 < 300MB

### 8.3 稳定性
- 无崩溃、无内存泄漏
- 断线重连机制正常

---

## 9. 注意事项

### 安全
- 邀请码不可预测（使用随机数生成）
- 位置数据仅通过P2P传输，不经过服务器
- Redis仅用于信令，信令数据TTL后自动删除

### 兼容性
- Windows 10/11
- macOS 12+ (可选)
- Node.js 18+

### 部署
- 使用electron-builder打包
- 生成可执行文件(.exe)
