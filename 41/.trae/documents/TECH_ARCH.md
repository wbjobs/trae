# 低代码表单平台 - 技术架构文档

## 1. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端应用 (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │ 表单编辑器  │  │ 规则配置面板 │  │    表单预览       │   │
│  └──────┬──────┘  └──────┬──────┘  └─────────┬─────────┘   │
│         │                │                   │               │
└─────────┼────────────────┼───────────────────┼───────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Express)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │ 表单CRUD   │  │ 规则引擎服务 │  │   数据提交接口    │   │
│  └──────┬──────┘  └──────┬──────┘  └─────────┬─────────┘   │
│         │                │                   │               │
└─────────┼────────────────┼───────────────────┼───────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     SQLite 数据库                          │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │ forms表    │  │ rules表     │  │ submissions表    │   │
│  └─────────────┘  └─────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 2. 目录结构

```
├── api/                              # 后端代码
│   ├── controllers/                  # 控制器
│   │   ├── formController.ts        # 表单CRUD
│   │   ├── ruleController.ts        # 规则管理
│   │   └── submissionController.ts  # 数据提交
│   ├── models/                       # 数据模型
│   │   ├── Form.ts                  # 表单模型
│   │   ├── Rule.ts                  # 规则模型
│   │   └── Submission.ts            # 提交数据模型
│   ├── services/                     # 业务逻辑
│   │   └── ruleEngine.ts            # 规则引擎执行
│   ├── routes/                       # 路由
│   │   ├── forms.ts                 # 表单路由
│   │   ├── rules.ts                 # 规则路由
│   │   └── submissions.ts           # 提交数据路由
│   ├── database/                     # 数据库配置
│   │   └── sqlite.ts                # SQLite连接
│   └── index.ts                     # 启动文件
├── src/                              # 前端代码
│   ├── components/                   # 组件
│   │   ├── FormEditor/               # 表单编辑器
│   │   │   ├── ComponentPanel.tsx   # 组件面板
│   │   │   ├── Canvas.tsx           # 画布
│   │   │   └── PropertyPanel.tsx    # 属性配置
│   │   ├── RuleEngine/               # 规则引擎
│   │   │   ├── ConditionBuilder.tsx # 条件构建器
│   │   │   ├── ActionConfig.tsx     # 动作配置
│   │   │   └── RuleList.tsx         # 规则列表
│   │   ├── FormPreview/              # 表单预览
│   │   │   └── FormRenderer.tsx     # 表单渲染
│   │   └── common/                   # 通用组件
│   ├── store/                        # 状态管理
│   │   └── formStore.ts              # 表单状态
│   ├── types/                        # 类型定义
│   │   └── index.ts                  # 类型声明
│   ├── utils/                        # 工具函数
│   │   └── ruleEvaluator.ts          # 规则评估
│   ├── App.tsx                       # 主应用
│   └── main.tsx                      # 入口文件
└── package.json                      # 依赖配置
```

## 3. 数据库设计

### 3.1 forms 表

| 字段名       | 类型   | 说明         |
| --------- | ---- | ---------- |
| id        | TEXT | 主键，UUID    |
| name      | TEXT | 表单名称       |
| config    | TEXT | 表单配置(JSON) |
| createdAt | TEXT | 创建时间       |
| updatedAt | TEXT | 更新时间       |

### 3.2 rules 表

| 字段名        | 类型   | 说明         |
| ---------- | ---- | ---------- |
| id         | TEXT | 主键，UUID    |
| formId     | TEXT | 关联表单ID     |
| name       | TEXT | 规则名称       |
| conditions | TEXT | 条件配置(JSON) |
| actions    | TEXT | 动作配置(JSON) |
| createdAt  | TEXT | 创建时间       |

### 3.3 submissions 表

| 字段名         | 类型   | 说明         |
| ----------- | ---- | ---------- |
| id          | TEXT | 主键，UUID    |
| formId      | TEXT | 关联表单ID     |
| data        | TEXT | 提交数据(JSON) |
| submittedAt | TEXT | 提交时间       |

## 4. API 接口设计

### 4.1 表单接口

| 方法     | 路径             | 描述     |
| ------ | -------------- | ------ |
| GET    | /api/forms     | 获取表单列表 |
| GET    | /api/forms/:id | 获取单个表单 |
| POST   | /api/forms     | 创建表单   |
| PUT    | /api/forms/:id | 更新表单   |
| DELETE | /api/forms/:id | 删除表单   |

### 4.2 规则接口

| 方法     | 路径                       | 描述       |
| ------ | ------------------------ | -------- |
| GET    | /api/forms/:formId/rules | 获取表单规则列表 |
| POST   | /api/forms/:formId/rules | 创建规则     |
| PUT    | /api/rules/:id           | 更新规则     |
| DELETE | /api/rules/:id           | 删除规则     |

### 4.3 提交数据接口

| 方法   | 路径                             | 描述     |
| ---- | ------------------------------ | ------ |
| POST | /api/forms/:formId/submit      | 提交表单数据 |
| GET  | /api/forms/:formId/submissions | 获取提交记录 |

## 5. 数据结构

### 5.1 表单组件类型

```typescript
type ComponentType = 'input' | 'select' | 'date'

interface FormComponent {
  id: string
  type: ComponentType
  label: string
  placeholder?: string
  required: boolean
  options?: { value: string; label: string }[]
  hidden?: boolean
  disabled?: boolean
}
```

### 5.2 规则条件

```typescript
type LogicalOperator = 'AND' | 'OR'
type ComparisonOperator = '>' | '<' | '==' | '!=' | 'contains'

interface Condition {
  fieldId: string
  operator: ComparisonOperator
  value: string | number | boolean
}

interface ConditionGroup {
  type: LogicalOperator
  children: (Condition | ConditionGroup)[]
}
```

### 5.3 规则动作

```typescript
type ActionType = 'hide' | 'show' | 'disable' | 'enable'

interface RuleAction {
  type: ActionType
  targetFieldId: string
}

interface Rule {
  id: string
  formId: string
  name: string
  conditions: ConditionGroup
  actions: RuleAction[]
}
```

## 6. 规则引擎执行流程

```
1. 用户填写表单 → 触发字段值变化
2. 获取表单所有规则
3. 遍历规则，评估条件是否满足
4. 若条件满足，执行对应的动作
5. 更新组件状态(隐藏/显示/禁用/启用)
```

## 7
