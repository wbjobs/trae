# Cypher to PostgreSQL Translator

一个将简化版 Cypher 图查询语言自动转译为 PostgreSQL 递归 CTE 查询的 Web 工具。

## 功能特性

- 🌐 **前端**: React + Monaco Editor，提供专业的代码编辑体验
- 🚀 **后端**: Python FastAPI，高性能异步服务
- 🔄 **翻译引擎**: 自定义解析器 + CTE 生成器
- ✨ **支持的查询模式**:
  1. **节点属性过滤**: `MATCH (n:Person {name: 'Alice'}) RETURN n.name`
  2. **关系类型过滤**: `MATCH (n)-[r:KNOWS]->(m) RETURN n.name, m.name`
  3. **变长路径匹配**: `MATCH (n)-[r:KNOWS*1..3]->(m) RETURN n.name, m.name`

## 项目结构

```
.
├── backend/
│   ├── main.py              # FastAPI 主程序
│   ├── cypher_parser.py     # Cypher 解析器
│   ├── cte_generator.py     # PostgreSQL CTE 生成器
│   ├── test_translator.py   # 测试脚本
│   └── requirements.txt     # Python 依赖
└── frontend/
    ├── src/
    │   ├── App.jsx          # 主应用组件
    │   ├── main.jsx         # 入口文件
    │   └── styles.css       # 样式文件
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## 快速开始

### 1. 启动后端服务

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API 文档: http://localhost:8000/docs

### 2. 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

访问: http://localhost:3000

### 3. 运行测试

```bash
cd backend
python test_translator.py
```

## 支持的 Cypher 语法

### 基本查询结构

```cypher
MATCH (pattern)
[WHERE conditions]
RETURN expressions
```

### 节点模式

```
(variable:Label {property: value})
```

- `variable`: 可选，变量名
- `:Label`: 可选，节点标签
- `{property: value}`: 可选，属性过滤

### 关系模式

```
-[variable:TYPE|TYPE2*min..max {property: value}]->
```

- `variable`: 可选，变量名
- `:TYPE|TYPE2`: 可选，关系类型（支持多个）
- `*min..max`: 可选，变长路径
  - `*`: 无长度上限
  - `*n`: 固定长度 n
  - `*min..`: 最小长度 min
  - `*..max`: 最大长度 max
  - `*min..max`: 长度范围

### WHERE 条件

支持简单的属性比较：
```cypher
WHERE n.age > 25 AND n.city = 'Beijing'
```

## 示例

### 1. 节点属性过滤

**输入:**
```cypher
MATCH (n:Person {name: 'Alice'})
RETURN n.name, n.age
```

**输出:**
```sql
SELECT n.properties->>'name' AS n_name, n.properties->>'age' AS n_age
FROM nodes n
WHERE n.label = 'Person' AND n.properties->>'name' = 'Alice';
```

### 2. 关系类型过滤

**输入:**
```cypher
MATCH (n:Person)-[r:KNOWS]->(m:Person)
RETURN n.name, m.name
```

**输出:**
```sql
SELECT n.properties->>'name' AS n_name, m.properties->>'name' AS m_name
FROM nodes n
JOIN nodes m ON TRUE
JOIN edges r ON n.id = r.from_node AND r.to_node = m.id
WHERE n.label = 'Person' AND m.label = 'Person' AND (r.type = 'KNOWS');
```

### 3. 变长路径匹配

**输入:**
```cypher
MATCH (n:Person)-[r:KNOWS*1..3]->(m:Person)
RETURN n.name AS start, m.name AS end
```

**输出:**
```sql
WITH RECURSIVE path_cte(from_node, to_node, depth, path, rel_types) AS (
    SELECT e.from_node, e.to_node, 1 AS depth,
           ARRAY[e.from_node, e.to_node] AS path,
           ARRAY[e.type] AS rel_types
    FROM edges e
    WHERE EXISTS (
        SELECT 1 FROM nodes n
        WHERE n.id = e.from_node
        AND n.label = 'Person'
    )
    AND (e.type = 'KNOWS')
    UNION ALL
    SELECT pc.from_node, e.to_node, pc.depth + 1 AS depth,
           pc.path || e.to_node AS path,
           pc.rel_types || e.type AS rel_types
    FROM path_cte pc
    JOIN edges e ON pc.to_node = e.from_node
    AND (e.type = 'KNOWS')
    WHERE pc.depth < 3
)
SELECT start_node.properties->>'name' AS start, end_node.properties->>'name' AS end
FROM path_cte path_cte
JOIN nodes start_node ON path_cte.from_node = start_node.id
JOIN nodes end_node ON path_cte.to_node = end_node.id
WHERE depth >= 1 AND end_node.label = 'Person';
```

## 目标数据库 Schema

```sql
CREATE TABLE nodes (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255),
    properties JSONB
);

CREATE TABLE edges (
    from_node INT REFERENCES nodes(id),
    to_node INT REFERENCES nodes(id),
    type VARCHAR(255),
    properties JSONB,
    PRIMARY KEY (from_node, to_node, type)
);
```

## API 接口

### POST /translate

翻译 Cypher 查询为 PostgreSQL。

**请求体:**
```json
{
  "cypher": "MATCH (n:Person) RETURN n.name"
}
```

**响应:**
```json
{
  "sql": "SELECT n.properties->>'name' AS n_name FROM nodes n WHERE n.label = 'Person';",
  "parsed": { ... },
  "error": null
}
```

### POST /validate

实时语法校验（用于前端编辑器错误高亮）。

**请求体:**
```json
{
  "cypher": "MATCH (n:Person) RETURN n.name"
}
```

**响应:**
```json
{
  "valid": true,
  "error": null,
  "error_line": null,
  "error_column": null
}
```

### GET /health

健康检查。
