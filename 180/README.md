# Docker Container Monitor TUI

基于 Go + Bubble Tea + Docker SDK 的容器资源监控终端界面。

## 功能特性

- 📊 实时显示所有容器的 CPU/Memory/Net IO/Block IO
- 🔄 自动刷新（2秒间隔）
- 🔍 按容器名过滤
- ↕️ 按资源列排序（CPU/内存/名称，支持升序/降序）
- 📜 查看单个容器的实时日志流
- ⚙️ **编辑容器资源限制**（CPU Shares 和内存限制）
- 🎨 彩色终端界面，高可读性

## 快捷键

| 按键 | 功能 |
|------|------|
| `/` | 输入容器名过滤 |
| `↑/k` | 上一行 |
| `↓/j` | 下一行 |
| `Enter` | 查看选中容器的日志 |
| `e` | 编辑选中容器的资源限制 |
| `1` | 按 CPU 排序 |
| `2` | 按内存排序 |
| `3` | 按名称排序 |
| `q/esc` | 退出（日志/编辑视图返回列表） |

### 编辑模式快捷键

| 按键 | 功能 |
|------|------|
| `Tab` | 切换编辑字段 |
| `Enter` | 应用修改 |
| `Esc` | 取消编辑 |

## 资源限制说明

### CPU Shares
- 范围：0-262144
- 默认值：1024
- 说明：CPU 份额的相对权重，值越高获得的 CPU 时间越多

### 内存限制
- 支持格式：`512m`、`2g`、`1024m` 等
- 留空表示不限制
- 支持单位：b/k/m/g（字节/KB/MB/GB）

## 运行要求

- Go 1.21+
- Docker（需要能连接到 Docker daemon）

## 安装运行

```bash
# 克隆项目后进入目录
cd docker-monitor

# 下载依赖
go mod tidy

# 运行
go run .
```

## 项目结构

```
.
├── main.go                    # 入口
├── go.mod                     # Go 模块
└── internal
    ├── monitor
    │   └── monitor.go         # Docker 监控模块
    └── ui
        ├── container.go       # 容器数据结构
        ├── model.go           # Bubble Tea Model
        ├── table.go           # 表格视图
        └── logs.go            # 日志视图
```
