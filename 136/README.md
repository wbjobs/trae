# Sciter 邮件客户端

一个基于 Sciter (HTML/CSS/TIScript) + SQLite 的桌面邮件客户端。

## 功能特性

### 1. IMAP 邮件同步
- 支持标准 IMAP 协议
- SSL/TLS 加密连接
- 多文件夹同步（收件箱、已发送、草稿、垃圾箱）
- 增量同步机制

### 2. 全文索引 (FTS5)
- 使用 SQLite FTS5 全文检索引擎
- 索引内容包括：
  - 邮件主题
  - 发件人姓名和邮箱
  - 邮件正文
  - 附件文件名

### 3. 高级搜索
- **快速搜索**：搜索框实时全文搜索
- **高级搜索**：
  - 发件人筛选
  - 收件人筛选
  - 主题关键词
  - 正文内容搜索
  - 附件名搜索
  - 时间范围筛选
  - 标签筛选

### 4. 标签系统
- 创建自定义标签
- 8种预设颜色可选
- 为邮件添加/移除标签
- 按标签过滤邮件

### 5. 快捷过滤栏
- 未读邮件
- 带附件邮件
- 今日邮件
- 本周邮件

### 6. 邮件管理
- 邮件列表展示（带未读标识）
- 邮件详情查看
- 标记已读/未读
- 删除邮件
- 附件预览
- 多种排序方式

## 项目结构

```
e:\trae\136\
├── index.html              # 主界面文件
├── README.md               # 项目说明
├── styles/
│   └── main.css           # 样式文件
└── scripts/
    ├── db.tis             # 数据库模块 (SQLite + FTS5)
    ├── imap.tis           # IMAP 协议模块
    └── app.tis            # 主应用逻辑
```

## 数据库设计

### 核心表结构

1. **accounts** - 邮箱账户配置
2. **folders** - 邮箱文件夹
3. **emails** - 邮件主表
4. **attachments** - 附件信息
5. **tags** - 标签定义
6. **email_tags** - 邮件标签关联表
7. **email_fts** - FTS5 全文索引虚拟表

### FTS5 全文索引

```sql
CREATE VIRTUAL TABLE email_fts USING fts5(
    subject,
    sender_name,
    sender_email,
    body_text,
    attachment_names,
    content='emails',
    content_rowid='id'
);
```

## 使用方法

### 1. 运行环境
需要安装 [Sciter SDK](https://sciter.com/download/) 或使用 Sciter 二进制包。

### 2. 启动应用
使用 sciter.exe 打开 index.html：
```bash
sciter.exe index.html
```

### 3. 首次配置
1. 点击右上角设置按钮 ⚙
2. 填写邮箱配置信息：
   - 邮箱地址
   - 密码/授权码
   - IMAP 服务器地址
   - IMAP 端口（默认993）
3. 保存配置后将自动加载演示数据

### 4. 功能演示
- **同步邮件**：点击顶部同步按钮
- **搜索邮件**：在搜索框输入关键词
- **高级搜索**：点击搜索框右侧"高级"按钮
- **管理标签**：点击左侧标签栏 + 按钮
- **过滤邮件**：点击左侧快捷过滤选项

## 技术栈

- **UI 框架**：Sciter (HTML/CSS)
- **脚本语言**：TIScript
- **数据库**：SQLite + FTS5
- **邮件协议**：IMAP4

## 搜索性能

FTS5 全文索引提供：
- 毫秒级全文检索
- 支持前缀搜索、短语搜索
- 结果按相关性排序
- 支持布尔逻辑查询

## 注意事项

1. 本项目为演示版本，IMAP 网络连接部分需要根据实际 Sciter 网络 API 调整
2. 附件下载和本地存储功能需额外实现
3. 邮件发送（SMTP）功能未包含在此版本中
4. 实际使用前请进行安全性审查，特别是密码存储部分

## 开发说明

### 数据库模块 (db.tis)
- 初始化数据库连接和表结构
- 邮件 CRUD 操作
- FTS5 搜索接口
- 标签管理

### IMAP 模块 (imap.tis)
- IMAP 协议实现
- 邮件解析（MIME）
- 演示数据生成

### 应用模块 (app.tis)
- UI 事件绑定
- 邮件列表渲染
- 搜索逻辑
- 标签和过滤功能
