package repository

import (
	"fmt"
	"time"

	"github.com/distributed-scheduler/internal/database"
	"github.com/distributed-scheduler/internal/models"
	"github.com/google/uuid"
)

type AlertRepository struct{}

func NewAlertRepository() *AlertRepository {
	return &AlertRepository{}
}

func (r *AlertRepository) CreateAlertConfig(req *models.CreateAlertConfigRequest) (*models.AlertConfig, error) {
	db := database.GetDB()

	existing, err := r.GetAlertConfigByTaskID(req.TaskID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("alert config already exists for task %s", req.TaskID)
	}

	config := &models.AlertConfig{
		ID:              uuid.New().String(),
		TaskID:          req.TaskID,
		Enabled:         true,
		AlertTypes:      req.AlertTypes,
		Channels:        req.Channels,
		EmailRecipients: req.EmailRecipients,
		CooldownSeconds: 300,
	}

	if req.Enabled != nil {
		config.Enabled = *req.Enabled
	}
	if req.CooldownSeconds != nil {
		config.CooldownSeconds = *req.CooldownSeconds
	}

	if len(config.AlertTypes) == 0 {
		config.AlertTypes = models.AlertTypeList{
			models.AlertTypeTaskFailed,
			models.AlertTypeTaskTimeout,
			models.AlertTypeRetryLimitExceeded,
		}
	}
	if len(config.Channels) == 0 {
		config.Channels = models.AlertChannelList{models.AlertChannelEmail}
	}

	query := `
	INSERT INTO alert_configs (id, task_id, enabled, alert_types, channels, email_recipients, cooldown_seconds)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	_, err = db.Exec(query,
		config.ID, config.TaskID, config.Enabled,
		config.AlertTypes, config.Channels,
		config.EmailRecipients, config.CooldownSeconds,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create alert config: %w", err)
	}

	return config, nil
}

func (r *AlertRepository) GetAlertConfigByID(id string) (*models.AlertConfig, error) {
	db := database.GetDB()
	config := &models.AlertConfig{}

	query := `SELECT * FROM alert_configs WHERE id = ?`
	if err := db.Get(config, query, id); err != nil {
		return nil, fmt.Errorf("failed to get alert config: %w", err)
	}

	return config, nil
}

func (r *AlertRepository) GetAlertConfigByTaskID(taskID string) (*models.AlertConfig, error) {
	db := database.GetDB()
	config := &models.AlertConfig{}

	query := `SELECT * FROM alert_configs WHERE task_id = ?`
	if err := db.Get(config, query, taskID); err != nil {
		return nil, nil
	}

	return config, nil
}

func (r *AlertRepository) UpdateAlertConfig(id string, req *models.UpdateAlertConfigRequest) (*models.AlertConfig, error) {
	db := database.GetDB()
	config, err := r.GetAlertConfigByID(id)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, nil
	}

	if req.Enabled != nil {
		config.Enabled = *req.Enabled
	}
	if req.AlertTypes != nil {
		config.AlertTypes = *req.AlertTypes
	}
	if req.Channels != nil {
		config.Channels = *req.Channels
	}
	if req.EmailRecipients != nil {
		config.EmailRecipients = *req.EmailRecipients
	}
	if req.CooldownSeconds != nil {
		config.CooldownSeconds = *req.CooldownSeconds
	}

	query := `
	UPDATE alert_configs SET 
		enabled = ?, alert_types = ?, channels = ?, 
		email_recipients = ?, cooldown_seconds = ?
	WHERE id = ?
	`

	_, err = db.Exec(query,
		config.Enabled, config.AlertTypes, config.Channels,
		config.EmailRecipients, config.CooldownSeconds, config.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update alert config: %w", err)
	}

	return config, nil
}

func (r *AlertRepository) DeleteAlertConfig(id string) error {
	db := database.GetDB()
	query := `DELETE FROM alert_configs WHERE id = ?`
	_, err := db.Exec(query, id)
	return err
}

func (r *AlertRepository) ListAlertConfigs(limit, offset int) ([]*models.AlertConfig, int, error) {
	db := database.GetDB()
	var configs []*models.AlertConfig

	countQuery := `SELECT COUNT(*) FROM alert_configs`
	var total int
	if err := db.Get(&total, countQuery); err != nil {
		return nil, 0, fmt.Errorf("failed to count alert configs: %w", err)
	}

	query := `SELECT * FROM alert_configs ORDER BY created_at DESC LIMIT ? OFFSET ?`
	if err := db.Select(&configs, query, limit, offset); err != nil {
		return nil, 0, fmt.Errorf("failed to list alert configs: %w", err)
	}

	return configs, total, nil
}

func (r *AlertRepository) CreateAlertRecord(record *models.AlertRecord) error {
	db := database.GetDB()

	query := `
	INSERT INTO alert_records (task_id, execution_id, alert_type, channel, recipient, subject, message, sent_at, error)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := db.Exec(query,
		record.TaskID, record.ExecutionID, record.AlertType,
		record.Channel, record.Recipient, record.Subject,
		record.Message, record.SentAt, record.Error,
	)
	return err
}

func (r *AlertRepository) GetTaskAlertRecords(taskID string, limit, offset int) ([]*models.AlertRecord, int, error) {
	db := database.GetDB()
	var records []*models.AlertRecord

	countQuery := `SELECT COUNT(*) FROM alert_records WHERE task_id = ?`
	var total int
	if err := db.Get(&total, countQuery, taskID); err != nil {
		return nil, 0, fmt.Errorf("failed to count alert records: %w", err)
	}

	query := `
	SELECT * FROM alert_records 
	WHERE task_id = ? 
	ORDER BY created_at DESC 
	LIMIT ? OFFSET ?
	`
	if err := db.Select(&records, query, taskID, limit, offset); err != nil {
		return nil, 0, fmt.Errorf("failed to get alert records: %w", err)
	}

	return records, total, nil
}

func (r *AlertRepository) CheckCooldown(taskID string, alertType models.AlertType, cooldownSeconds int) (bool, error) {
	db := database.GetDB()

	query := `
	SELECT COUNT(*) FROM alert_records 
	WHERE task_id = ? AND alert_type = ? 
	AND created_at > ?
	`

	threshold := time.Now().Add(-time.Duration(cooldownSeconds) * time.Second)
	var count int
	if err := db.Get(&count, query, taskID, alertType, threshold); err != nil {
		return false, err
	}

	return count == 0, nil
}
