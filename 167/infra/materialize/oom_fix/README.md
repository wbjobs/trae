# 修复 Materialize 大表 Join 内存溢出 (OOM)

## 一、为什么会 OOM

Materialize 的执行模型是 **Differential Dataflow**：任何被激活的物化视图，其
**完整结果集都会常驻内存** 以便下游查询 O(1)。当两个 1 亿行的表用
非等值 / 无窗口 / 无唯一键 / 跨 cluster 的方式 Join，中间结果就是
O(1e8 × 1e8) = 1e16 行，任何机器都顶不住。

## 二、定位 OOM 的方法

在 Materialize 里跑下面几条 SQL，先定位是哪个 MV / 哪个 operator 爆了：

```sql
-- 1) 哪些 MV 占内存最多
SELECT name, logical_size, physical_size
FROM mz_materialized_views
ORDER BY physical_size DESC NULLS LAST
LIMIT 20;

-- 2) 哪个 dataflow operator 最吃内存
SELECT name, sum(memory_bytes) AS mem
FROM mz_dataflow_operators
GROUP BY name
ORDER BY mem DESC NULLS LAST
LIMIT 20;

-- 3) replica 健康度
SELECT c.name, r.name, r.status, c.size
FROM mz_clusters c
JOIN mz_cluster_replicas r ON r.cluster_id = c.id;
```

如果 `physical_size` 持续单调增长、`mem` 里出现
`Join` / `TopK` / `Window` 算子独占几十 GB，就坐实是 join/聚合的写法问题。

## 三、修复清单（按优先级）

| # | 动作 | 效果 |
|---|---|---|
| 1 | **强制等值 Join**，禁止 `BETWEEN`、`ABS(a-b)<c`、`LIKE` 放在 ON 条件里 | 把 O(N*M) 拉回 O(N+M) |
| 2 | 源表用 `ENVELOPE DEBEZIUM` 或 `ENVELOPE UPSERT`，必须声明唯一键 | 避免历史版本无限累积 |
| 3 | 在 join key 上 **CREATE INDEX**，多个 MV 共享同一个 arrange | 省 3x~10x 内存 |
| 4 | 窗口聚合显式加 **WATERMARK**（`WHERE ts > mz_now() - INTERVAL '10 min'` 兜底） | 过期状态自动回收 |
| 5 | TopN 必须带 `PARTITION BY`，避免 1 亿行全进最小堆 | |
| 6 | 超大 Join 单独放一个 **专用 cluster** (`SIZE = '2xlarge'`)，BI/Preset 用独立小 cluster | 一个炸不拖垮全站 |
| 7 | 客户端订阅用 `SUBSCRIBE ... WITH (SNAPSHOT = FALSE)` | 不拉全量快照 |
| 8 | 历史数据预聚合进 `CREATE TABLE` + 批写，实时部分用 MV | 冷数据不占流内存 |
| 9 | 容器层面加 `deploy.resources.limits.memory`、`ulimits nofile=65535`、`shm_size=4g` | 防 Linux OOM killer |
| 10 | 打开 `MZ_LOG_FILTER=info,mz_dataflow=debug` + `INTROSPECTION DEBUGGING=ON` | 出问题能回溯 |

## 四、本仓库已提供的 SQL 模板

位于 `infra/materialize/oom_fix/`：

- `01_anti_patterns.sql` —— 9 种必须避免的写法（反模式清单）
- `02_keyed_joins.sql` —— 等值 Join + UPSERT + 索引 + 带 PARTITION 的 TopN
- `03_incremental_aggregations.sql` —— WATERMARK + TUMBLE/HOP + SUBSCRIBE
- `04_resource_limits.sql` —— 多 cluster 隔离 + 监控查询 + 自动伸缩

## 五、docker-compose 已做的加固

`materialize` 服务已加上：

```yaml
deploy:
  resources:
    limits:  { memory: 16g, cpus: "8.0" }
    reservations: { memory: 8g, cpus: "4.0" }
ulimits:
  nofile: { soft: 65535, hard: 65535 }
  memlock: { soft: -1, hard: -1 }
shm_size: 4g
environment:
  MZ_DEFAULT_CLUSTER_SIZE: 4
  MZ_LOG_FILTER: info,mz_dataflow=debug
```

> 生产环境建议直接上 **Materialize Cloud** 或至少把 `materialize` 换成
> `environmentd + clusterd + cockroach` 的三件套部署，不要用单容器
> `materialized`。本仓库是本地演示配置。

## 六、一键复现 + 验证

```bash
# 1. 起全部组件
docker compose up -d

# 2. 注册 Debezium 连接器
curl -X POST -H "Content-Type: application/json" \
  http://localhost:8083/connectors \
  -d @infra/debezium/shop-connector.json

# 3. 进 Materialize，先跑 oom_fix 脚本
psql -h localhost -p 6875 -U materialize \
  -f infra/materialize/oom_fix/01_anti_patterns.sql \
  -f infra/materialize/oom_fix/02_keyed_joins.sql \
  -f infra/materialize/oom_fix/03_incremental_aggregations.sql \
  -f infra/materialize/oom_fix/04_resource_limits.sql

# 4. 观察内存
psql -h localhost -p 6875 -U materialize \
  -c "SELECT name, physical_size FROM mz_materialized_views ORDER BY physical_size DESC NULLS LAST;"
```

如果 `physical_size` 不再单调增长、BI 查询 < 100ms，说明修复生效。
