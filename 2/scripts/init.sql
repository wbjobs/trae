-- 分布式任务调度服务数据库初始化脚本

CREATE DATABASE IF NOT EXISTS scheduler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE scheduler;

-- 任务组表
CREATE TABLE IF NOT EXISTS task_groups (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY,
    task_group_id VARCHAR(36),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) NOT NULL,
    command TEXT,
    http_method VARCHAR(10),
    http_url TEXT,
    http_headers JSON,
    http_body TEXT,
    schedule_type VARCHAR(50) NOT NULL,
    cron_expression VARCHAR(100),
    execute_at DATETIME,
    interval_seconds INT,
    timeout_seconds INT DEFAULT 30,
    max_retries INT DEFAULT 0,
    retry_backoff INT DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    current_retry INT DEFAULT 0,
    next_execute_at DATETIME,
    last_execute_at DATETIME,
    max_cpu_percent DECIMAL(5,2) DEFAULT 0,
    max_memory_mb INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_next_execute_at (next_execute_at),
    INDEX idx_schedule_type (schedule_type),
    INDEX idx_task_group_id (task_group_id),
    FOREIGN KEY (task_group_id) REFERENCES task_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 任务日志表
CREATE TABLE IF NOT EXISTS task_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    execution_id VARCHAR(36) NOT NULL,
    status VARCHAR(50) NOT NULL,
    exit_code INT,
    output TEXT,
    error_message TEXT,
    start_time DATETIME,
    end_time DATETIME,
    duration_ms BIGINT,
    executor_id VARCHAR(255),
    retry_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_execution_id (execution_id),
    INDEX idx_created_at (created_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 任务依赖表
CREATE TABLE IF NOT EXISTS task_dependencies (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    dependency_task_id VARCHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_dependency (task_id, dependency_task_id),
    INDEX idx_task_id (task_id),
    INDEX idx_dependency_task_id (dependency_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 告警配置表
CREATE TABLE IF NOT EXISTS alert_configs (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    channels JSON,
    notify_emails JSON,
    cooldown_seconds INT DEFAULT 300,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_task_alert (task_id, alert_type),
    INDEX idx_task_id (task_id),
    INDEX idx_alert_type (alert_type),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 告警记录表
CREATE TABLE IF NOT EXISTS alert_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    execution_id VARCHAR(36),
    error_message TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_alert_type (alert_type),
    INDEX idx_execution_id (execution_id),
    INDEX idx_sent_at (sent_at),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 任务资源监控表
CREATE TABLE IF NOT EXISTS task_resource_metrics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    execution_id VARCHAR(36) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cpu_percent DECIMAL(5,2) DEFAULT 0,
    memory_mb DECIMAL(10,2) DEFAULT 0,
    INDEX idx_task_id (task_id),
    INDEX idx_execution_id (execution_id),
    INDEX idx_timestamp (timestamp),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 示例数据：创建一个测试任务
INSERT INTO tasks (id, name, description, task_type, command, schedule_type, timeout_seconds, max_retries, retry_backoff, status, next_execute_at)
VALUES (
    UUID(),
    '示例Shell任务',
    '这是一个示例Shell任务，用于测试系统功能',
    'shell',
    'echo "Hello, Distributed Scheduler!"',
    'once',
    30,
    3,
    1,
    'pending',
    NOW()
);

SELECT '数据库初始化完成！' AS message;
