# 本地密码管理器

一个安全的本地密码管理器，使用 Tauri + React + SQLCipher 构建，所有数据端到端加密存储。

## 功能特性

- 🔒 **端到端加密** - 所有密码使用 AES-256-GCM 加密存储
- 🔑 **主密码保护** - 使用 PBKDF2 派生主密钥（100,000 次迭代）
- 💾 **加密数据库** - SQLCipher 加密整个数据库文件
- 🌐 **浏览器自动填充** - 通过本地 HTTP 服务 + 浏览器扩展实现
- 📊 **安全分析** - 弱密码检测、重复密码检测
- 🎲 **密码生成器** - 内置安全密码生成器
- 🔍 **快速搜索** - 标题、用户名、网址全文搜索

## 技术栈

### 后端
- **Tauri 2** - 桌面应用框架
- **Rust** - 系统编程语言
- **SQLCipher** - 加密数据库
- **AES-256-GCM** - 加密算法
- **PBKDF2 + SHA256** - 密钥派生
- **Axum** - 本地 HTTP 服务
- **zxcvbn** - 密码强度评估

### 前端
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Zustand** - 状态管理
- **Vite** - 构建工具

### 浏览器扩展
- **Manifest V3** - Chrome/Edge 扩展
- **Content Scripts** - 页面交互

## 项目结构

```
password-manager/
├── src/                      # React 前端
│   ├── components/          # UI 组件
│   │   ├── Sidebar.tsx
│   │   ├── PasswordList.tsx
│   │   ├── PasswordDetail.tsx
│   │   ├── AddPasswordModal.tsx
│   │   ├── EditPasswordModal.tsx
│   │   ├── AnalysisPanel.tsx
│   │   └── SettingsPanel.tsx
│   ├── pages/               # 页面
│   │   └── LoginPage.tsx
│   ├── layouts/             # 布局
│   │   └── MainLayout.tsx
│   ├── services/            # API 服务
│   │   └── api.ts
│   ├── store/               # 状态管理
│   │   └── index.ts
│   └── types/               # 类型定义
│       └── index.ts
├── src-tauri/               # Rust 后端
│   ├── src/
│   │   ├── main.rs          # 入口
│   │   ├── lib.rs           # 库入口
│   │   ├── db/              # 数据库模块
│   │   ├── crypto/          # 加密模块
│   │   ├── commands/        # Tauri 命令
│   │   ├── server/          # HTTP 服务
│   │   └── analysis/        # 密码分析
│   ├── migrations/          # 数据库迁移
│   └── tauri.conf.json      # Tauri 配置
├── extension/               # 浏览器扩展
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── content.js
│   └── background.js
├── Cargo.toml               # Rust 依赖
├── package.json             # Node 依赖
└── vite.config.ts           # Vite 配置
```

## 安装与运行

### 前置条件

- Node.js 18+
- Rust 1.70+
- Tauri CLI

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run tauri:dev
```

### 构建发布

```bash
# 构建前端
npm run build

# 构建桌面应用
npm run tauri:build
```

## 浏览器扩展安装

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/` 或 `edge://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extension/` 目录

## 安全架构

### 加密流程

1. 用户输入主密码
2. 使用 PBKDF2 从主密码派生 256 位密钥
3. 每个密码使用随机 12 字节 nonce
4. 使用 AES-256-GCM 加密
5. 加密后的数据、nonce、认证标签存储在数据库中

### 数据库加密

- 整个数据库文件使用 SQLCipher 加密
- 数据库密钥从主密钥派生
- 数据库文件无法在没有主密码的情况下读取

### 本地服务

- HTTP 服务仅监听 `127.0.0.1`
- 每个会话生成唯一访问令牌
- 所有请求需要 Bearer Token 认证
- 服务关闭时令牌立即失效

## API 接口

### Tauri 命令

| 命令 | 描述 |
|------|------|
| `initialize_vault` | 创建新的加密保险箱 |
| `unlock_vault` | 解锁保险箱 |
| `lock_vault` | 锁定保险箱 |
| `add_password` | 添加密码 |
| `get_password` | 获取密码详情 |
| `update_password` | 更新密码 |
| `delete_password` | 删除密码 |
| `list_passwords` | 列出所有密码 |
| `search_passwords` | 搜索密码 |
| `generate_password` | 生成随机密码 |
| `check_password_strength` | 检查密码强度 |
| `analyze_passwords` | 分析密码安全性 |
| `start_server` | 启动 HTTP 服务 |
| `stop_server` | 停止 HTTP 服务 |
| `get_server_status` | 获取服务状态 |

### HTTP 服务

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/passwords` | GET | 获取所有密码 |
| `/api/passwords/:id` | GET | 获取单个密码 |
| `/api/match?domain=:domain` | GET | 按域名匹配密码 |

## 注意事项

- 请牢记您的主密码，丢失后无法恢复
- 定期备份数据库文件（默认位于系统数据目录）
- 建议使用至少 12 字符的主密码
- 浏览器扩展需要桌面应用运行才能使用

## 许可证

MIT
