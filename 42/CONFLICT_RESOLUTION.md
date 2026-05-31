# Conflict Resolution Guide

FileSync provides comprehensive conflict resolution strategies for handling files that have been modified on both local and remote locations.

## Conflict Resolution Strategies

### 1. newer_wins (Default)
保留修改时间最新的版本。

```yaml
conflict_resolution: "newer_wins"
```

- 比较本地和远程文件的修改时间
- 自动选择最新的版本
- 最智能的自动解决策略

### 2. local_wins
始终保留本地版本。

```yaml
conflict_resolution: "local_wins"
```

- 忽略远程版本
- 本地修改优先
- 适合以本地为主的工作流程

### 3. remote_wins
始终保留远程版本。

```yaml
conflict_resolution: "remote_wins"
```

- 忽略本地版本
- 远程修改优先
- 适合服务器为主的工作流程

### 4. auto_merge
自动合并文本文件冲突。

```yaml
conflict_resolution: "auto_merge"
merge_strategy: "line_by_line"
```

- 仅适用于文本文件
- 支持三种合并策略
- 非文本文件回退到 `newer_wins`

### 5. keep_both
保留两个版本。

```yaml
conflict_resolution: "keep_both"
conflict_backup: true
```

- 同时保留本地和远程版本
- 自动创建备份
- 适合需要保留所有更改的场景

### 6. manual
手动解决冲突。

```yaml
conflict_resolution: "manual"
```

- 暂停同步等待手动处理
- 生成冲突报告
- 适合重要文件需要人工确认的场景

### 7. skip
跳过冲突文件。

```yaml
conflict_resolution: "skip"
```

- 暂时跳过冲突文件
- 不进行任何修改
- 适合只想同步无冲突文件的场景

### 8. ask
询问用户（需要交互式界面）。

```yaml
conflict_resolution: "ask"
```

- 需要交互式终端
- 用户可以选择解决方案
- 适合需要人工确认的场景

## Merge Strategies

当使用 `auto_merge` 策略时，可以选择以下合并方式：

### 1. line_by_line (Recommended)
逐行智能合并。

```yaml
merge_strategy: "line_by_line"
```

- 合并两个文件中的所有唯一行
- 保留所有非冲突的更改
- 生成完整的合并文件
- 适合代码和文档文件

### 2. local_first
本地版本优先。

```yaml
merge_strategy: "local_first"
```

- 如果是文本文件，直接使用本地版本
- 简单快速的合并方式
- 适合以本地为主的工作流程

### 3. remote_first
远程版本优先。

```yaml
merge_strategy: "remote_first"
```

- 如果是文本文件，直接使用远程版本
- 简单快速的合并方式
- 适合以远程为主的工作流程

## Text File Extensions

FileSync 自动识别文本文件进行合并：

```yaml
text_file_extensions:
  - ".txt"
  - ".md"
  - ".json"
  - ".xml"
  - ".yaml"
  - ".yml"
  - ".html"
  - ".css"
  - ".js"
  - ".ts"
  - ".py"
  - ".go"
  - ".java"
  - ".c"
  - ".cpp"
  - ".h"
  - ".sh"
  - ".bat"
```

## Conflict Reports

### Enable Report Generation

```yaml
generate_report: true
report_path: ""  # 空字符串使用默认路径
```

### Report Output

冲突报告会生成两种格式：

1. **JSON 格式**: `conflict_report_<task_name>_<timestamp>.json`
2. **HTML 格式**: `conflict_report_<task_name>_<timestamp>.html`

### Report Content

```json
{
  "task_name": "example-sync",
  "generated_at": "2024-01-01T12:00:00Z",
  "total_conflicts": 3,
  "summary": {
    "auto_resolved": 1,
    "merged": 1,
    "kept_both": 1,
    "skipped": 0,
    "manual_resolved": 0
  },
  "conflicts": [
    {
      "path": "documents/readme.txt",
      "resolution": "merged",
      "conflict_type": "content_modified",
      "local_size": 1024,
      "remote_size": 2048,
      "local_modified": "2024-01-01 10:00:00",
      "remote_modified": "2024-01-01 12:00:00",
      "merge_result": "Strategy: line_by_line, Lines merged: 50 (local only: 5, remote only: 10)"
    }
  ]
}
```

## Conflict Backup

启用冲突文件备份：

```yaml
conflict_backup: true
```

备份文件保存在系统临时目录下的 `filesync_backups/<task_name>/` 目录。

## Example Configurations

### 文档同步（推荐自动合并）

```yaml
tasks:
  - name: "document-sync"
    local_path: "/home/user/docs"
    remote_path: "/backup/user/docs"
    direction: "bidirectional"
    conflict_resolution: "auto_merge"
    merge_strategy: "line_by_line"
    generate_report: true
    conflict_backup: true
    text_file_extensions:
      - ".txt"
      - ".md"
      - ".doc"
      - ".docx"
      - ".pdf"
```

### 代码同步（推荐保留最新）

```yaml
tasks:
  - name: "code-sync"
    local_path: "/home/user/projects"
    remote_path: "/backup/user/projects"
    direction: "bidirectional"
    conflict_resolution: "newer_wins"
    generate_report: true
    ignore_patterns:
      - "node_modules"
      - "*.pyc"
      - "__pycache__"
```

### 重要文件（推荐手动确认）

```yaml
tasks:
  - name: "important-files"
    local_path: "/home/user/important"
    remote_path: "/backup/user/important"
    direction: "bidirectional"
    conflict_resolution: "manual"
    generate_report: true
    conflict_backup: true
```

### 保守同步（推荐保留两个版本）

```yaml
tasks:
  - name: "conservative-backup"
    local_path: "/home/user/data"
    remote_path: "/backup/user/data"
    direction: "bidirectional"
    conflict_resolution: "keep_both"
    conflict_backup: true
    generate_report: true
```

## Best Practices

1. **代码同步**: 使用 `newer_wins` 或 `auto_merge`
2. **文档同步**: 使用 `auto_merge` 保留所有更改
3. **重要文件**: 使用 `manual` 或 `keep_both`
4. **自动化备份**: 使用 `newer_wins` 减少人工干预
5. **敏感数据**: 使用 `keep_both` 保留所有版本

## Troubleshooting

### 合并失败
如果自动合并失败，会回退到 `newer_wins` 策略。

### 二进制文件
非文本文件不支持合并，会自动使用 `newer_wins`。

### 大文件
对于超大文件，建议使用 `newer_wins` 以避免合并超时。
