# depaudit - 多语言项目依赖安全审计与自动修复工具

## 简介

depaudit 是一个基于 Go 开发的多语言项目依赖安全审计与自动修复命令行工具，支持扫描多种语言项目的依赖文件，检测安全漏洞，生成漏洞报告，并提供自动修复功能。

## 功能特性

### 1. 项目依赖扫描
- **JavaScript**: 支持 npm、yarn、pnpm 包管理器
- **Python**: 支持 pip、pipenv、poetry 包管理器
- **Java**: 支持 Maven、Gradle 构建工具
- **Go**: 支持 go mod

### 2. 漏洞数据库查询
- 集成 OSV (Open Source Vulnerabilities) 数据库
- 支持配置多个数据源

### 3. 漏洞报告生成
- **文本格式**: 适合命令行查看
- **JSON 格式**: 适合程序解析
- **HTML 格式**: 适合浏览器查看，美观的网页报告

### 4. 自动修复功能
- 根据漏洞报告自动更新依赖到安全版本
- 支持不同包管理器的更新命令
- 完善的回滚机制，修复失败时自动恢复

### 5. 配置与 CI/CD 集成
- YAML 配置文件支持
- 漏洞忽略规则配置
- GitHub Actions 集成
- Jenkins 集成
- GitLab CI 集成

## 安装

```bash
# 克隆项目
git clone https://github.com/depaudit/depaudit.git
cd depaudit

# 安装依赖
go mod tidy

# 构建
go build -o depaudit ./cmd/depaudit

# 安装到系统
go install ./cmd/depaudit
```

## 快速开始

### 1. 初始化配置（可选）
```bash
depaudit init
```

### 2. 扫描项目依赖
```bash
# 扫描当前目录
depaudit scan

# 扫描指定目录
depaudit scan -p /path/to/project

# 只报告 HIGH 及以上级别漏洞
depaudit scan -s HIGH
```

### 3. 生成多格式报告
```bash
# 生成文本和 JSON 报告
depaudit scan -f text,json

# 生成 HTML 报告
depaudit scan -f html

# 指定输出目录
depaudit scan -f html --config config.yaml
```

### 4. 自动修复漏洞
```bash
# 预览修复操作（不实际执行）
depaudit scan -x -n

# 实际执行修复
depaudit scan -x

# 只修复 HIGH 及以上级别漏洞
depaudit scan -x -s HIGH
```

### 5. CI/CD 集成
```bash
# 发现漏洞时退出码非零
depaudit scan --fail-on-vuln
```

## 配置文件

配置文件支持 `.depaudit.yaml` 或 `.depaudit.yml`，会自动从当前目录查找。

```yaml
scan:
  paths:
    - "."
  languages:
    - javascript
    - python
    - java
    - golang
  exclude_dirs:
    - node_modules
    - vendor
  include_dev: true

vulnerability:
  min_severity: LOW
  ignore_ids:
    - CVE-2021-12345
  ignore_packages:
    lodash: "4.17.20"

fix:
  enabled: false
  auto_rollback: true
  dry_run: false

report:
  formats:
    - text
    - json
  output_dir: "."

ci:
  enabled: true
  fail_on_vulnerability: true
  min_severity: HIGH
```

## 命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-c, --config` | 配置文件路径 | 自动查找 |
| `-p, --path` | 项目路径 | `.` |
| `-f, --format` | 报告格式 (text, json, html) | `text` |
| `-s, --severity` | 最低严重级别 | `LOW` |
| `-x, --fix` | 自动修复 | `false` |
| `-n, --dry-run` | 预览模式 | `false` |
| `--fail-on-vuln` | 发现漏洞时非零退出 | `false` |

## CI/CD 集成示例

### GitHub Actions
```yaml
name: Security Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install depaudit
        run: |
          go install github.com/depaudit/depaudit/cmd/depaudit@latest
      - name: Run security audit
        run: depaudit scan -f json,html --fail-on-vuln -s HIGH
      - name: Upload report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: security-report
          path: depaudit-report.*
```

### Jenkins Pipeline
```groovy
pipeline {
    agent any
    stages {
        stage('Security Audit') {
            steps {
                sh 'depaudit scan -f json,html --fail-on-vuln'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'depaudit-report.*'
                }
            }
        }
    }
}
```

## 支持的语言和包管理器

| 语言 | 包管理器/构建工具 | 支持的文件 |
|------|-------------------|-----------|
| JavaScript | npm, yarn, pnpm | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` |
| Python | pip, pipenv, poetry | `requirements.txt`, `Pipfile`, `Pipfile.lock`, `pyproject.toml`, `poetry.lock` |
| Java | Maven, Gradle | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| Go | go mod | `go.mod` |

## 项目结构

```
depaudit/
├── cmd/
│   └── depaudit/
│       └── main.go          # 命令行入口
├── pkg/
│   ├── scanner/             # 核心扫描模块
│   │   ├── scanner.go       # 扫描器接口
│   │   ├── javascript.go    # JS 依赖解析
│   │   ├── python.go        # Python 依赖解析
│   │   ├── java.go          # Java 依赖解析
│   │   ├── golang.go        # Go 依赖解析
│   │   └── types.go         # 类型定义
│   ├── vuln/                # 漏洞检测模块
│   │   ├── types.go         # 漏洞类型定义
│   │   ├── osv.go           # OSV 数据库查询
│   │   └── matcher.go       # 漏洞匹配逻辑
│   ├── fixer/               # 自动修复模块
│   │   ├── types.go         # 修复器接口
│   │   ├── javascript.go    # JS 包管理器适配
│   │   ├── python.go        # Python 包管理器适配
│   │   ├── java.go          # Java 构建工具适配
│   │   └── golang.go        # Go 模块适配
│   ├── reporter/            # 报告生成模块
│   │   ├── types.go         # 报告生成器接口
│   │   ├── text.go          # 文本报告
│   │   ├── json.go          # JSON 报告
│   │   └── html.go          # HTML 报告
│   ├── config/              # 配置模块
│   │   └── config.go        # 配置文件解析
│   └── ci/                  # CI/CD 模块
│       └── integration.go   # CI 集成支持
├── examples/
│   └── config.yaml          # 示例配置
├── go.mod
├── go.sum
└── README.md
```

## 许可证

MIT License
