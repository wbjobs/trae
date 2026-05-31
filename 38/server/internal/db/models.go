package db

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	Username  string    `gorm:"uniqueIndex;size:50;not null" json:"username"`
	Password  string    `gorm:"size:255;not null" json:"-"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Role      string    `gorm:"size:20;not null;default:'user'" json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Card struct {
	ID                  string    `gorm:"type:uuid;primaryKey" json:"id"`
	UID                 string    `gorm:"size:32;uniqueIndex;not null" json:"uid"`
	OwnerName           string    `gorm:"size:100;not null" json:"owner_name"`
	CardType            string    `gorm:"size:50;not null" json:"card_type"`
	PermissionGroupID   string    `gorm:"type:uuid;index" json:"permission_group_id"`
	PermissionGroupName string    `gorm:"size:100" json:"permission_group_name"`
	Status              string    `gorm:"size:20;not null;default:'active'" json:"status"`
	KeyA                string    `gorm:"size:32" json:"-"`
	KeyB                string    `gorm:"size:32" json:"-"`
	CreatedAt           int64     `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type PermissionGroup struct {
	ID          string      `gorm:"type:uuid;primaryKey" json:"id"`
	Name        string      `gorm:"size:100;uniqueIndex;not null" json:"name"`
	Description string      `gorm:"size:255" json:"description"`
	TimeRules   []TimeRule  `gorm:"foreignKey:PermissionGroupID" json:"time_rules"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

type TimeRule struct {
	ID                string    `gorm:"type:uuid;primaryKey" json:"id"`
	PermissionGroupID string    `gorm:"type:uuid;index;not null" json:"permission_group_id"`
	DayOfWeek         int32     `gorm:"not null" json:"day_of_week"`
	StartTime         string    `gorm:"size:5;not null" json:"start_time"`
	EndTime           string    `gorm:"size:5;not null" json:"end_time"`
	CreatedAt         time.Time `json:"created_at"`
}

type AccessLog struct {
	ID          string    `gorm:"type:uuid;primaryKey" json:"id"`
	CardUID     string    `gorm:"size:32;index" json:"card_uid"`
	CardOwner   string    `gorm:"size:100;index" json:"card_owner"`
	DoorName    string    `gorm:"size:100;not null" json:"door_name"`
	AccessType  string    `gorm:"size:50;not null" json:"access_type"`
	Result      string    `gorm:"size:20;not null" json:"result"`
	Reason      string    `gorm:"size:255" json:"reason"`
	Timestamp   int64     `gorm:"index" json:"timestamp"`
	IsSuspicious bool     `gorm:"default:false" json:"is_suspicious"`
	AnomalyScore float64  `gorm:"default:0" json:"anomaly_score"`
}

type Door struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	Name      string    `gorm:"size:100;uniqueIndex;not null" json:"name"`
	Location  string    `gorm:"size:255" json:"location"`
	Status    string    `gorm:"size:20;not null;default:'online'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type BlacklistedCard struct {
	ID         string   `gorm:"type:uuid;primaryKey" json:"id"`
	UID        string   `gorm:"size:32;uniqueIndex;not null" json:"uid"`
	CardType   string   `gorm:"size:50" json:"card_type"`
	Reason     string   `gorm:"size:255" json:"reason"`
	Source     string   `gorm:"size:50" json:"source"`
	DetectedAt int64    `json:"detected_at"`
	ExpiresAt  int64    `json:"expires_at"`
	IsActive   bool     `gorm:"default:true" json:"is_active"`
	ReportedBy string   `gorm:"size:100" json:"reported_by"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type SuspiciousCard struct {
	ID              string   `gorm:"type:uuid;primaryKey" json:"id"`
	UID             string   `gorm:"size:32;uniqueIndex;not null" json:"uid"`
	OwnerName       string   `gorm:"size:100" json:"owner_name"`
	AnomalyScore    float64  `gorm:"default:0" json:"anomaly_score"`
	Indicators      string   `gorm:"type:text" json:"indicators"`
	FirstDetected   int64    `json:"first_detected"`
	LastSeen        int64    `json:"last_seen"`
	ViolationCount  int32    `gorm:"default:0" json:"violation_count"`
	IsBlacklisted   bool     `gorm:"default:false" json:"is_blacklisted"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.NewString()
	}
	return nil
}

func (c *Card) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	if c.CreatedAt == 0 {
		c.CreatedAt = time.Now().Unix()
	}
	return nil
}

func (pg *PermissionGroup) BeforeCreate(tx *gorm.DB) error {
	if pg.ID == "" {
		pg.ID = uuid.NewString()
	}
	return nil
}

func (tr *TimeRule) BeforeCreate(tx *gorm.DB) error {
	if tr.ID == "" {
		tr.ID = uuid.NewString()
	}
	return nil
}

func (al *AccessLog) BeforeCreate(tx *gorm.DB) error {
	if al.ID == "" {
		al.ID = uuid.NewString()
	}
	if al.Timestamp == 0 {
		al.Timestamp = time.Now().Unix()
	}
	return nil
}

func (d *Door) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.NewString()
	}
	return nil
}

func (bc *BlacklistedCard) BeforeCreate(tx *gorm.DB) error {
	if bc.ID == "" {
		bc.ID = uuid.NewString()
	}
	if bc.DetectedAt == 0 {
		bc.DetectedAt = time.Now().Unix()
	}
	return nil
}

func (sc *SuspiciousCard) BeforeCreate(tx *gorm.DB) error {
	if sc.ID == "" {
		sc.ID = uuid.NewString()
	}
	if sc.FirstDetected == 0 {
		sc.FirstDetected = time.Now().Unix()
	}
	if sc.LastSeen == 0 {
		sc.LastSeen = time.Now().Unix()
	}
	return nil
}
