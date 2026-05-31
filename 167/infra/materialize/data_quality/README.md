# 数据质量监控：Schema 验证 + 死信队列 (DLQ)

## 一、整体架构

```
PostgreSQL ─CDC─▶ Debezium (SMT unwrap + Avro Converter)
                         │
                         ├── 正常 ─▶ shop.shop.orders / shop.shop.order_items / ...
                         │                │
                         │                └──▶ Materialize (mv_* 实时物化视图)
                         │                                       │
                         │                                       └──▶ Preset (实时看板)
                         │
                         └── 异常 ─▶ dlq.shop.connector.errors  (DLQ)
                                           │
                                           └──▶ Materialize (mv_dlq_* 异常监控)
                                                          │
                                                          └──▶ Preset (质量看板 + 告警)
```

## 二、Schema 验证是怎么做的

本项目用两层验证捕获异常数据：

| 层级 | 机制 | 捕获的异常 |
|---|---|---|
| **Converter 层** | Avro Converter + Schema Registry | 字段缺失、类型不匹配、enum 值非法、union 分支错误 |
| **SMT 层** | `ExtractNewRecordState` (unwrap) | Debezium envelope 结构损坏、tombstone 处理失败 |

Avro Converter 在把 Kafka 消息的 byte[] 反序列化为 Connect Struct 时，会严格对照
Schema Registry 里注册的 Avro schema 做校验。任何不兼容的消息（比如上游改了表结构但
没有正确注册新 schema）都会抛 `SerializationException`，被 `errors.tolerance=all`
捕获进 DLQ。

## 三、DLQ 配置详解

`shop-connector.json` 里的关键配置：

```json
"errors.tolerance": "all",
"errors.deadletterqueue.topic.name": "dlq.shop.connector.errors",
"errors.deadletterqueue.context.headers.enable": "true",
"errors.deadletterqueue.context.header.prefix": "__connect.errors.",
"errors.log.enable": "true",
"errors.log.include.messages": "true"
```

- `errors.tolerance=all` — 容忍所有错误，不会让 connector task 崩溃
- `errors.deadletterqueue.topic.name` — 死信队列主题名
- `context.headers.enable=true` — 把错误上下文（异常类、消息、堆栈、原 topic/partition/offset）
  写进 Kafka message headers，方便下游结构化消费
- `errors.log.enable=true` — 同时写 Connect 日志（便于 grep 排查）

DLQ 主题自动创建配置：

```json
"topic.creation.dlq.include": "dlq.*",
"topic.creation.dlq.default.cleanup.policy": "compact,delete",
"topic.creation.dlq.default.retention.ms": 604800000
```

> DLQ 消息保留 7 天，`compact` 策略保证同一个 key 的最新错误不会被重复消费。

## 四、DLQ 消息结构

每条 DLQ 消息的 headers 包含：

| Header Key | 内容 |
|---|---|
| `__connect.errors.exception.class.name` | 异常类全名（如 `org.apache.kafka.common.errors.SerializationException`） |
| `__connect.errors.exception.message` | 异常消息 |
| `__connect.errors.exception.stacktrace` | 完整堆栈（可能被截断） |
| `__connect.errors.original.topic` | 原始主题名 |
| `__connect.errors.original.partition` | 原始分区号 |
| `__connect.errors.original.offset` | 原始 offset |
| `__connect.errors.stage` | 错误发生阶段（`source` / `transformation` / `converter`） |
| `__connect.errors.timestamp` | 错误时间戳 |

消息的 **key/value 保持原样**，方便事后重放。

## 五、Materialize 消费 DLQ 做监控

运行 SQL 脚本：

```bash
psql -h localhost -p 6875 -U materialize \
  -f infra/materialize/data_quality/01_dlq_source.sql \
  -f infra/materialize/data_quality/02_quality_checks.sql
```

提供的物化视图：

| 视图 | 用途 |
|---|---|
| `mv_dlq_errors` | 每条异常的结构化记录（错误分类、原始 topic、时间戳） |
| `mv_dlq_error_stats` | 按分钟 × 错误类型 × 源表的聚合计数（给看板用） |
| `mv_dlq_recent_errors` | 最近 10 分钟的错误（告警钩子） |
| `mv_dlq_top_errors` | TopN 高频错误类型 |
| `mv_null_check_orders` | orders 表各列的空值率 |
| `mv_range_violations` | 值域越界（amount<=0、status 非法等） |
| `mv_orphan_order_items` | 参照完整性孤儿（order_item 引用了不存在的 product） |
| `mv_duplicate_keys` | 主键重复检测 |
| `mv_end_to_end_lag` | CDC 端到端延迟（max/avg/min） |
| `mv_quality_score` | 综合质量打分 0-100 |

## 六、Redpanda Console 里查看 DLQ

打开 `http://localhost:8080` → Topics → `dlq.shop.connector.errors`

可以直接在 Console 里浏览消息的 key、value、headers，无需写 SQL。

## 七、告警钩子

用 `SUBSCRIBE` 实时订阅异常事件，下游接 PagerDuty/飞书/钉钉：

```sql
SUBSCRIBE (
    SELECT source_table, error_category, cnt_last_10min
    FROM mv_dlq_recent_errors
    WHERE cnt_last_10min > 10
) WITH (SNAPSHOT = FALSE);
```

或者用外部监控系统（Prometheus + Grafana）定期查询 `mv_quality_score`，低于 90 分触发告警。

## 八、DLQ 重放

如果修复了 schema 或上游问题后想重放 DLQ 消息：

```bash
# 1. 用 kafkacat 把 DLQ 消息重新投回原始主题
kcat -b localhost:29092 -C -t dlq.shop.connector.errors -f '%k|%h|%s\n' | \
  while IFS='|' read -r key headers value; do
    topic=$(echo "$headers" | grep -oP 'original\.topic:\K[^,]+' | xargs)
    echo "$value" | kcat -b localhost:29092 -P -t "$topic" -k "$key"
  done
```

> 实际生产中建议用 Kafka Connect 的 `DeadLetterQueueReporter` 或专用的 DLQ 重放工具，
> 不要自己写脚本。

## 九、常见 DLQ 错误及修复

| 错误类型 | 原因 | 修复 |
|---|---|---|
| `SerializationException: Unknown magic byte` | 消息不是 Avro 格式，或者 Schema Registry 不可达 | 检查 Schema Registry 健康度；确认生产者使用的是 Avro |
| `SerializationException: Schema not found` | Schema Registry 中找不到对应 ID 的 schema | 重新注册 schema，或检查生产者配置的 `schema.registry.url` |
| `SerializationException: Error deserializing Avro message` | 字段类型不匹配（如 int→string） | 修复上游 schema 兼容性，或设置 `use.latest.version=true` |
| `DataException: Struct schemas are not equal` | SMT unwrap 失败，envelope 结构不对 | 检查 Debezium 版本兼容性，确认 `unwrap` 配置正确 |
| `ConnectException: Tolerance exceeded in error handler` | 短时间内错误太多，超过了容忍阈值 | 检查 `errors.retry.timeout`，或者根本原因（schema 不兼容） |
