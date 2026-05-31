# 桌面中控应用 (Desktop Control Center)

基于多文件架构开发的桌面中控应用，实现电脑端联动外置工控外设、自定义快捷组合指令、外设状态桌面弹窗提醒、多套控制方案一键切换。

## 功能特性

### 🔌 外设协议适配
- 支持多种连接方式：串口(RS232/RS485)、网络(TCP/UDP)、USB
- 内置协议解析：Modbus RTU/TCP、自定义协议
- 设备状态实时监控：连接状态、数据接收、错误告警
- 驱动适配器架构，易于扩展新的设备类型

### ⌨️ 桌面快捷指令编排
- 可视化指令编辑器，支持多步骤组合
- 指令参数配置、延迟设置、条件判断
- 快捷键绑定，一键执行复杂操作
- 指令分组管理，按分类快速查找

### 🔄 多设备联动队列
- 优先级任务调度，支持FIFO、优先级、轮询策略
- 任务依赖管理，确保执行顺序
- 任务队列实时监控，支持取消和重试
- 设备并行执行，提高响应速度

### 💾 本地配置持久化
- 多套控制方案(Profile)管理，一键切换
- 方案导入/导出，便于分享和备份
- 本地缓存机制，提升运行效率
- 配置文件自动保存，防止数据丢失

### 🖥️ 界面与通知
- 现代化图形界面，基于PyQt5
- 设备状态实时显示，颜色区分状态
- 桌面弹窗通知，重要事件及时提醒
- 系统托盘集成，后台运行不占空间

### 🌐 跨平台支持
- Windows 7/10/11 完整支持
- 国产系统(麒麟、统信等)兼容
- 平台差异自动适配，无需额外配置

## 项目结构

```
e:\trae\66\
├── main.py                    # 主入口文件
├── platform_adapter.py        # 平台适配层
├── requirements.txt           # 依赖包列表
├── peripheral_adapter/        # 外设协议适配模块
│   ├── __init__.py
│   ├── driver_adapter.py      # 驱动适配器
│   ├── protocol_parser.py     # 协议解析器
│   └── device_manager.py      # 设备管理器
├── command_editor/            # 快捷指令编排模块
│   ├── __init__.py
│   ├── command_model.py       # 指令数据模型
│   ├── command_parser.py      # 指令解析器
│   └── command_manager.py     # 指令管理器
├── device_scheduler/          # 多设备联动队列模块
│   ├── __init__.py
│   ├── task_queue.py          # 任务队列
│   ├── task_scheduler.py      # 任务调度器
│   └── linkage_engine.py      # 联动引擎
├── config_manager/            # 本地配置持久化模块
│   ├── __init__.py
│   ├── config_store.py        # 配置存储
│   ├── profile_manager.py     # 方案管理器
│   └── cache_manager.py       # 缓存管理器
└── ui/                        # 用户界面模块
    ├── __init__.py
    ├── main_window.py         # 主窗口
    ├── device_panel.py        # 设备面板
    ├── command_panel.py       # 指令面板
    ├── scheduler_panel.py     # 调度面板
    ├── linkage_panel.py       # 联动面板
    ├── notification_widget.py # 通知组件
    └── profile_selector.py    # 方案选择器
```

## 安装说明

### 环境要求
- Python 3.7+
- PyQt5 5.15+

### 安装步骤

1. 克隆或下载项目代码
2. 安装依赖包：
```bash
pip install -r requirements.txt
```

### 依赖说明

| 包名 | 版本 | 说明 |
|------|------|------|
| PyQt5 | >=5.15.0 | GUI框架 |
| pyserial | >=3.5 | 串口通信 |
| pywin32 | >=305 | Windows系统API(仅Windows) |
| pyyaml | >=6.0 | YAML配置解析 |
| json5 | >=0.9.10 | JSON5配置解析 |

## 快速开始

### 启动应用

```bash
python main.py
```

### 首次使用

1. **添加设备**
   - 点击左侧设备列表的「+ 添加」按钮
   - 填写设备名称、类型、连接方式、通信协议
   - 配置连接参数(串口/网络/USB)
   - 点击「确定」保存

2. **创建快捷指令**
   - 切换到「快捷指令」标签页
   - 点击「+ 添加」按钮
   - 填写指令基本信息
   - 在「步骤编辑」标签页添加执行步骤
   - 配置每个步骤的目标设备、指令、参数

3. **设置联动规则**
   - 切换到「联动规则」标签页
   - 点击「添加规则」
   - 配置触发条件(设备状态/数值/时间/自定义)
   - 添加执行动作(发送指令/执行命令/通知等)

4. **保存方案**
   - 配置完成后，系统会自动保存到当前方案
   - 可通过顶部方案选择器切换不同方案
   - 支持方案的导入和导出

## 配置文件位置

应用数据存储位置根据操作系统自动确定：

- **Windows**: `%APPDATA%\DesktopControlCenter\`
- **Linux**: `~/.config/DesktopControlCenter/`
- **macOS**: `~/Library/Application Support/DesktopControlCenter/`

目录结构：
```
DesktopControlCenter/
├── config/           # 应用配置
│   └── app_config.json
├── profiles/         # 控制方案
│   └── *.json
├── cache/            # 缓存文件
│   └── cache.json
├── drivers/          # 自定义驱动
├── layouts/          # 界面布局
└── logs/             # 日志文件
    └── app.log
```

## 开发指南

### 添加自定义协议

1. 在 `peripheral_adapter/protocol_parser.py` 中继承 `ProtocolParser` 类
2. 实现 `encode()` 和 `decode()` 方法
3. 在 `device_manager.py` 的 `_create_parser()` 中注册新协议

### 添加自定义驱动

1. 在 `peripheral_adapter/driver_adapter.py` 中继承 `DriverAdapter` 类
2. 实现 `connect()`, `disconnect()`, `send()`, `is_connected()` 方法
3. 在 `device_manager.py` 的 `_create_driver()` 中注册新驱动

### 扩展联动动作

1. 在 `device_scheduler/linkage_engine.py` 中添加新的 `LinkageActionType`
2. 在 `_execute_single_action()` 中实现对应逻辑

## 常见问题

**Q: 应用启动失败，提示缺少PyQt5？**
A: 请确保已安装所有依赖包，执行 `pip install -r requirements.txt`

**Q: 串口设备无法连接？**
A: 检查端口号是否正确，波特率等参数是否匹配，串口是否被其他程序占用

**Q: 国产系统下运行异常？**
A: 请确保系统已安装Python3和PyQt5，部分国产系统可能需要额外安装字体

**Q: 如何备份我的配置？**
A: 通过「文件」→「导出方案」将当前方案导出为JSON文件，需要时可导入

## 技术支持

如遇到问题或有功能建议，可通过以下方式反馈：
- 查看日志文件：`logs/app.log`
- 检查常见问题章节

## 许可证

本项目仅供学习和内部使用。
