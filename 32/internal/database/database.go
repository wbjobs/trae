package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"ssh-bastion-audit/internal/config"
)

var DB *pgxpool.Pool

func Init(cfg *config.DatabaseConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	poolConfig, err := pgxpool.ParseConfig(cfg.DSN())
	if err != nil {
		return fmt.Errorf("failed to parse database config: %w", err)
	}

	poolConfig.MaxConns = 20
	poolConfig.MinConns = 5
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute

	DB, err = pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err = DB.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	if err = initSchema(ctx); err != nil {
		return fmt.Errorf("failed to init schema: %w", err)
	}

	return nil
}

func initSchema(ctx context.Context) error {
	schemaSQL := `
		CREATE EXTENSION IF NOT EXISTS timescaledb;

		CREATE TABLE IF NOT EXISTS sessions (
			id UUID PRIMARY KEY,
			username VARCHAR(64) NOT NULL,
			src_ip VARCHAR(45) NOT NULL,
			dst_host VARCHAR(255) NOT NULL,
			dst_port INT NOT NULL,
			started_at TIMESTAMPTZ NOT NULL,
			ended_at TIMESTAMPTZ,
			status VARCHAR(32) NOT NULL DEFAULT 'active',
			tty_log_path VARCHAR(512),
			screenshot_paths TEXT[],
			command_count INT DEFAULT 0,
			alert_count INT DEFAULT 0,
			bytes_written BIGINT DEFAULT 0,
			bytes_read BIGINT DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS session_events (
			time TIMESTAMPTZ NOT NULL,
			session_id UUID NOT NULL,
			event_type VARCHAR(32) NOT NULL,
			data JSONB,
			PRIMARY KEY (time, session_id)
		);

		SELECT create_hypertable('session_events', 'time', if_not_exists => TRUE);

		CREATE TABLE IF NOT EXISTS tty_frames (
			time TIMESTAMPTZ NOT NULL,
			session_id UUID NOT NULL,
			offset_ms BIGINT NOT NULL,
			frame_type VARCHAR(16) NOT NULL,
			data BYTEA NOT NULL,
			PRIMARY KEY (time, session_id, offset_ms)
		);

		SELECT create_hypertable('tty_frames', 'time', if_not_exists => TRUE);

		CREATE TABLE IF NOT EXISTS alerts (
			id UUID PRIMARY KEY,
			session_id UUID NOT NULL,
			rule_name VARCHAR(128) NOT NULL,
			severity VARCHAR(32) NOT NULL,
			matched_content TEXT NOT NULL,
			command TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			resolved BOOLEAN DEFAULT FALSE,
			resolved_at TIMESTAMPTZ,
			resolved_by VARCHAR(64),
			notes TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_alerts_session_id ON alerts(session_id);
		CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
		CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);

		CREATE TABLE IF NOT EXISTS alert_rules (
			id UUID PRIMARY KEY,
			name VARCHAR(128) UNIQUE NOT NULL,
			pattern VARCHAR(512) NOT NULL,
			severity VARCHAR(32) NOT NULL,
			enabled BOOLEAN DEFAULT TRUE,
			description TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS screenshots (
			id UUID PRIMARY KEY,
			session_id UUID NOT NULL,
			offset_ms BIGINT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL,
			storage_path VARCHAR(512) NOT NULL,
			content_type VARCHAR(64) DEFAULT 'image/png',
			size_bytes BIGINT
		);

		CREATE INDEX IF NOT EXISTS idx_screenshots_session_id ON screenshots(session_id);
	`

	_, err := DB.Exec(ctx, schemaSQL)
	return err
}

func Close() {
	if DB != nil {
		DB.Close()
	}
}
