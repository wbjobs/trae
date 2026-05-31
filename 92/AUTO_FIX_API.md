# 配置漂移自动修复 API 使用指南

## 概述

配置漂移检测服务支持自动修复模式，当检测到配置漂移时，可以自动将漂移项回滚到基线配置，并记录详细的回滚日志。

## 核心 API

### POST /api/detect

检测配置漂移并可选执行自动修复。

**请求体：**
```json
{
  "serviceA": "service-a",
  "serviceB": "service-b",
  "baselineCommitId": "可选，指定基线commit",
  "saveSnapshot": true,
  "fix": true,
  "commitMessage": "Auto-rollback configuration drift to baseline",
  "triggeredBy": "admin"
}
```

**请求参数说明：**

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `serviceA` | string | 必填 | 子服务A名称 |
| `serviceB` | string | 必填 | 子服务B名称 |
| `baselineCommitId` | string | null | 指定基线配置的commit ID，不指定则使用最新基线 |
| `saveSnapshot` | boolean | true | 是否保存配置快照 |
| `fix` | boolean | false | 是否启用自动修复模式 |
| `commitMessage` | string | "Auto-rollback configuration drift to baseline" | Git提交信息 |
| `triggeredBy` | string | "system" | 触发人标识 |

**响应示例（fix=true）：**
```json
{
  "detectionId": "550e8400-e29b-41d4-a716-446655440000",
  "detectTime": "2026-05-20T10:30:00",
  "serviceResults": [
    {
      "serviceName": "service-a",
      "baselineCommitId": "abc123",
      "currentCommitId": "def456",
      "hasDrift": true,
      "driftCount": 2,
      "drifts": [
        {
          "key": "server.port",
          "baselineValue": 8080,
          "currentValue": 9090,
          "driftType": "MODIFIED"
        },
        {
          "key": "feature.flag",
          "baselineValue": null,
          "currentValue": true,
          "driftType": "ADDED"
        }
      ]
    }
  ],
  "overallDrift": true,
  "totalDriftCount": 2,
  "snapshotIdA": "snap-123",
  "snapshotIdB": "snap-456",
  "fixMode": true,
  "rollbackLogIdA": "rollback-789",
  "rollbackLogIdB": null,
  "rollbackStatusA": "SUCCESS",
  "rollbackStatusB": "NO_DRIFT"
}
```

**响应新增字段（fix模式）：**

| 字段 | 说明 |
|-----|------|
| `fixMode` | 是否启用了修复模式 |
| `rollbackLogIdA` | 服务A的回滚日志ID |
| `rollbackLogIdB` | 服务B的回滚日志ID |
| `rollbackStatusA` | 服务A的回滚状态 |
| `rollbackStatusB` | 服务B的回滚状态 |

**回滚状态枚举：**
- `SUCCESS` - 全部回滚成功
- `PARTIAL_SUCCESS` - 部分回滚成功
- `FAILED` - 回滚失败
- `NO_DRIFT` - 无漂移，无需回滚

## 回滚日志查询 API

### GET /api/rollbacks/{serviceName}
查询指定服务的所有回滚日志，按时间倒序排列。

**响应示例：**
```json
[
  {
    "id": "664823f8e4b0f8c8a7d6b5c4",
    "detectionId": "550e8400-e29b-41d4-a716-446655440000",
    "serviceName": "service-a",
    "fromCommitId": "def456",
    "toCommitId": "abc123",
    "status": "SUCCESS",
    "rolledBackItems": [
      {
        "key": "server.port",
        "baselineValue": 8080,
        "currentValue": 9090,
        "driftType": "MODIFIED"
      }
    ],
    "rollbackCount": 1,
    "gitCommitId": "ghi789",
    "triggeredBy": "admin",
    "rollbackTime": "2026-05-20T10:30:05"
  }
]
```

### GET /api/rollbacks/{serviceName}/range
按时间范围查询回滚日志。

**参数：**
- `start`: 开始时间 (ISO 8601)
- `end`: 结束时间 (ISO 8601)

### GET /api/rollbacks/id/{id}
按ID查询回滚日志详情。

### GET /api/rollbacks/detection/{detectionId}/{serviceName}
按检测ID和服务名查询回滚日志。

### GET /api/rollbacks/status/{status}
按状态查询回滚日志。

## 回滚逻辑说明

### 回滚处理规则

| 漂移类型 | 回滚操作 |
|---------|---------|
| `ADDED` | 从当前配置中删除该key |
| `REMOVED` | 恢复基线配置中的该key和值 |
| `MODIFIED` | 将值恢复为基线配置的值 |

### Git 操作流程

1. 拉取最新代码
2. 根据漂移项修改配置文件
3. 提交修改（使用指定的commit message）
4. 推送到远程仓库
5. 记录回滚日志

### 配置文件修改

自动修复会直接修改 Git 仓库中的 YAML 配置文件：
- 保持原有文件格式和注释
- 只修改漂移的配置项
- 支持嵌套结构的精确修改

## 使用示例

### 示例 1：检测并自动修复

**请求：**
```bash
curl -X POST http://localhost:8080/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "serviceA": "service-a",
    "serviceB": "service-b",
    "fix": true,
    "commitMessage": "Fix config drift detected by monitoring",
    "triggeredBy": "monitoring-system"
  }'
```

### 示例 2：仅检测不修复（默认）

**请求：**
```bash
curl -X POST http://localhost:8080/api/detect \
  -H "Content-Type: application/json" \
  -d '{
    "serviceA": "service-a",
    "serviceB": "service-b"
  }'
```

### 示例 3：查询回滚历史

**请求：**
```bash
curl http://localhost:8080/api/rollbacks/service-a
```

## 注意事项

1. **权限要求**：Git 仓库需要有写入权限
2. **并发控制**：建议避免同时对同一服务执行多次修复操作
3. **回滚不可逆**：Git 提交会永久保留，可通过 Git 历史回溯
4. **部分失败**：如果部分配置项回滚失败，状态标记为 `PARTIAL_SUCCESS`
5. **无漂移**：如果检测时没有漂移，状态标记为 `NO_DRIFT`，不执行任何操作

## 配置项

在 `application.yml` 中配置：

```yaml
config-drift:
  rollback:
    author-name: Config Drift Detector    # Git提交作者名
    author-email: config-drift@local       # Git提交作者邮箱
```
