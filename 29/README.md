# Flink Iceberg 实时数据同步任务

基于 Apache Flink + Apache Iceberg 实现的实时数据同步任务，支持从 MySQL binlog (Debezium JSON 格式) 读取数据变更，写入 Iceberg 表，并自动适配 Schema Evolution。

## 功能特性

- **Debezium JSON 格式解析**：支持解析 Debezium 输出的 MySQL binlog JSON 格式
- **Schema Evolution 自动适配**：当源表增加列时，Iceberg 表自动增加对应列
- **Upsert 模式写入**：基于主键的合并写入，支持 INSERT/UPDATE/DELETE 操作
- **本地磁盘模拟**：使用本地文件系统模拟 Iceberg 数据仓库
- **吞吐量指标统计**：每分钟输出写入吞吐量到 metrics.log

## 项目结构

```
.
├── pom.xml                                    # Maven 项目配置
├── README.md                                  # 项目说明文档
├── src/
│   └── main/
│       ├── java/
│       │   └── com/example/flink/iceberg/
│       │       └── FlinkIcebergSyncJob.java   # Flink 主程序
│       └── resources/
├── scripts/
│   ├── generate_test_data.py                  # Debezium 测试数据生成器
│   └── run_job.py                             # Python 启动脚本
├── input/                                     # 输入数据目录
└── iceberg-warehouse/                         # Iceberg 数据仓库
```

## 环境要求

- JDK 8+
- Maven 3.6+
- Apache Flink 1.18.x
- Python 3.7+

## 快速开始

### 1. 设置环境变量

```bash
export FLINK_HOME=/path/to/flink-1.18.1
export PATH=$FLINK_HOME/bin:$PATH
```

Windows:
```powershell
set FLINK_HOME=C:\path\to\flink-1.18.1
set PATH=%FLINK_HOME%\bin;%PATH%
```

### 2. 构建项目

```bash
python scripts/run_job.py --build
```

或者手动执行:
```bash
mvn clean package -DskipTests
```

构建完成后，JAR 包位于: `target/flink-iceberg-sync-1.0.0.jar`

### 3. 完整运行流程

```bash
python scripts/run_job.py --clean --build --generate --evolution --start-cluster --run --stop-cluster
```

### 4. 分步运行

#### 生成测试数据

```bash
# 生成 500 条普通数据
python scripts/run_job.py --generate --records 500

# 生成包含 Schema Evolution 的数据
python scripts/run_job.py --generate --evolution --records 1000
```

#### 启动 Flink 集群

```bash
python scripts/run_job.py --start-cluster
```

#### 提交任务

```bash
python scripts/run_job.py --run
```

#### 监控吞吐量指标

```bash
python scripts/run_job.py --monitor
```

#### 停止 Flink 集群

```bash
python scripts/run_job.py --stop-cluster
```

### 5. 自定义参数

```bash
python scripts/run_job.py --run \
    --input ./data \
    --warehouse ./my-warehouse \
    --table mydb.mytable \
    --primary-key id \
    --parallelism 4
```

### 6. 数据血缘与审计

任务支持将每条数据变更的审计日志写入 Kafka Topic，方便回溯数据变更历史。

#### 启动带审计的任务

```bash
# 使用默认 Kafka 配置
python scripts/run_job.py --run

# 使用自定义 Kafka 集群
python scripts/run_job.py --run \
    --kafka-brokers kafka1:9092,kafka2:9092 \
    --audit-topic my-audit-topic

# 禁用审计功能
python scripts/run_job.py --run --disable-audit
```

#### 使用 audit_cli 查询变更历史

```bash
# 安装依赖
pip install kafka-python

# 查询过去 1 小时内的所有变更
python scripts/audit_cli.py --query

# 查询指定表的变更
python scripts/audit_cli.py --query --table default.sync_table

# 查询指定行的变更历史
python scripts/audit_cli.py --query --table default.sync_table --row-id 1001

# 查询过去 6 小时的变更
python scripts/audit_cli.py --query --hours 6

# 实时监控审计日志
python scripts/audit_cli.py --tail

# 导出查询结果并显示统计
python scripts/audit_cli.py --query --table default.sync_table --export changes.json --stats
```

审计日志格式示例:
```json
{
  "timestamp": 1700000000000,
  "timestamp_formatted": "2024-01-15T10:30:00",
  "source_table": "testdb.users",
  "target_table": "default.sync_table",
  "operation": "UPDATE",
  "row_id": "1001",
  "changed_columns": {
    "name": {"old": "Alice", "new": "Alice Smith"},
    "email": {"old": "alice@old.com", "new": "alice@new.com"}
  }
}
```

## 输入数据格式

Debezium JSON 格式示例:

```json
{
  "before": null,
  "after": {
    "id": 1,
    "name": "user_1",
    "email": "user1@example.com",
    "age": 25
  },
  "source": {
    "version": "2.4.0.Final",
    "connector": "mysql",
    "name": "mysql-binlog-source",
    "db": "testdb",
    "table": "users"
  },
  "op": "c",
  "ts_ms": 1700000000000,
  "transaction": null
}
```

操作类型说明:
- `c`: INSERT (创建)
- `u`: UPDATE (更新)
- `d`: DELETE (删除)

## Schema Evolution 示例

测试数据生成器支持模拟 Schema Evolution:

| Schema 版本 | 新增列 | 类型 |
|------------|--------|------|
| v1 | id, name | Long, String |
| v2 | email | String |
| v3 | age | Integer |
| v4 | status | String |
| v5 | balance | Double |

当任务检测到源数据包含新列时，会自动在 Iceberg 表中添加对应列。

## 吞吐量指标

任务运行后，每分钟会在 `metrics.log` 文件中输出吞吐量统计:

```
[2024-01-15 10:30:00] Throughput: 12500 records/minute
[2024-01-15 10:31:00] Throughput: 15230 records/minute
[2024-01-15 10:32:00] Throughput: 14890 records/minute
```

## 核心实现原理

### 1. Debezium JSON 解析
使用 Jackson 解析 Debezium JSON 格式，提取 `before`/`after` 字段和操作类型。

### 2. Schema Evolution 实现
- **ADD COLUMN**: 实时对比数据字段与 Iceberg 表 Schema，检测到新列时自动推断类型并添加
- **DROP COLUMN**: 源表删除列时，自动忽略数据中不存在的列，不会导致任务崩溃
- **Schema 刷新**: 每 60 秒自动刷新一次 Schema，获取最新表结构

### 3. Upsert 写入
- 使用 Iceberg FlinkSink 的 upsert 模式
- 基于主键字段进行数据合并
- 支持 INSERT/UPDATE/DELETE 操作语义

### 4. 状态后端与 Checkpoint 优化
- **RocksDB 状态后端**: 启用增量 Checkpoint，大幅减少 Checkpoint 数据量
- **Checkpoint 配置**: 间隔 60s，超时 300s，最大并发 1
- **可容忍失败**: 允许最多 3 次 Checkpoint 失败
- **外部化 Checkpoint**: 任务取消时保留 Checkpoint，支持快速恢复

### 5. 数据血缘与审计
- **侧输出流**: 使用 Flink Side Output 机制将审计日志与主数据流分离
- **Kafka Sink**: 将审计日志异步写入 Kafka Topic，不影响主流程性能
- **审计内容**: 包含源表、目标表、操作类型、行 ID、变更前后字段值
- **CLI 工具**: 提供 audit_cli.py 支持按表名、行 ID 回溯变更历史

## 配置说明

### Flink 配置
- **状态后端**: EmbeddedRocksDBStateBackend (增量 Checkpoint 启用)
- **Checkpoint 间隔**: 60秒
- **Checkpoint 超时**: 300秒
- **默认并行度**: 1 (可通过 `--parallelism` 参数调整)

### Iceberg 配置
- Catalog 类型: HadoopCatalog
- 存储路径: 本地文件系统

## 故障恢复与优化

### DROP COLUMN 兼容性
当源表执行 `ALTER TABLE DROP COLUMN` 时：
- 任务自动忽略已删除列的数据
- 已删除列在 Iceberg 表中保留历史数据（Iceberg 不支持物理删除列）
- 新写入的数据中该列值为 null

### Checkpoint 优化建议
1. **并行度调整**: 根据数据量调整并行度，建议单并行度处理 5000-10000 records/sec
2. **增量 Checkpoint**: 默认已启用，相比全量 Checkpoint 减少 80%+ 数据量
3. **本地状态恢复**: 重启时从最近的 Checkpoint 恢复，避免全量重放

## 常见问题

### Q: 如何调整并行度?
A: 在提交任务时指定并行度:
```bash
python scripts/run_job.py --run --parallelism 4
```
或手动:
```bash
flink run -p 4 target/flink-iceberg-sync-1.0.0.jar input/ ./warehouse default.table id 4
```

### Q: 源表删除列后任务会崩溃吗?
A: 不会。任务会自动忽略 Iceberg Schema 中不存在的列，并记录 debug 日志。

### Q: 如何重置 Schema?
A: 删除 iceberg-warehouse 目录，任务会重新创建表结构。

### Q: 如何处理复杂类型 (Array/Map)?
A: 当前实现支持基础类型，复杂类型需要扩展 `convertValue` 方法。

### Q: Checkpoint 还是超时怎么办?
A: 
1. 增加并行度分散压力
2. 调大 `checkpointTimeout` (默认 300s)
3. 检查 RocksDB 磁盘 IO，建议使用 SSD
4. 开启 `unaligned checkpoint` 用于背压场景

## License

MIT
