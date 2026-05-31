# 智能温控器 UI (Slint + C++)

嵌入式温控器人机界面，面向 Linux ARM 开发板（如 Raspberry Pi、IMX6/IMX8 等），
使用 **Slint** 声明式 UI 框架搭配 C++ 后端。

## 功能

| 模块 | 说明 |
| ---- | ---- |
| 当前温度 | 实时显示，通过 MQTT 订阅 `home/living/temperature`；无网络时使用本地模拟数据 |
| 目标温度 | 旋钮拖拽控制，范围 5~35°C，步进 0.5°C |
| 周编程 | 7 天 × 24 小时温度计划表，点击单元格循环切换 (15→…→30→15) |
| 数据存储 | SQLite 持久化目标温度与周编程，默认路径 `/var/lib/thermostat/thermostat.db` |

## 目录结构

```
.
├── CMakeLists.txt
├── ui/
│   └── app-window.slint        # Slint 界面声明
├── include/
│   ├── thermostat.h            # 主应用逻辑
│   ├── db.h                    # SQLite 封装
│   └── mqtt_client.h           # MQTT 订阅封装
├── src/
│   ├── main.cpp
│   ├── thermostat.cpp          # Slint 回调绑定、周期刷新
│   ├── db.cpp                  # settings / schedule 表 CRUD
│   └── mqtt_client.cpp         # 模拟或 paho-mqttpp
└── README.md
```

## 依赖

- C++17 编译器 (gcc/clang ≥ 9)
- CMake ≥ 3.21
- Slint ≥ 1.9 (通过 FetchContent 自动拉取，可改为 `find_package`)
- SQLite3 (系统库或 amalgamation 自动拉取)
- (可选) `paho-mqttpp3` — 启用真实 MQTT：`-DENABLE_MQTT=ON`

## 构建 (Linux x86_64 模拟)

```bash
cmake -S . -B build
cmake --build build -j$(nproc)
./build/Thermostat
```

## 交叉编译 (Linux ARM)

```bash
cmake -S . -B build-arm \
  -DCMAKE_TOOLCHAIN_FILE=/path/to/arm-toolchain.cmake \
  -DBUILD_FOR_ARM=ON \
  -DSlint_DIR=/opt/slint-arm/lib/cmake/Slint
cmake --build build-arm -j$(nproc)
```

> 也可以使用 Slint 官方支持的 `slint-cmake` 交叉工具链脚本。

部署到开发板：

```bash
scp build-arm/Thermostat root@<board-ip>:/usr/local/bin/
ssh root@<board-ip> "mkdir -p /var/lib/thermostat && /usr/local/bin/Thermostat"
```

## 运行模式

| 选项 | 说明 |
| ---- | ---- |
| 默认 | MQTT 模拟模式：正弦+噪声，每 1.5s 推送 |
| `-DENABLE_MQTT=ON` | 真实 MQTT：连接 `tcp://localhost:1883`，订阅 `home/living/temperature`，payload 为纯数字字符串 |
| 环境变量 `MQTT_BROKER` | 覆盖 broker 地址 |
| 环境变量 `MQTT_TOPIC` | 覆盖订阅主题 |

## Slint 与 C++ 的接口

界面通过 `global ThermostatLogic` 暴露：

- 属性：`current-temperature`、`target-temperature`、`status-text`
- 回调：`target-changed`、`save-schedule`、`load-schedule`、`get-schedule`、`switch-page`

C++ 端在 `thermostat.cpp:run()` 中通过 `ui->global<ThermostatLogic>()` 注册回调，
并以 250ms 定时器把 MQTT 线程的最新温度安全地刷新到 UI（跨线程通过 `std::mutex`）。

## 数据模型

```sql
settings(key TEXT PRIMARY KEY, value TEXT)
schedule(day INTEGER, hour INTEGER, temp INTEGER, PRIMARY KEY(day,hour))
```
