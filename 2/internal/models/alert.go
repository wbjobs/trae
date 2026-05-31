package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

type AlertType string
type AlertChannel string

const (
	AlertTypeTaskFailed        AlertType = "task_failed"
	AlertTypeTaskTimeout       AlertType = "task_timeout"
	AlertTypeRetryLimitExceeded AlertType = "retry_limit_exceeded"
	AlertTypeResourceExceeded  AlertType = "resource_exceeded"

	AlertChannelEmail AlertChannel = "email"
)

type AlertConfig struct {
	ID              string           `db:"id" json:"id"`
	TaskID          string           `db:"task_id" json:"task_id"`
	Enabled         bool             `db:"enabled" json:"enabled"`
	AlertTypes      AlertTypeList    `db:"alert_types" json:"alert_types"`
	Channels        AlertChannelList `db:"channels" json:"channels"`
	EmailRecipients EmailRecipients  `db:"email_recipients" json:"email_recipients"`
	CooldownSeconds int              `db:"cooldown_seconds" json:"cooldown_seconds"`
	CreatedAt       time.Time        `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time        `db:"updated_at" json:"updated_at"`
}

type AlertRecord struct {
	ID          int64      `db:"id" json:"id"`
	TaskID      string     `db:"task_id" json:"task_id"`
	ExecutionID string     `db:"execution_id" json:"execution_id"`
	AlertType   AlertType  `db:"alert_type" json:"alert_type"`
	Channel     AlertChannel `db:"channel" json:"channel"`
	Recipient   string     `db:"recipient" json:"recipient"`
	Subject     string     `db:"subject" json:"subject"`
	Message     string     `db:"message" json:"message"`
	SentAt      *time.Time `db:"sent_at" json:"sent_at"`
	Error       string     `db:"error" json:"error"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
}

type AlertTypeList []AlertType

func (l *AlertTypeList) Scan(value interface{}) error {
	if value == nil {
		*l = make(AlertTypeList, 0)
		return nil
	}

	var data []byte
	switch v := value.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		return fmt.Errorf("unsupported type for AlertTypeList: %T", value)
	}

	if len(data) == 0 {
		*l = make(AlertTypeList, 0)
		return nil
	}

	var temp AlertTypeList
	if err := json.Unmarshal(data, &temp); err != nil {
		return fmt.Errorf("failed to unmarshal AlertTypeList: %w", err)
	}

	*l = temp
	return nil
}

func (l AlertTypeList) Value() (driver.Value, error) {
	if l == nil {
		return []byte("[]"), nil
	}
	return json.Marshal(l)
}

type AlertChannelList []AlertChannel

func (l *AlertChannelList) Scan(value interface{}) error {
	if value == nil {
		*l = make(AlertChannelList, 0)
		return nil
	}

	var data []byte
	switch v := value.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		return fmt.Errorf("unsupported type for AlertChannelList: %T", value)
	}

	if len(data) == 0 {
		*l = make(AlertChannelList, 0)
		return nil
	}

	var temp AlertChannelList
	if err := json.Unmarshal(data, &temp); err != nil {
		return fmt.Errorf("failed to unmarshal AlertChannelList: %w", err)
	}

	*l = temp
	return nil
}

func (l AlertChannelList) Value() (driver.Value, error) {
	if l == nil {
		return []byte("[]"), nil
	}
	return json.Marshal(l)
}

type EmailRecipients []string

func (e *EmailRecipients) Scan(value interface{}) error {
	if value == nil {
		*e = make(EmailRecipients, 0)
		return nil
	}

	var data []byte
	switch v := value.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		return fmt.Errorf("unsupported type for EmailRecipients: %T", value)
	}

	if len(data) == 0 {
		*e = make(EmailRecipients, 0)
		return nil
	}

	var temp EmailRecipients
	if err := json.Unmarshal(data, &temp); err != nil {
		return fmt.Errorf("failed to unmarshal EmailRecipients: %w", err)
	}

	*e = temp
	return nil
}

func (e EmailRecipients) Value() (driver.Value, error) {
	if e == nil {
		return []byte("[]"), nil
	}
	return json.Marshal(e)
}

type CreateAlertConfigRequest struct {
	TaskID          string           `json:"task_id" binding:"required"`
	Enabled         *bool            `json:"enabled"`
	AlertTypes      AlertTypeList    `json:"alert_types"`
	Channels        AlertChannelList `json:"channels"`
	EmailRecipients EmailRecipients  `json:"email_recipients"`
	CooldownSeconds *int             `json:"cooldown_seconds"`
}

type UpdateAlertConfigRequest struct {
	Enabled         *bool            `json:"enabled"`
	AlertTypes      *AlertTypeList   `json:"alert_types"`
	Channels        *AlertChannelList `json:"channels"`
	EmailRecipients *EmailRecipients `json:"email_recipients"`
	CooldownSeconds *int             `json:"cooldown_seconds"`
}
