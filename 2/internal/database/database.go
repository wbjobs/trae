package database

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/distributed-scheduler/internal/config"
	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

var DB *sqlx.DB

func InitDB() error {
	cfg := config.GetConfig().Database

	dsn := cfg.GetDSN()
	log.Printf("Connecting to MySQL: %s:%d/%s", cfg.Host, cfg.Port, cfg.DBName)

	var err error
	DB, err = sqlx.Connect("mysql", dsn)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)

	if err := runMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	log.Println("Database connection established successfully")
	return nil
}

func runMigrations() error {
	if err := createTasksTable(); err != nil {
		return err
	}
	if err := createTaskLogsTable(); err != nil {
		return err
	}
	if err := createTaskDependenciesTable(); err != nil {
		return err
	}
	return nil
}

func createTasksTable() error {
	query := `
	CREATE TABLE IF NOT EXISTS tasks (
		id VARCHAR(36) PRIMARY KEY,
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
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		INDEX idx_status (status),
		INDEX idx_next_execute_at (next_execute_at),
		INDEX idx_schedule_type (schedule_type)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
	`
	_, err := DB.Exec(query)
	return err
}

func createTaskLogsTable() error {
	query := `
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
	`
	_, err := DB.Exec(query)
	return err
}

func createTaskDependenciesTable() error {
	query := `
	CREATE TABLE IF NOT EXISTS task_dependencies (
		id BIGINT AUTO_INCREMENT PRIMARY KEY,
		task_id VARCHAR(36) NOT NULL,
		dependency_task_id VARCHAR(36) NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY unique_dependency (task_id, dependency_task_id),
		INDEX idx_task_id (task_id),
		INDEX idx_dependency_task_id (dependency_task_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
	`
	_, err := DB.Exec(query)
	return err
}

func GetDB() *sqlx.DB {
	return DB
}

func BeginTx() (*sqlx.Tx, error) {
	return DB.Beginx()
}
