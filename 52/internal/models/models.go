package models

import (
	"time"
)

type TaskStatus string

const (
	StatusPending TaskStatus = "pending"
	StatusRunning TaskStatus = "running"
	StatusDone    TaskStatus = "done"
	StatusFailed  TaskStatus = "failed"
)

type TaskPriority int

const (
	PriorityLow    TaskPriority = 1
	PriorityMedium TaskPriority = 2
	PriorityHigh   TaskPriority = 3
)

func ParsePriority(s string) TaskPriority {
	switch s {
	case "high":
		return PriorityHigh
	case "medium":
		return PriorityMedium
	case "low":
		return PriorityLow
	default:
		return PriorityMedium
	}
}

func (p TaskPriority) String() string {
	switch p {
	case PriorityHigh:
		return "high"
	case PriorityMedium:
		return "medium"
	case PriorityLow:
		return "low"
	default:
		return "medium"
	}
}

func (p TaskPriority) MarshalJSON() ([]byte, error) {
	return []byte(`"` + p.String() + `"`), nil
}

func (p *TaskPriority) UnmarshalJSON(data []byte) error {
	s := string(data)
	s = s[1 : len(s)-1]
	*p = ParsePriority(s)
	return nil
}

type Task struct {
	ID            string      `gorm:"primaryKey;type:uuid" json:"id"`
	RequestID     string      `gorm:"uniqueIndex;not null" json:"request_id"`
	Status        TaskStatus  `gorm:"not null;default:pending" json:"status"`
	Priority      TaskPriority `gorm:"not null;default:2;index:idx_priority_created" json:"priority"`
	CallbackURL   string      `gorm:"not null" json:"callback_url"`
	TotalRecords  int         `gorm:"not null" json:"total_records"`
	ProcessedCount int        `gorm:"default:0" json:"processed_count"`
	ErrorMsg      string      `gorm:"type:text" json:"error_msg,omitempty"`
	CreatedAt     time.Time   `gorm:"index:idx_priority_created" json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
	StartedAt     *time.Time  `json:"started_at,omitempty"`
	CompletedAt   *time.Time  `json:"completed_at,omitempty"`
	Records       []UserRecord `gorm:"foreignKey:TaskID" json:"records,omitempty"`
}

type UserRecord struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TaskID     string    `gorm:"index;not null" json:"task_id"`
	UserID     string    `gorm:"not null" json:"user_id"`
	Username   string    `json:"username"`
	Email      string    `json:"email"`
	Phone      string    `json:"phone"`
	Age        int       `json:"age"`
	IsValid    bool      `gorm:"default:false" json:"is_valid"`
	Processed  bool      `gorm:"default:false" json:"processed"`
	ErrorMsg   string    `gorm:"type:text" json:"error_msg,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
