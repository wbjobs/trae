# 系统监控仪表盘 (System Monitor Dashboard)

一个基于 **Tauri 2.0** 的跨平台系统监控应用，使用 Rust 后端和原生 Web 前端构建。

## 功能特性

- 🖥️ **实时系统监控**
  - CPU 使用率（总体及每核心）
  - 内存使用情况
  - 磁盘使用情况
  - 网络流量（上传/下载速度及总量）

- 📊 **历史数据图表**（使用 Plotters 绘制）
  - CPU 使用率历史图表
  - 内存使用率历史图表
  - 网络流量历史图表

- 🔔 **阈值告警**
  - 可配置的 CPU 使用率告警阈值（默认 90%）
  - 超过阈值时自动弹窗通知
  - 支持内存和磁盘告警扩展

- 💾 **数据持久化**
  - SQLite 数据库存储历史数据
  - 自动保留最近 24 小时数据
  - 自动清理过期数据

## 技术栈

### 后端 (Rust)
- **Tauri 2.0** - 桌面应用框架
- **sysinfo** - 系统信息采集
- **rusqlite** - SQLite 数据库
- **Plotters** - 图表绘制
- **Tokio** - 异步运行时

### 前端
- **原生 JavaScript** - 轻量级前端
- **HTML5** - 界面结构
- **CSS3** - 暗色主题样式

## 项目结构

```
system-monitor-dashboard/
├── src/
│   └── main.js              # 前端主逻辑
├── index.html               # 前端入口
├── package.json             # 前端依赖
├── vite.config.js           # Vite 配置
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Rust 入口
│   │   ├── lib.rs           # 主库文件（Tauri 命令）
│   │   ├── monitor.rs       # 系统监控模块
│   │   ├── database.rs      # SQLite 数据库模块
│   │   ├── alert.rs         # 告警模块
│   │   └── charts.rs        # 图表生成模块
│   ├── Cargo.toml           # Rust 依赖
│   ├── tauri.conf.json      # Tauri 配置
│   ├── capabilities/
│   │   └── default.json     # 权限配置
│   └── icons/               # 应用图标
└── generate-icons.js        # 图标生成脚本
```

## 快速开始

### 前置要求

- [Rust](https://www.rust-lang.org/tools/install) (>= 1.70)
- [Node.js](https://nodejs.org/) (>= 18)
- [npm](https://www.npmjs.com/) 或 [yarn](https://yarnpkg.com/)

### 安装与运行

1. **克隆项目**
   ```bash
   cd system-monitor-dashboard
   ```

2. **生成图标**（首次运行需要）
   ```bash
   node generate-icons.js
   ```

3. **安装前端依赖**
   ```bash
   npm install
   ```

4. **开发模式运行**
   ```bash
   npm run tauri dev
   ```

5. **构建生产版本**
   ```bash
   npm run tauri build
   ```

## 使用说明

### 仪表盘界面

应用启动后会显示四个主要监控卡片：

1. **CPU 使用率**
   - 显示总体 CPU 使用率
   - 显示每个核心的使用率
   - 底部显示历史趋势图

2. **内存使用**
   - 已用/总量/可用内存
   - 使用率百分比
   - 历史趋势图

3. **磁盘使用**
   - 各磁盘分区使用情况
   - 使用率进度条

4. **网络流量**
   - 实时上传/下载速度
   - 累计数据量
   - 流量历史图

### 告警配置

- 在 CPU 卡片底部可以设置告警阈值
- 当 CPU 使用率超过阈值时，会显示红色告警横幅
- 告警有 30 秒冷却时间，避免频繁弹窗

### 数据存储

- 历史数据自动保存到 SQLite 数据库
- 数据库位置：
  - Windows: `%APPDATA%\SystemMonitorDashboard\monitor.db`
  - macOS/Linux: `~/.config/SystemMonitorDashboard/monitor.db`
- 自动清理超过 24 小时的旧数据

## Tauri 命令

应用暴露以下 Tauri 命令供前端调用：

| 命令 | 说明 |
|------|------|
| `get_system_data` | 获取当前系统数据 |
| `start_monitoring` | 开始后台监控 |
| `update_alert_threshold` | 更新告警阈值 |
| `send_alert_notification` | 发送告警通知 |
| `get_history_data` | 获取历史数据 |
| `generate_cpu_chart` | 生成 CPU 图表 |
| `generate_memory_chart` | 生成内存图表 |
| `generate_network_chart` | 生成网络图表 |

## 事件

应用会发出以下事件：

| 事件 | 说明 |
|------|------|
| `system_data_update` | 每秒发送最新系统数据 |
| `cpu_alert` | CPU 使用率超过阈值时触发 |
| `show_alert` | 显示告警消息 |

## 自定义

### 修改告警阈值

在 `src-tauri/src/alert.rs` 中修改默认值：

```rust
impl Default for AlertConfig {
    fn default() -> Self {
        Self {
            cpu_threshold: 90.0,    // 修改此处
            memory_threshold: 90.0,
            disk_threshold: 90.0,
        }
    }
}
```

### 修改数据保留时间

在 `src-tauri/src/database.rs` 中修改：

```rust
let cutoff = timestamp - 24 * 60 * 60;  // 24 小时
```

### 修改监控间隔

在 `src-tauri/src/monitor.rs` 中修改：

```rust
thread::sleep(Duration::from_secs(1));  // 1 秒间隔
```

## 常见问题

### Q: 图表不显示？
确保已正确生成图标和数据库文件，检查控制台是否有错误信息。

### Q: 告警不工作？
检查告警阈值设置，以及系统通知权限是否开启。

### Q: 如何重置数据？
删除数据库文件即可重置所有历史数据：
- Windows: 删除 `%APPDATA%\SystemMonitorDashboard\monitor.db`
- macOS/Linux: 删除 `~/.config/SystemMonitorDashboard/monitor.db`

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
