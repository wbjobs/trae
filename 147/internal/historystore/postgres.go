package historystore

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/realtime-feature-store/internal/config"
	_ "github.com/lib/pq"
)

type FeatureRecord struct {
	UserID       string
	FeatureName  string
	FeatureValue float64
	Timestamp    int64
}

type HistoryStore struct {
	db  *sql.DB
	cfg *config.Config
}

func New(cfg *config.Config) (*HistoryStore, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.PostgresHost,
		cfg.PostgresPort,
		cfg.PostgresUser,
		cfg.PostgresPassword,
		cfg.PostgresDB,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	return &HistoryStore{
		db:  db,
		cfg: cfg,
	}, nil
}

func (h *HistoryStore) Close() error {
	return h.db.Close()
}

func (h *HistoryStore) InitSchema(ctx context.Context) error {
	schemaSQL := `
	CREATE TABLE IF NOT EXISTS feature_history (
		user_id VARCHAR(255) NOT NULL,
		feature_name VARCHAR(255) NOT NULL,
		feature_value DOUBLE PRECISION NOT NULL,
		timestamp BIGINT NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_feature_history_lookup
	ON feature_history (user_id, feature_name, timestamp DESC);

	CREATE INDEX IF NOT EXISTS idx_feature_history_timestamp
	ON feature_history (timestamp DESC);

	CREATE INDEX IF NOT EXISTS idx_feature_history_user
	ON feature_history (user_id, timestamp DESC);
	`

	_, err := h.db.ExecContext(ctx, schemaSQL)
	if err != nil {
		return fmt.Errorf("create schema: %w", err)
	}

	log.Println("History store schema initialized")
	return nil
}

func (h *HistoryStore) WriteFeature(ctx context.Context, record FeatureRecord) error {
	query := `
		INSERT INTO feature_history (user_id, feature_name, feature_value, timestamp)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, feature_name, timestamp)
		DO UPDATE SET feature_value = EXCLUDED.feature_value
	`

	_, err := h.db.ExecContext(ctx, query,
		record.UserID,
		record.FeatureName,
		record.FeatureValue,
		record.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("write feature: %w", err)
	}

	return nil
}

func (h *HistoryStore) WriteFeatures(ctx context.Context, records []FeatureRecord) error {
	if len(records) == 0 {
		return nil
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	query := `
		INSERT INTO feature_history (user_id, feature_name, feature_value, timestamp)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, feature_name, timestamp)
		DO UPDATE SET feature_value = EXCLUDED.feature_value
	`

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, record := range records {
		if _, err := stmt.ExecContext(ctx,
			record.UserID,
			record.FeatureName,
			record.FeatureValue,
			record.Timestamp,
		); err != nil {
			return fmt.Errorf("insert record: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}

func (h *HistoryStore) GetFeatureAtTime(ctx context.Context, userID, featureName string, targetTimestamp int64) (float64, int64, error) {
	query := `
		SELECT feature_value, timestamp
		FROM feature_history
		WHERE user_id = $1
		  AND feature_name = $2
		  AND timestamp <= $3
		ORDER BY timestamp DESC
		LIMIT 1
	`

	var value float64
	var timestamp int64

	err := h.db.QueryRowContext(ctx, query, userID, featureName, targetTimestamp).
		Scan(&value, &timestamp)
	if err == sql.ErrNoRows {
		return 0, 0, nil
	}
	if err != nil {
		return 0, 0, fmt.Errorf("query feature at time: %w", err)
	}

	return value, timestamp, nil
}

func (h *HistoryStore) GetFeaturesAtTime(ctx context.Context, userID string, featureNames []string, targetTimestamp int64) (map[string]float64, map[string]int64, error) {
	values := make(map[string]float64)
	timestamps := make(map[string]int64)

	for _, name := range featureNames {
		value, ts, err := h.GetFeatureAtTime(ctx, userID, name, targetTimestamp)
		if err != nil {
			return nil, nil, err
		}
		values[name] = value
		timestamps[name] = ts
	}

	return values, timestamps, nil
}

func (h *HistoryStore) BatchGetFeaturesAtTime(ctx context.Context, userIDs []string, featureNames []string, targetTimestamp int64) (map[string]map[string]float64, map[string]map[string]int64, error) {
	values := make(map[string]map[string]float64)
	timestamps := make(map[string]map[string]int64)

	for _, userID := range userIDs {
		userValues, userTimestamps, err := h.GetFeaturesAtTime(ctx, userID, featureNames, targetTimestamp)
		if err != nil {
			return nil, nil, err
		}
		values[userID] = userValues
		timestamps[userID] = userTimestamps
	}

	return values, timestamps, nil
}

func (h *HistoryStore) GetFeatureHistory(ctx context.Context, userID, featureName string, startTimestamp, endTimestamp int64, limit int) ([]FeatureRecord, error) {
	query := `
		SELECT user_id, feature_name, feature_value, timestamp
		FROM feature_history
		WHERE user_id = $1
		  AND feature_name = $2
		  AND timestamp BETWEEN $3 AND $4
		ORDER BY timestamp ASC
		LIMIT $5
	`

	rows, err := h.db.QueryContext(ctx, query, userID, featureName, startTimestamp, endTimestamp, limit)
	if err != nil {
		return nil, fmt.Errorf("query feature history: %w", err)
	}
	defer rows.Close()

	var records []FeatureRecord
	for rows.Next() {
		var r FeatureRecord
		if err := rows.Scan(&r.UserID, &r.FeatureName, &r.FeatureValue, &r.Timestamp); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		records = append(records, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}

	return records, nil
}

func (h *HistoryStore) CleanupOldData(ctx context.Context) error {
	retentionPeriod := time.Now().Add(-h.cfg.HistoryRetention).Unix()

	query := `
		DELETE FROM feature_history
		WHERE timestamp < $1
	`

	result, err := h.db.ExecContext(ctx, query, retentionPeriod)
	if err != nil {
		return fmt.Errorf("cleanup old data: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("Cleaned up %d old feature records", rowsAffected)
	}

	return nil
}

func (h *HistoryStore) RunCleanup(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("History cleanup stopped")
			return
		case <-ticker.C:
			if err := h.CleanupOldData(ctx); err != nil {
				log.Printf("Error cleaning up old data: %v", err)
			}
		}
	}
}

func (h *HistoryStore) Ping(ctx context.Context) error {
	return h.db.PingContext(ctx)
}
