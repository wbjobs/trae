CREATE DATABASE IF NOT EXISTS task_scheduler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE task_scheduler;

CREATE TABLE IF NOT EXISTS task_definition (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_name VARCHAR(255) NOT NULL UNIQUE,
    task_type VARCHAR(50) NOT NULL,
    cron_expression VARCHAR(100),
    task_params JSON,
    description VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    max_retry_times INT NOT NULL DEFAULT 3,
    retry_interval_seconds INT NOT NULL DEFAULT 60,
    timeout_seconds INT NOT NULL DEFAULT 3600,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_task_name (task_name),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dag_definition (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    dag_name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dag_edge (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    dag_id BIGINT NOT NULL,
    from_task_id BIGINT NOT NULL,
    to_task_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dag_id) REFERENCES dag_definition(id) ON DELETE CASCADE,
    FOREIGN KEY (from_task_id) REFERENCES task_definition(id) ON DELETE CASCADE,
    FOREIGN KEY (to_task_id) REFERENCES task_definition(id) ON DELETE CASCADE,
    UNIQUE KEY uk_dag_edge (dag_id, from_task_id, to_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_instance (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL,
    dag_id BIGINT,
    trace_id VARCHAR(128),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    executor_id VARCHAR(128),
    params JSON,
    result TEXT,
    error_message TEXT,
    retry_times INT NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMP NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    timeout_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_status (status),
    INDEX idx_scheduled_at (scheduled_at),
    INDEX idx_trace_id (trace_id),
    FOREIGN KEY (task_id) REFERENCES task_definition(id) ON DELETE CASCADE,
    FOREIGN KEY (dag_id) REFERENCES dag_definition(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS executor_registry (
    id VARCHAR(128) PRIMARY KEY,
    executor_name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_heartbeat_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    task_types JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_last_heartbeat (last_heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
