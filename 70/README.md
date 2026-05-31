# 多服务器集群运维巡检 CLI 工具

一个功能完整的多文件架构运维 CLI 命令行工具，支持多远程服务器集群的一键批量巡检。

## 功能模块

1. **集群节点探测** (`detect`) - 探测节点可达性、系统类型、运行时间等
2. **服务状态巡检** (`inspect`) - 检查服务进程、端口、运行状态
3. **日志批量抓取** (`logs`) - 批量抓取、搜索、统计日志内容
4. **异常指令批量执行** (`exec`) - 在多节点上批量执行命令
5. **智能分级标记** (`--grade`) - 自动评估巡检结果风险等级
6. **交互式向导** (`wizard`) - 图形化引导配置巡检任务
7. **定时任务调度** (`ops-schedule`) - 后台定时静默执行巡检
8. **多格式报告导出** (`--export`) - 导出HTML/CSV/Markdown/JSON报告

## 文件结构

```
ops-cli/
├── ops_cli.py           # 命令注册主入口文件
├── remote_connector.py  # 远程通信模块（SSH连接管理）
├── inspection_config.py # 巡检规则配置模块
├── output_formatter.py  # 结果输出格式化模块
├── node_detector.py     # 集群节点探测模块
├── service_inspector.py # 服务状态巡检模块
├── log_capturer.py      # 日志批量抓取模块
├── batch_executor.py    # 异常指令批量执行模块
├── result_grader.py     # 巡检结果智能分级标记模块
├── interactive_cli.py   # 交互式向导模块
├── task_scheduler.py    # 定时任务调度核心模块
├── schedule_cli.py      # 定时任务命令行工具
├── report_exporter.py   # 多格式报告导出模块
├── utils.py             # 公共工具函数模块
├── config.yaml          # 示例配置文件
├── requirements.txt     # 依赖列表
└── README.md            # 使用说明
```

## 安装

```bash
pip install -r requirements.txt
```

## 基础使用方法

### 1. 配置文件

编辑 `config.yaml`，配置服务器节点、服务、日志路径等信息。

### 2. 集群节点探测

```bash
# 探测所有节点
python ops_cli.py detect -c config.yaml

# 探测指定节点
python ops_cli.py detect -c config.yaml --name web-server-01

# 保存结果到文件
python ops_cli.py detect -c config.yaml --save
```

### 3. 服务状态巡检

```bash
# 巡检所有服务
python ops_cli.py inspect -c config.yaml

# 巡检指定服务
python ops_cli.py inspect -c config.yaml --service Nginx

# 静默模式
python ops_cli.py inspect -c config.yaml -s
```

### 4. 日志批量抓取

```bash
# 按配置抓取日志
python ops_cli.py logs -c config.yaml

# 指定关键词搜索
python ops_cli.py logs -c config.yaml --keyword "ERROR" --type grep

# 统计关键词出现次数
python ops_cli.py logs -c config.yaml --keyword "error" --type count

# 抓取最后 N 行
python ops_cli.py logs -c config.yaml --lines 200 --type tail
```

### 5. 批量执行命令

```bash
# 执行单条命令
python ops_cli.py exec -c config.yaml "df -h"

# 执行多条命令
python ops_cli.py exec -c config.yaml "df -h" "free -m" "uptime"

# 设置超时时间
python ops_cli.py exec -c config.yaml --timeout 60 "long_running_command"

# 静默执行
python ops_cli.py exec -c config.yaml -s "restart_service.sh"

# 使用sudo执行
python ops_cli.py exec -c config.yaml --sudo "apt update"
```

### 6. 执行完整巡检

```bash
# 执行所有巡检任务（节点探测、服务巡检、日志抓取、基础信息采集）
python ops_cli.py all -c config.yaml --save
```

## 高级功能

### 交互式向导模式

```bash
python ops_cli.py wizard
```

通过交互式问答的方式，引导您配置巡检任务的所有参数，无需记忆命令行选项。

### 智能分级标记

```bash
# 执行巡检并启用智能评分
python ops_cli.py all -c config.yaml --grade

# 评分等级说明：
# CRITICAL (🔴) - 严重问题，需要立即处理
# HIGH     (🟠) - 高危问题，建议尽快处理
# MEDIUM   (🟡) - 中等问题，需要关注
# LOW      (🟢) - 轻微问题，可延后处理
# INFO     (🔵) - 信息提示，无需处理
```

### 多格式报告导出

```bash
# 导出HTML格式报告（推荐，美观易读）
python ops_cli.py all -c config.yaml --export html

# 导出CSV格式报告（便于Excel处理）
python ops_cli.py all -c config.yaml --export csv

# 导出Markdown格式报告（便于文档化）
python ops_cli.py all -c config.yaml --export markdown

# 导出所有格式报告
python ops_cli.py all -c config.yaml --export all

# 同时启用评分和导出
python ops_cli.py all -c config.yaml --grade --export html
```

### 定时任务调度

```bash
# 查看任务列表
python schedule_cli.py list

# 添加定时任务 - 每小时执行一次
python schedule_cli.py add --name "每小时巡检" --type all -c config.yaml --interval 3600

# 添加定时任务 - Cron表达式（每天凌晨2点执行）
python schedule_cli.py add --name "每日巡检" --type all -c config.yaml \
    --schedule cron --cron "0 2 * * *"

# 启动调度器（前台运行）
python schedule_cli.py start

# 启动调度器（后台守护进程）
python schedule_cli.py start --daemon

# 立即执行指定任务
python schedule_cli.py run <task_id>

# 取消任务
python schedule_cli.py cancel <task_id>

# 删除任务
python schedule_cli.py remove <task_id>

# 查看任务详情
python schedule_cli.py show <task_id>
```

## 全局选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-c, --config` | 配置文件路径 | config.yaml |
| `-o, --output` | 输出格式 (table/json/txt) | table |
| `-d, --output-dir` | 输出目录 | ./output |
| `--no-parallel` | 禁用并行执行 | 否 |
| `--max-workers` | 最大并行线程数 | 10 |
| `-s, --silent` | 静默模式，减少输出 | 否 |
| `--save` | 保存结果到文件 | 否 |
| `--grade` | 启用智能评分功能 | 否 |
| `--export` | 导出巡检报告 (json/csv/html/markdown/all) | - |

## 配置文件说明

### SSH 默认配置

```yaml
ssh_defaults:
  port: 22
  timeout: 10
  username: "admin"
  password: ""
  key_file: "~/.ssh/id_rsa"
  use_sudo: false
  sudo_password: ""
```

### 节点配置

```yaml
nodes:
  - name: "web-server-01"
    host: "192.168.1.101"
    port: 22
    username: "admin"
    password: ""
    key_file: "~/.ssh/id_rsa"
    use_sudo: false
    sudo_password: ""
```

### 服务配置

```yaml
services:
  - name: "Nginx"
    process: "nginx"
    service_name: "nginx"
    port: 80
```

### 日志配置

```yaml
log_paths:
  - path: "/var/log/nginx/error.log"
    type: "grep"        # tail / grep / count
    keyword: "error"
    lines: 50
```

## 多系统支持

工具自动检测远程服务器操作系统类型（Linux/Windows），并使用对应的命令：

- **Linux**: 使用 bash 命令 (ps, systemctl, grep, tail 等)
- **Windows**: 使用 PowerShell 和 cmd 命令 (tasklist, sc, netstat 等)

## 输出格式

### 控制台输出

- 彩色表格展示
- 状态图标 (✓ 成功, ✗ 失败, ⚠ 警告)
- 实时进度显示

### 文件输出

- JSON 格式：结构化数据，便于后续处理
- TXT 格式：纯文本，便于阅读
- HTML 格式：美观的网页报告
- CSV 格式：可导入Excel的表格数据
- Markdown 格式：适合文档化的报告

## 退出代码

- `0`: 所有任务成功
- `1`: 存在失败的任务

## 示例

```bash
# 日常巡检（推荐）
python ops_cli.py all -c config.yaml --grade --export html

# 交互式配置巡检
python ops_cli.py wizard

# 紧急排查 - 搜索所有节点的错误日志
python ops_cli.py logs -c config.yaml --keyword "OutOfMemoryError" --type grep

# 批量更新
python ops_cli.py exec -c config.yaml --sudo "apt update && apt upgrade -y" --timeout 300

# 快速检查特定服务状态
python ops_cli.py inspect -c config.yaml --service MySQL -s

# 创建每日定时巡检任务
python schedule_cli.py add --name "每日巡检" --type all -c config.yaml \
    --schedule cron --cron "0 2 * * *" --max-retries 2
```

## 常见问题

### Q: 如何处理需要sudo权限的命令？
A: 使用 `--sudo` 参数，或在配置文件中为节点设置 `use_sudo: true`。

### Q: 定时任务如何在后台运行？
A: 使用 `python schedule_cli.py start --daemon` 启动后台守护进程。

### Q: 报告文件保存在哪里？
A: 默认保存在 `./output` 目录下，可通过 `-d` 参数指定其他目录。

### Q: 如何自定义评分规则？
A: 编辑 `result_grader.py` 中的规则配置，添加自定义的判定条件。

