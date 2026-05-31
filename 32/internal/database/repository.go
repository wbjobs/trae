package database

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"ssh-bastion-audit/internal/bufferpool"
)

type SessionRepository struct {
	db *pgxpool.Pool
}

func NewSessionRepository(db *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{db: db}
}

func (r *SessionRepository) Create(ctx context.Context, s *Session) error {
	s.ID = uuid.New()
	s.StartedAt = time.Now()
	s.Status = "active"

	_, err := r.db.Exec(ctx, `
		INSERT INTO sessions (id, username, src_ip, dst_host, dst_port, started_at, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, s.ID, s.Username, s.SrcIP, s.DstHost, s.DstPort, s.StartedAt, s.Status)
	return err
}

func (r *SessionRepository) EndSession(ctx context.Context, id uuid.UUID, status string, bytesWritten, bytesRead int64) error {
	now := time.Now()
	_, err := r.db.Exec(ctx, `
		UPDATE sessions SET ended_at = $1, status = $2, bytes_written = $3, bytes_read = $4
		WHERE id = $5
	`, now, status, bytesWritten, bytesRead, id)
	return err
}

func (r *SessionRepository) GetByID(ctx context.Context, id uuid.UUID) (*Session, error) {
	var s Session
	err := r.db.QueryRow(ctx, `
		SELECT id, username, src_ip, dst_host, dst_port, started_at, ended_at, status,
			   tty_log_path, screenshot_paths, command_count, alert_count, bytes_written, bytes_read
		FROM sessions WHERE id = $1
	`, id).Scan(&s.ID, &s.Username, &s.SrcIP, &s.DstHost, &s.DstPort, &s.StartedAt,
		&s.EndedAt, &s.Status, &s.TTYLogPath, &s.ScreenshotPaths, &s.CommandCount,
		&s.AlertCount, &s.BytesWritten, &s.BytesRead)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *SessionRepository) List(ctx context.Context, limit, offset int) ([]*Session, int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM sessions").Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, username, src_ip, dst_host, dst_port, started_at, ended_at, status,
			   tty_log_path, command_count, alert_count, bytes_written, bytes_read
		FROM sessions ORDER BY started_at DESC LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	sessions := make([]*Session, 0)
	for rows.Next() {
		var s Session
		err := rows.Scan(&s.ID, &s.Username, &s.SrcIP, &s.DstHost, &s.DstPort,
			&s.StartedAt, &s.EndedAt, &s.Status, &s.TTYLogPath, &s.CommandCount,
			&s.AlertCount, &s.BytesWritten, &s.BytesRead)
		if err != nil {
			return nil, 0, err
		}
		sessions = append(sessions, &s)
	}
	return sessions, total, nil
}

func (r *SessionRepository) UpdateStats(ctx context.Context, id uuid.UUID, commandCount, alertCount int) error {
	_, err := r.db.Exec(ctx, `
		UPDATE sessions SET command_count = command_count + $1, alert_count = alert_count + $2
		WHERE id = $3
	`, commandCount, alertCount, id)
	return err
}

func (r *SessionRepository) UpdateTTYLogPath(ctx context.Context, id uuid.UUID, path string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE sessions SET tty_log_path = $1 WHERE id = $2
	`, path, id)
	return err
}

type TTYFrameRepository struct {
	db *pgxpool.Pool
}

func NewTTYFrameRepository(db *pgxpool.Pool) *TTYFrameRepository {
	return &TTYFrameRepository{db: db}
}

func (r *TTYFrameRepository) Insert(ctx context.Context, frame *TTYFrame) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO tty_frames (time, session_id, offset_ms, frame_type, data)
		VALUES ($1, $2, $3, $4, $5)
	`, frame.Time, frame.SessionID, frame.OffsetMs, frame.FrameType, frame.Data)
	return err
}

func (r *TTYFrameRepository) InsertBatch(ctx context.Context, frames []*bufferpool.PooledTTYFrame) error {
	if len(frames) == 0 {
		return nil
	}

	rows := make([][]interface{}, 0, len(frames))
	for _, f := range frames {
		rows = append(rows, []interface{}{
			f.Time,
			f.SessionID,
			f.OffsetMs,
			f.FrameType,
			f.Data,
		})
	}

	_, err := r.db.CopyFrom(
		ctx,
		pgx.Identifier{"tty_frames"},
		[]string{"time", "session_id", "offset_ms", "frame_type", "data"},
		pgx.CopyFromRows(rows),
	)
	return err
}

func (r *TTYFrameRepository) GetBySessionID(ctx context.Context, sessionID uuid.UUID, startTime, endTime *time.Time) ([]*TTYFrame, error) {
	query := `
		SELECT time, session_id, offset_ms, frame_type, data
		FROM tty_frames WHERE session_id = $1
	`
	args := []interface{}{sessionID}
	argPos := 2

	if startTime != nil {
		query += fmt.Sprintf(" AND time >= $%d", argPos)
		args = append(args, *startTime)
		argPos++
	}
	if endTime != nil {
		query += fmt.Sprintf(" AND time <= $%d", argPos)
		args = append(args, *endTime)
	}

	query += " ORDER BY time ASC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	frames := make([]*TTYFrame, 0)
	for rows.Next() {
		var f TTYFrame
		err := rows.Scan(&f.Time, &f.SessionID, &f.OffsetMs, &f.FrameType, &f.Data)
		if err != nil {
			return nil, err
		}
		frames = append(frames, &f)
	}
	return frames, nil
}

type AlertRepository struct {
	db *pgxpool.Pool
}

func NewAlertRepository(db *pgxpool.Pool) *AlertRepository {
	return &AlertRepository{db: db}
}

func (r *AlertRepository) Create(ctx context.Context, alert *Alert) error {
	alert.ID = uuid.New()
	alert.CreatedAt = time.Now()

	_, err := r.db.Exec(ctx, `
		INSERT INTO alerts (id, session_id, rule_name, severity, matched_content, command, created_at, resolved)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, alert.ID, alert.SessionID, alert.RuleName, alert.Severity, alert.MatchedContent,
		alert.Command, alert.CreatedAt, false)
	return err
}

func (r *AlertRepository) GetBySessionID(ctx context.Context, sessionID uuid.UUID) ([]*Alert, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, session_id, rule_name, severity, matched_content, command, created_at, resolved
		FROM alerts WHERE session_id = $1 ORDER BY created_at DESC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	alerts := make([]*Alert, 0)
	for rows.Next() {
		var a Alert
		err := rows.Scan(&a.ID, &a.SessionID, &a.RuleName, &a.Severity, &a.MatchedContent,
			&a.Command, &a.CreatedAt, &a.Resolved)
		if err != nil {
			return nil, err
		}
		alerts = append(alerts, &a)
	}
	return alerts, nil
}

func (r *AlertRepository) List(ctx context.Context, limit, offset int, severity string) ([]*Alert, int64, error) {
	var total int64
	countQuery := "SELECT COUNT(*) FROM alerts"
	query := `
		SELECT id, session_id, rule_name, severity, matched_content, command, created_at, resolved
		FROM alerts
	`
	args := []interface{}{}
	argPos := 1

	if severity != "" {
		countQuery += fmt.Sprintf(" WHERE severity = $%d", argPos)
		query += fmt.Sprintf(" WHERE severity = $%d", argPos)
		args = append(args, severity)
		argPos++
	}

	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argPos, argPos+1)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	alerts := make([]*Alert, 0)
	for rows.Next() {
		var a Alert
		err := rows.Scan(&a.ID, &a.SessionID, &a.RuleName, &a.Severity, &a.MatchedContent,
			&a.Command, &a.CreatedAt, &a.Resolved)
		if err != nil {
			return nil, 0, err
		}
		alerts = append(alerts, &a)
	}
	return alerts, total, nil
}

func (r *AlertRepository) Resolve(ctx context.Context, id uuid.UUID, resolvedBy, notes string) error {
	now := time.Now()
	_, err := r.db.Exec(ctx, `
		UPDATE alerts SET resolved = true, resolved_at = $1, resolved_by = $2, notes = $3
		WHERE id = $4
	`, now, resolvedBy, notes, id)
	return err
}

type AlertRuleRepository struct {
	db *pgxpool.Pool
}

func NewAlertRuleRepository(db *pgxpool.Pool) *AlertRuleRepository {
	return &AlertRuleRepository{db: db}
}

func (r *AlertRuleRepository) Create(ctx context.Context, rule *AlertRule) error {
	rule.ID = uuid.New()
	rule.CreatedAt = time.Now()
	rule.UpdatedAt = time.Now()

	_, err := r.db.Exec(ctx, `
		INSERT INTO alert_rules (id, name, pattern, severity, enabled, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, rule.ID, rule.Name, rule.Pattern, rule.Severity, rule.Enabled, rule.Description,
		rule.CreatedAt, rule.UpdatedAt)
	return err
}

func (r *AlertRuleRepository) GetAllEnabled(ctx context.Context) ([]*AlertRule, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, pattern, severity, enabled, description, created_at, updated_at
		FROM alert_rules WHERE enabled = true
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rules := make([]*AlertRule, 0)
	for rows.Next() {
		var rl AlertRule
		err := rows.Scan(&rl.ID, &rl.Name, &rl.Pattern, &rl.Severity, &rl.Enabled,
			&rl.Description, &rl.CreatedAt, &rl.UpdatedAt)
		if err != nil {
			return nil, err
		}
		rules = append(rules, &rl)
	}
	return rules, nil
}

func (r *AlertRuleRepository) List(ctx context.Context, limit, offset int) ([]*AlertRule, int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM alert_rules").Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, name, pattern, severity, enabled, description, created_at, updated_at
		FROM alert_rules ORDER BY created_at DESC LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	rules := make([]*AlertRule, 0)
	for rows.Next() {
		var rl AlertRule
		err := rows.Scan(&rl.ID, &rl.Name, &rl.Pattern, &rl.Severity, &rl.Enabled,
			&rl.Description, &rl.CreatedAt, &rl.UpdatedAt)
		if err != nil {
			return nil, 0, err
		}
		rules = append(rules, &rl)
	}
	return rules, total, nil
}

func (r *AlertRuleRepository) Update(ctx context.Context, rule *AlertRule) error {
	rule.UpdatedAt = time.Now()
	_, err := r.db.Exec(ctx, `
		UPDATE alert_rules SET name = $1, pattern = $2, severity = $3, enabled = $4,
							   description = $5, updated_at = $6
		WHERE id = $7
	`, rule.Name, rule.Pattern, rule.Severity, rule.Enabled, rule.Description,
		rule.UpdatedAt, rule.ID)
	return err
}

func (r *AlertRuleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM alert_rules WHERE id = $1", id)
	return err
}

type ScreenshotRepository struct {
	db *pgxpool.Pool
}

func NewScreenshotRepository(db *pgxpool.Pool) *ScreenshotRepository {
	return &ScreenshotRepository{db: db}
}

func (r *ScreenshotRepository) Create(ctx context.Context, s *Screenshot) error {
	s.ID = uuid.New()
	s.CreatedAt = time.Now()

	_, err := r.db.Exec(ctx, `
		INSERT INTO screenshots (id, session_id, offset_ms, created_at, storage_path, content_type, size_bytes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, s.ID, s.SessionID, s.OffsetMs, s.CreatedAt, s.StoragePath, s.ContentType, s.SizeBytes)
	return err
}

func (r *ScreenshotRepository) GetBySessionID(ctx context.Context, sessionID uuid.UUID) ([]*Screenshot, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, session_id, offset_ms, created_at, storage_path, content_type, size_bytes
		FROM screenshots WHERE session_id = $1 ORDER BY offset_ms ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	screenshots := make([]*Screenshot, 0)
	for rows.Next() {
		var s Screenshot
		err := rows.Scan(&s.ID, &s.SessionID, &s.OffsetMs, &s.CreatedAt,
			&s.StoragePath, &s.ContentType, &s.SizeBytes)
		if err != nil {
			return nil, err
		}
		screenshots = append(screenshots, &s)
	}
	return screenshots, nil
}
