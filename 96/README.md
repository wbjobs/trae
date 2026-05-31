# Markdown 全文搜索桌面应用

一个基于 Electron + Vue 3 的桌面应用，支持批量导入 Markdown 文件，使用 SQLite FTS5 全文索引，支持中文分词搜索。

## 功能特性

- 📁 **批量导入**：支持批量导入 Markdown 文件
- 🔍 **全文搜索**：基于 SQLite FTS5 的高性能全文索引
- 🀄 **中文分词**：集成 nodejieba 中文分词器
- ✨ **搜索高亮**：搜索结果关键词高亮显示
- 📊 **相关性排序**：使用 BM25 算法按相关性排序
- 🖱️ **系统托盘**：系统托盘快捷搜索窗口
- ⌨️ **全局快捷键**：Ctrl+Shift+F 快速唤起搜索

## 技术栈

- **前端框架**：Vue 3 + TypeScript
- **桌面框架**：Electron
- **构建工具**：Vite
- **数据库**：SQLite + FTS5
- **中文分词**：nodejieba
- **ORM**：better-sqlite3

## 安装依赖

```bash
npm install
```

注意：`better-sqlite3` 和 `nodejieba` 需要编译原生模块，确保已安装 Node.js 和 C++ 编译环境。

Windows 用户需要：
- Windows Build Tools
- Python 3.x

## 开发运行

```bash
npm run dev
```

## 构建打包

```bash
# 构建并打包
npm run build

# 仅构建不打包
npm run build:unpack
```

## 使用说明

1. **导入文件**：点击主窗口右上角的「导入文件」按钮，选择要导入的 Markdown 文件
2. **搜索文档**：在搜索框中输入关键词，支持中文搜索
3. **查看文档**：点击搜索结果或文档列表项查看文档内容
4. **快捷搜索**：
   - 点击系统托盘图标
   - 使用快捷键 Ctrl+Shift+F
   - 按 ESC 关闭搜索窗口

## 项目结构

```
├── electron/              # Electron 主进程代码
│   ├── main.ts           # 主进程入口（窗口、托盘）
│   ├── preload.ts        # 预加载脚本（IPC 通信）
│   ├── database.ts       # SQLite 数据库层
│   └── segmenter.ts      # 中文分词模块
├── src/                   # Vue 渲染进程代码
│   ├── views/            # 页面组件
│   │   ├── MainView.vue  # 主窗口
│   │   └── SearchView.vue # 托盘搜索窗口
│   ├── router/           # 路由配置
│   ├── utils/            # 工具函数
│   ├── types/            # TypeScript 类型定义
│   ├── App.vue           # 根组件
│   ├── main.ts           # 入口文件
│   └── style.css         # 全局样式
├── public/               # 公共资源
├── index.html            # HTML 入口
├── vite.config.ts        # Vite 配置
├── tsconfig.json         # TypeScript 配置
└── package.json          # 项目配置
```

## 数据库设计

### documents 表
存储文档基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 文档标题 |
| content | TEXT | 文档内容 |
| content_seg | TEXT | 分词后的内容 |
| path | TEXT | 文件路径（唯一） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### documents_fts 虚拟表
FTS5 全文索引表

### 搜索语句
使用 BM25 算法计算相关性：
```sql
SELECT d.*, bm25(documents_fts) as rank
FROM documents_fts
JOIN documents d ON d.id = documents_fts.rowid
WHERE documents_fts MATCH ?
ORDER BY rank
LIMIT 50
```

## License

MIT
