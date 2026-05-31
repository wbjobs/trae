# 分布式任务调度系统

一个企业级分布式任务调度系统，采用微服务架构设计，支持Cron定时任务、DAG依赖编排、故障自动转移和全链路追踪。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户 / CLI工具                            │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    调度器 (Spring Boot + Quartz)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ 任务管理    │  │ DAG编排     │  │ 故障转移    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Quartz调度  │  │ 任务分发    │  │ 链路追踪    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└───────────────────────────┬───────────────────┬─────────────────┘
                            │                   │
                            ▼                   ▼
┌───────────────────┐  ┌───────────────┐  ┌───────────────────┐
│    MySQL数据库     │  │  Redis队列    │  │  Jaeger追踪系统    │
│  (任务元数据)      │  │ (任务分发)    │  │ (OpenTelemetry)   │
└───────────────────┘  └───────┬───────┘  └───────────────────┘
                               │
                               ▼
                    ┌───────────────────────────┐
                    │   执行器 (Python Celery)  │
                    │  ┌─────────┐ ┌─────────┐ │
                    │  │ Worker1 │ │ Worker2 │ │
                    │  └─────────┘ └─────────┘ │
                    │  支持Kubernetes水平扩展    │
                    └───────────────────────────┘
```

## 核心功能

### 1. Cron表达式任务配置
- 支持标准Quartz Cron表达式
- 任务参数动态配置
- 定时任务暂停/恢复
- 任务超时控制

### 2. DAG依赖任务编排
- 有向无环图任务依赖定义
- 自动拓扑排序
- 任务依赖检查
- 批量任务提交

### 3. 故障转移
- 执行器心跳检测
- 宕机自动检测
- 任务自动重试
- 失败任务重新分配

### 4. 链路追踪
- OpenTelemetry集成
- 完整执行链路可视化
- Trace ID贯穿全链路
- Jaeger UI支持

### 5. CLI工具
- 任务CRUD操作
- 任务提交/取消/查询
- DAG管理
- 执行器状态监控

## 技术栈

### 调度器
- Java 17
- Spring Boot 3.2.0
- Quartz 2.3.2 (集群模式)
- Spring Data JPA
- Spring Data Redis
- OpenTelemetry 1.32.0
- MySQL 8.0

### 执行器
- Python 3.11
- Celery 5.3.4
- Redis (Broker + Result Backend)
- OpenTelemetry Python

### 基础设施
- MySQL 8.0 (任务元数据存储)
- Redis 7 (任务队列 + 缓存)
- Jaeger (链路追踪)
- Kubernetes (容器编排)

## 快速开始

### 方式一：Docker Compose 启动

```bash
# 1. 启动所有服务
docker-compose up -d

# 2. 查看服务状态
docker-compose ps

# 3. 访问Jaeger UI
open http://localhost:16686
```

### 方式二：本地开发

#### 启动调度器
```bash
cd scheduler

# 编译
mvn clean package -DskipTests

# 运行
java -jar target/task-scheduler-1.0.0.jar
```

#### 启动执行器
```bash
cd executor

# 安装依赖
pip install -r requirements.txt

# 启动Celery Worker
celery -A celery_app worker --loglevel=info

# 启动任务消费者（另开终端）
python task_consumer.py
```

#### 使用CLI工具
```bash
cd cli

# 安装依赖
pip install -r requirements.txt

# 查看帮助
python scheduler_cli.py --help

# 创建任务
python scheduler_cli.py task create \
  --name "daily_report" \
  --type "example" \
  --cron "0 0 2 * * ?" \
  --params '{"report_type": "daily"}' \
  --description "每日报表生成"

# 提交任务
python scheduler_cli.py task submit --name "daily_report"

# 查看任务实例
python scheduler_cli.py instance list

# 查看任务详情
python scheduler_cli.py instance get <instance_id>
```

## API 文档

### 任务管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/tasks | 创建任务 |
| GET | /api/tasks | 获取所有任务 |
| GET | /api/tasks/{id} | 获取任务详情 |
| PUT | /api/tasks/{id} | 更新任务 |
| DELETE | /api/tasks/{id} | 删除任务 |
| POST | /api/tasks/submit | 提交任务执行 |
| POST | /api/tasks/{id}/pause | 暂停任务 |
| POST | /api/tasks/{id}/resume | 恢复任务 |

### 任务实例

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/task-instances/{id} | 获取实例详情 |
| GET | /api/task-instances | 查询实例列表 |
| POST | /api/task-instances/{id}/cancel | 取消任务 |
| POST | /api/task-instances/{id}/retry | 重试任务 |
| POST | /api/task-instances/result | 上报任务结果 |

### DAG管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/dags | 创建DAG |
| GET | /api/dags | 获取所有DAG |
| GET | /api/dags/{id} | 获取DAG详情 |
| POST | /api/dags/{name}/submit | 提交DAG执行 |
| DELETE | /api/dags/{id} | 删除DAG |

### 执行器管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/executors/register | 注册执行器 |
| POST | /api/executors/heartbeat | 心跳上报 |
| GET | /api/executors | 获取所有执行器 |

## Kubernetes 部署

```bash
# 创建命名空间
kubectl create namespace task-scheduler

# 部署所有服务
kubectl apply -k k8s/

# 查看部署状态
kubectl get all -n task-scheduler

# 访问Jaeger UI
kubectl port-forward svc/jaeger-ui 16686:16686 -n task-scheduler
```

## CLI 使用示例

### 任务管理

```bash
# 创建Cron任务
scheduler-cli task create \
  --name "hourly_sync" \
  --type "example" \
  --cron "0 0 * * * ?" \
  --params '{"sync_type": "full"}' \
  --max-retry 3 \
  --retry-interval 300

# 创建DAG任务
scheduler-cli dag create \
  --name "data_pipeline" \
  --description "数据处理流水线" \
  --edges '[{"fromTaskName":"extract","toTaskName":"transform"},{"fromTaskName":"transform","toTaskName":"load"}]'

# 提交DAG执行
scheduler-cli dag submit --name "data_pipeline"

# 查看任务状态
scheduler-cli instance list --status RUNNING

# 取消任务
scheduler-cli instance cancel 123
```

## 自定义任务处理器

在执行器中添加自定义任务类型：

```python
# executor/celery_app/handlers/my_task_handler.py
import logging

logger = logging.getLogger(__name__)

def handle(params):
    """
    自定义任务处理器
    :param params: 任务参数字典
    :return: 执行结果
    """
    logger.info(f"执行自定义任务, 参数: {params}")
    
    # 业务逻辑
    result = {
        "status": "success",
        "data": params,
        "processed": True
    }
    
    return result
```

任务类型名为 `my_task`（去除 `_handler` 后缀）。

## 配置说明

### 调度器配置 (application.yml)

```yaml
scheduler:
  task:
    queue-prefix: "task:queue:"      # Redis队列前缀
    heartbeat-timeout-seconds: 30     # 心跳超时时间
    failover-check-interval-seconds: 60  # 故障检查间隔
  otel:
    enabled: true                     # 是否启用链路追踪
    endpoint: "http://localhost:4317" # OTLP端点
    service-name: "task-scheduler"    # 服务名
```

### 执行器配置 (环境变量)

```bash
SCHEDULER_URL=http://scheduler:8080
REDIS_HOST=redis
REDIS_PORT=6379
EXECUTOR_ID=executor-001
EXECUTOR_NAME=celery-executor
HEARTBEAT_INTERVAL=10
CELERY_CONCURRENCY=4
OTEL_ENABLED=true
OTEL_ENDPOINT=http://jaeger:4317
```

## 监控与告警

### 关键指标
- 调度器: 任务提交量、执行成功率、调度延迟
- 执行器: 任务处理量、执行时长、队列长度
- 系统: CPU使用率、内存使用率、磁盘IO

### 告警规则
- 执行器心跳超时 > 30秒
- 任务失败率 > 5%
- 队列等待任务数 > 100
- 调度器实例不可用

## 故障转移机制

1. **执行器心跳检测**: 执行器每10秒上报心跳
2. **超时判定**: 30秒未收到心跳标记为失效
3. **任务恢复**: 失效执行器上的任务重新排队
4. **自动重试**: 失败任务根据配置自动重试

## 许可证

MIT License
