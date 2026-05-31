-- 创建数据库
CREATE DATABASE task_scheduler;

-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    cron_expr VARCHAR(50),
    position_x FLOAT NOT NULL DEFAULT 100,
    position_y FLOAT NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 任务依赖表
CREATE TABLE IF NOT EXISTS task_dependencies (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    upstream_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, upstream_task_id)
);

-- 任务历史表
CREATE TABLE IF NOT EXISTS task_histories (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    status VARCHAR(20) NOT NULL,
    cron_expr VARCHAR(50),
    position_x FLOAT NOT NULL,
    position_y FLOAT NOT NULL,
    operation VARCHAR(20) NOT NULL,
    snapshot_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 依赖历史表
CREATE TABLE IF NOT EXISTS dependency_histories (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL,
    upstream_task_id INTEGER NOT NULL,
    operation VARCHAR(20) NOT NULL,
    snapshot_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_upstream_task_id ON task_dependencies(upstream_task_id);
CREATE INDEX IF NOT EXISTS idx_task_histories_task_id ON task_histories(task_id);
CREATE INDEX IF NOT EXISTS idx_task_histories_snapshot_at ON task_histories(snapshot_at);
CREATE INDEX IF NOT EXISTS idx_dependency_histories_snapshot_at ON dependency_histories(snapshot_at);

-- 示例数据
INSERT INTO tasks (name, description, status, position_x, position_y) VALUES
('数据采集', '从各业务系统采集原始数据', 'success', 100, 100),
('数据清洗', '清洗和格式化采集到的数据', 'success', 350, 100),
('数据转换', '将清洗后的数据转换为目标格式', 'pending', 600, 100),
('数据加载', '将转换后的数据加载到数据仓库', 'pending', 850, 100),
('报表生成', '根据数据仓库数据生成业务报表', 'pending', 600, 250),
('数据备份', '备份原始数据和报表', 'pending', 850, 250);

-- 设置依赖关系
INSERT INTO task_dependencies (task_id, upstream_task_id) VALUES
(2, 1),
(3, 2),
(4, 3),
(5, 3),
(6, 4),
(6, 5);
