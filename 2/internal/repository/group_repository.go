package repository

import (
	"fmt"

	"github.com/distributed-scheduler/internal/database"
	"github.com/distributed-scheduler/internal/models"
	"github.com/google/uuid"
)

type TaskGroupRepository struct{}

func NewTaskGroupRepository() *TaskGroupRepository {
	return &TaskGroupRepository{}
}

func (r *TaskGroupRepository) CreateTaskGroup(req *models.CreateTaskGroupRequest) (*models.TaskGroup, error) {
	db := database.GetDB()

	group := &models.TaskGroup{
		ID:          uuid.New().String(),
		Name:        req.Name,
		Description: req.Description,
	}

	query := `INSERT INTO task_groups (id, name, description) VALUES (?, ?, ?)`
	_, err := db.Exec(query, group.ID, group.Name, group.Description)
	if err != nil {
		return nil, fmt.Errorf("failed to create task group: %w", err)
	}

	return group, nil
}

func (r *TaskGroupRepository) GetTaskGroupByID(id string) (*models.TaskGroup, error) {
	db := database.GetDB()
	group := &models.TaskGroup{}

	query := `SELECT * FROM task_groups WHERE id = ?`
	if err := db.Get(group, query, id); err != nil {
		return nil, fmt.Errorf("failed to get task group: %w", err)
	}

	return group, nil
}

func (r *TaskGroupRepository) GetAllTaskGroups() ([]*models.TaskGroup, error) {
	db := database.GetDB()
	var groups []*models.TaskGroup

	query := `SELECT * FROM task_groups ORDER BY created_at DESC`
	if err := db.Select(&groups, query); err != nil {
		return nil, fmt.Errorf("failed to list task groups: %w", err)
	}

	return groups, nil
}

func (r *TaskGroupRepository) UpdateTaskGroup(id string, req *models.UpdateTaskGroupRequest) (*models.TaskGroup, error) {
	db := database.GetDB()
	group, err := r.GetTaskGroupByID(id)
	if err != nil {
		return nil, err
	}
	if group == nil {
		return nil, nil
	}

	if req.Name != nil {
		group.Name = *req.Name
	}
	if req.Description != nil {
		group.Description = *req.Description
	}

	query := `UPDATE task_groups SET name = ?, description = ? WHERE id = ?`
	_, err = db.Exec(query, group.Name, group.Description, group.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update task group: %w", err)
	}

	return group, nil
}

func (r *TaskGroupRepository) DeleteTaskGroup(id string) error {
	db := database.GetDB()

	tx, err := db.Beginx()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`UPDATE tasks SET task_group_id = NULL WHERE task_group_id = ?`, id); err != nil {
		return fmt.Errorf("failed to unassign tasks from group: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM task_groups WHERE id = ?`, id); err != nil {
		return fmt.Errorf("failed to delete task group: %w", err)
	}

	return tx.Commit()
}

func (r *TaskGroupRepository) GetTasksByGroupID(groupID string) ([]*models.Task, error) {
	db := database.GetDB()
	var tasks []*models.Task

	query := `SELECT * FROM tasks WHERE task_group_id = ? ORDER BY created_at DESC`
	if err := db.Select(&tasks, query, groupID); err != nil {
		return nil, fmt.Errorf("failed to get tasks by group: %w", err)
	}

	taskRepo := NewTaskRepository()
	for _, task := range tasks {
		deps, err := taskRepo.GetTaskDependencies(task.ID)
		if err != nil {
			return nil, err
		}
		task.Dependencies = deps
	}

	return tasks, nil
}

func (r *TaskGroupRepository) AssignTaskToGroup(taskID, groupID string) error {
	db := database.GetDB()
	query := `UPDATE tasks SET task_group_id = ? WHERE id = ?`
	_, err := db.Exec(query, groupID, taskID)
	if err != nil {
		return fmt.Errorf("failed to assign task to group: %w", err)
	}
	return nil
}

func (r *TaskGroupRepository) RemoveTaskFromGroup(taskID string) error {
	db := database.GetDB()
	query := `UPDATE tasks SET task_group_id = NULL WHERE id = ?`
	_, err := db.Exec(query, taskID)
	if err != nil {
		return fmt.Errorf("failed to remove task from group: %w", err)
	}
	return nil
}
