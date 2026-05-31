package services

import (
	"errors"
	"task-scheduler/config"
	"task-scheduler/models"
	"time"
)

type TaskService struct{}

func NewTaskService() *TaskService {
	return &TaskService{}
}

func (s *TaskService) recordTaskHistory(task *models.Task, operation string) error {
	var maxVersion int
	config.DB.Model(&models.TaskHistory{}).
		Where("task_id = ?", task.ID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	history := &models.TaskHistory{
		TaskID:      task.ID,
		Version:     maxVersion + 1,
		Name:        task.Name,
		Description: task.Description,
		Status:      task.Status,
		CronExpr:    task.CronExpr,
		PositionX:   task.PositionX,
		PositionY:   task.PositionY,
		Operation:   operation,
		SnapshotAt:  time.Now(),
	}
	return config.DB.Create(history).Error
}

func (s *TaskService) recordDependencyHistory(taskID, upstreamTaskID uint, operation string) error {
	history := &models.DependencyHistory{
		TaskID:         taskID,
		UpstreamTaskID: upstreamTaskID,
		Operation:      operation,
		SnapshotAt:     time.Now(),
	}
	return config.DB.Create(history).Error
}

func (s *TaskService) CreateTask(task *models.Task) error {
	tx := config.DB.Begin()
	if err := tx.Create(task).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := s.recordTaskHistory(task, "create"); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

func (s *TaskService) GetTaskByID(id uint) (*models.Task, error) {
	var task models.Task
	err := config.DB.First(&task, id).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (s *TaskService) GetAllTasks() ([]models.Task, error) {
	var tasks []models.Task
	err := config.DB.Find(&tasks).Error
	return tasks, err
}

func (s *TaskService) UpdateTask(task *models.Task) error {
	tx := config.DB.Begin()
	if err := tx.Save(task).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := s.recordTaskHistory(task, "update"); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

func (s *TaskService) DeleteTask(id uint) error {
	tx := config.DB.Begin()

	task, err := s.GetTaskByID(id)
	if err != nil {
		tx.Rollback()
		return err
	}

	if err := s.recordTaskHistory(task, "delete"); err != nil {
		tx.Rollback()
		return err
	}

	var deps []models.TaskDependency
	tx.Where("task_id = ? OR upstream_task_id = ?", id, id).Find(&deps)
	for _, dep := range deps {
		if err := s.recordDependencyHistory(dep.TaskID, dep.UpstreamTaskID, "delete"); err != nil {
			tx.Rollback()
			return err
		}
	}

	if err := tx.Where("task_id = ? OR upstream_task_id = ?", id, id).Delete(&models.TaskDependency{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Delete(&models.Task{}, id).Error; err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit().Error
}

func (s *TaskService) AddDependency(taskID, upstreamTaskID uint) error {
	if taskID == upstreamTaskID {
		return errors.New("cannot create self-dependency")
	}

	_, err := s.GetTaskByID(taskID)
	if err != nil {
		return errors.New("task not found")
	}

	_, err = s.GetTaskByID(upstreamTaskID)
	if err != nil {
		return errors.New("upstream task not found")
	}

	var count int64
	config.DB.Model(&models.TaskDependency{}).
		Where("task_id = ? AND upstream_task_id = ?", taskID, upstreamTaskID).
		Count(&count)
	if count > 0 {
		return errors.New("dependency already exists")
	}

	if s.wouldCreateCycle(taskID, upstreamTaskID) {
		return errors.New("cannot create circular dependency")
	}

	tx := config.DB.Begin()

	dep := &models.TaskDependency{
		TaskID:         taskID,
		UpstreamTaskID: upstreamTaskID,
	}
	if err := tx.Create(dep).Error; err != nil {
		tx.Rollback()
		return err
	}

	if err := s.recordDependencyHistory(taskID, upstreamTaskID, "add"); err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit().Error
}

func (s *TaskService) wouldCreateCycle(taskID, upstreamTaskID uint) bool {
	visited := make(map[uint]bool)
	return s.dfs(upstreamTaskID, taskID, visited)
}

func (s *TaskService) dfs(current, target uint, visited map[uint]bool) bool {
	if current == target {
		return true
	}
	visited[current] = true

	var deps []models.TaskDependency
	config.DB.Where("task_id = ?", current).Find(&deps)

	for _, dep := range deps {
		if !visited[dep.UpstreamTaskID] {
			if s.dfs(dep.UpstreamTaskID, target, visited) {
				return true
			}
		}
	}
	return false
}

func (s *TaskService) RemoveDependency(taskID, upstreamTaskID uint) error {
	tx := config.DB.Begin()

	if err := s.recordDependencyHistory(taskID, upstreamTaskID, "remove"); err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Where("task_id = ? AND upstream_task_id = ?", taskID, upstreamTaskID).
		Delete(&models.TaskDependency{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit().Error
}

func (s *TaskService) GetAllDependencies() ([]models.TaskDependency, error) {
	var deps []models.TaskDependency
	err := config.DB.Find(&deps).Error
	return deps, err
}

func (s *TaskService) GetGraphData() (*models.GraphData, error) {
	tasks, err := s.GetAllTasks()
	if err != nil {
		return nil, err
	}

	deps, err := s.GetAllDependencies()
	if err != nil {
		return nil, err
	}

	nodes := make([]models.GraphNode, len(tasks))
	for i, task := range tasks {
		nodes[i] = models.GraphNode{
			ID:          task.ID,
			Name:        task.Name,
			Description: task.Description,
			Status:      task.Status,
			PositionX:   task.PositionX,
			PositionY:   task.PositionY,
		}
	}

	edges := make([]models.GraphEdge, len(deps))
	for i, dep := range deps {
		edges[i] = models.GraphEdge{
			ID:     dep.ID,
			Source: dep.UpstreamTaskID,
			Target: dep.TaskID,
		}
	}

	return &models.GraphData{
		Nodes: nodes,
		Edges: edges,
	}, nil
}

func (s *TaskService) GetTaskDependencies(taskID uint) ([]models.Task, error) {
	var deps []models.TaskDependency
	err := config.DB.Where("task_id = ?", taskID).Find(&deps).Error
	if err != nil {
		return nil, err
	}

	var taskIDs []uint
	for _, dep := range deps {
		taskIDs = append(taskIDs, dep.UpstreamTaskID)
	}

	if len(taskIDs) == 0 {
		return []models.Task{}, nil
	}

	var tasks []models.Task
	err = config.DB.Where("id IN ?", taskIDs).Find(&tasks).Error
	return tasks, err
}

func (s *TaskService) GetTaskDownstream(taskID uint) ([]models.Task, error) {
	var deps []models.TaskDependency
	err := config.DB.Where("upstream_task_id = ?", taskID).Find(&deps).Error
	if err != nil {
		return nil, err
	}

	var taskIDs []uint
	for _, dep := range deps {
		taskIDs = append(taskIDs, dep.TaskID)
	}

	if len(taskIDs) == 0 {
		return []models.Task{}, nil
	}

	var tasks []models.Task
	err = config.DB.Where("id IN ?", taskIDs).Find(&tasks).Error
	return tasks, err
}

func (s *TaskService) UpdateTaskPosition(id uint, x, y float64) error {
	task, err := s.GetTaskByID(id)
	if err != nil {
		return err
	}
	task.PositionX = x
	task.PositionY = y
	return s.recordTaskHistory(task, "move")
}

func (s *TaskService) GetHistoricalGraph(targetTime time.Time) (*models.GraphData, error) {
	type LatestHistory struct {
		TaskID  uint
		MaxID   uint
		Version int
	}

	var latestHistories []LatestHistory
	config.DB.Table("task_histories").
		Select("task_id, MAX(id) as max_id, MAX(version) as version").
		Where("snapshot_at <= ?", targetTime).
		Group("task_id").
		Scan(&latestHistories)

	if len(latestHistories) == 0 {
		return &models.GraphData{Nodes: []models.GraphNode{}, Edges: []models.GraphEdge{}}, nil
	}

	var historyIDs []uint
	for _, h := range latestHistories {
		historyIDs = append(historyIDs, h.MaxID)
	}

	var taskHistories []models.TaskHistory
	config.DB.Where("id IN ? AND operation != ?", historyIDs, "delete").
		Find(&taskHistories)

	nodes := make([]models.GraphNode, 0, len(taskHistories))
	for _, th := range taskHistories {
		nodes = append(nodes, models.GraphNode{
			ID:          th.TaskID,
			Name:        th.Name,
			Description: th.Description,
			Status:      th.Status,
			PositionX:   th.PositionX,
			PositionY:   th.PositionY,
		})
	}

	type LatestDepHistory struct {
		TaskID         uint
		UpstreamTaskID uint
		MaxID          uint
	}
	var latestDepHistories []LatestDepHistory
	config.DB.Table("dependency_histories").
		Select("task_id, upstream_task_id, MAX(id) as max_id").
		Where("snapshot_at <= ?", targetTime).
		Group("task_id, upstream_task_id").
		Scan(&latestDepHistories)

	if len(latestDepHistories) == 0 {
		return &models.GraphData{Nodes: nodes, Edges: []models.GraphEdge{}}, nil
	}

	var depHistoryIDs []uint
	for _, h := range latestDepHistories {
		depHistoryIDs = append(depHistoryIDs, h.MaxID)
	}

	var depHistories []models.DependencyHistory
	config.DB.Where("id IN ?", depHistoryIDs).Find(&depHistories)

	edges := make([]models.GraphEdge, 0)
	edgeID := uint(1)
	for _, dh := range depHistories {
		if dh.Operation != "delete" && dh.Operation != "remove" {
			edges = append(edges, models.GraphEdge{
				ID:     edgeID,
				Source: dh.UpstreamTaskID,
				Target: dh.TaskID,
			})
			edgeID++
		}
	}

	return &models.GraphData{
		Nodes: nodes,
		Edges: edges,
	}, nil
}

func (s *TaskService) GetTimeline(startTime, endTime time.Time) ([]models.HistoryTimelineItem, error) {
	var items []models.HistoryTimelineItem

	var taskHistories []models.TaskHistory
	config.DB.Where("snapshot_at BETWEEN ? AND ?", startTime, endTime).
		Order("snapshot_at ASC").
		Find(&taskHistories)

	for _, th := range taskHistories {
		items = append(items, models.HistoryTimelineItem{
			Timestamp: th.SnapshotAt,
			Type:      "task",
			TaskID:    th.TaskID,
			TaskName:  th.Name,
			Operation: th.Operation,
		})
	}

	var depHistories []models.DependencyHistory
	config.DB.Where("snapshot_at BETWEEN ? AND ?", startTime, endTime).
		Order("snapshot_at ASC").
		Find(&depHistories)

	for _, dh := range depHistories {
		task, _ := s.GetTaskByID(dh.TaskID)
		taskName := ""
		if task != nil {
			taskName = task.Name
		}
		items = append(items, models.HistoryTimelineItem{
			Timestamp: dh.SnapshotAt,
			Type:      "dependency",
			TaskID:    dh.TaskID,
			TaskName:  taskName,
			Operation: dh.Operation,
		})
	}

	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[i].Timestamp.After(items[j].Timestamp) {
				items[i], items[j] = items[j], items[i]
			}
		}
	}

	return items, nil
}

func (s *TaskService) GetTimelineRange() (time.Time, time.Time, error) {
	var earliest time.Time
	var latest time.Time

	rows, err := config.DB.Raw(`
		SELECT MIN(snapshot_at) as earliest, MAX(snapshot_at) as latest 
		FROM (
			SELECT snapshot_at FROM task_histories
			UNION ALL
			SELECT snapshot_at FROM dependency_histories
		) as all_times
	`).Rows()

	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	defer rows.Close()

	if rows.Next() {
		rows.Scan(&earliest, &latest)
	}

	if earliest.IsZero() {
		earliest = time.Now().AddDate(0, 0, -1)
	}
	if latest.IsZero() {
		latest = time.Now()
	}

	return earliest, latest, nil
}
