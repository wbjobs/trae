package models

import (
	"time"
)

type TaskStatus string

const (
	TaskStatusPending TaskStatus = "pending"
	TaskStatusRunning TaskStatus = "running"
	TaskStatusSuccess TaskStatus = "success"
	TaskStatusFailed  TaskStatus = "failed"
)

type Task struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:100;not null" json:"name"`
	Description string         `gorm:"size:500" json:"description"`
	Status      TaskStatus     `gorm:"size:20;default:'pending'" json:"status"`
	CronExpr    string         `gorm:"size:50" json:"cronExpr"`
	PositionX   float64        `gorm:"default:100" json:"positionX"`
	PositionY   float64        `gorm:"default:100" json:"positionY"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	Dependencies []TaskDependency `gorm:"foreignKey:TaskID;references:ID" json:"-"`
	UpstreamTasks  []Task         `gorm:"many2many:task_dependencies;joinForeignKey:TaskID;joinReferences:UpstreamTaskID" json:"-"`
}

type TaskDependency struct {
	ID             uint `gorm:"primaryKey"`
	TaskID         uint `gorm:"index;not null"`
	UpstreamTaskID uint `gorm:"index;not null"`
	CreatedAt      time.Time
	Task           Task `gorm:"foreignKey:TaskID;references:ID"`
	UpstreamTask   Task `gorm:"foreignKey:UpstreamTaskID;references:ID"`
}

type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type GraphNode struct {
	ID          uint       `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Status      TaskStatus `json:"status"`
	PositionX   float64    `json:"positionX"`
	PositionY   float64    `json:"positionY"`
}

type GraphEdge struct {
	ID     uint `json:"id"`
	Source uint `json:"source"`
	Target uint `json:"target"`
}

type TaskHistory struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	TaskID      uint       `gorm:"index;not null" json:"taskId"`
	Version     int        `gorm:"not null" json:"version"`
	Name        string     `gorm:"size:100;not null" json:"name"`
	Description string     `gorm:"size:500" json:"description"`
	Status      TaskStatus `gorm:"size:20;not null" json:"status"`
	CronExpr    string     `gorm:"size:50" json:"cronExpr"`
	PositionX   float64    `json:"positionX"`
	PositionY   float64    `json:"positionY"`
	Operation   string     `gorm:"size:20;not null" json:"operation"`
	SnapshotAt  time.Time  `gorm:"index;not null" json:"snapshotAt"`
}

type DependencyHistory struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	TaskID         uint      `gorm:"index;not null" json:"taskId"`
	UpstreamTaskID uint    `gorm:"index;not null" json:"upstreamTaskId"`
	Operation      string    `gorm:"size:20;not null" json:"operation"`
	SnapshotAt     time.Time `gorm:"index;not null" json:"snapshotAt"`
}

type HistoryTimelineItem struct {
	Timestamp time.Time `json:"timestamp"`
	Type      string    `json:"type"`
	TaskID    uint      `json:"taskId"`
	TaskName  string    `json:"taskName"`
	Operation string    `json:"operation"`
}
