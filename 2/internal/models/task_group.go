package models

import (
	"time"
)

type TaskGroup struct {
	ID          string    `db:"id" json:"id"`
	Name        string    `db:"name" json:"name"`
	Description string    `db:"description" json:"description"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at" json:"updated_at"`
}

type CreateTaskGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

type UpdateTaskGroupRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type BatchOperationRequest struct {
	TaskIDs   []string `json:"task_ids"`
	TaskGroupID *string `json:"task_group_id"`
}

type BatchOperationResult struct {
	SuccessCount int      `json:"success_count"`
	FailedCount  int      `json:"failed_count"`
	FailedIDs   []string `json:"failed_ids,omitempty"`
}
