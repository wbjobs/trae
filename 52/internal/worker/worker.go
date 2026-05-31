package worker

import (
	"container/heap"
	"context"
	"fmt"
	"log"
	"math/rand"
	"regexp"
	"strings"
	"sync"
	"time"

	"data-cleanse-service/internal/lock"
	"data-cleanse-service/internal/models"
	"data-cleanse-service/internal/service"
)

const lockRenewInterval = 10 * time.Second

type priorityItem struct {
	taskID   string
	priority models.TaskPriority
	index    int
}

type priorityQueue []*priorityItem

func (pq priorityQueue) Len() int { return len(pq) }

func (pq priorityQueue) Less(i, j int) bool {
	return pq[i].priority > pq[j].priority
}

func (pq priorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}

func (pq *priorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*priorityItem)
	item.index = n
	*pq = append(*pq, item)
}

func (pq *priorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

type WorkerPool struct {
	taskService     *service.TaskService
	callbackService *service.CallbackService
	workerCount     int
	pq              priorityQueue
	pqMutex         sync.Mutex
	readyCh         chan struct{}
	triggerCh       chan struct{}
}

func NewWorkerPool(taskService *service.TaskService, callbackService *service.CallbackService, workerCount int) *WorkerPool {
	pq := make(priorityQueue, 0)
	heap.Init(&pq)
	return &WorkerPool{
		taskService:     taskService,
		callbackService: callbackService,
		workerCount:     workerCount,
		pq:              pq,
		readyCh:         make(chan struct{}, workerCount),
		triggerCh:       make(chan struct{}, 1),
	}
}

func (p *WorkerPool) Start(ctx context.Context) {
	for i := 0; i < p.workerCount; i++ {
		go p.worker(ctx, i)
		p.readyCh <- struct{}{}
	}
	go p.taskDispatcher(ctx)
	log.Printf("Worker pool started with %d workers", p.workerCount)
}

func (p *WorkerPool) TriggerDispatch() {
	select {
	case p.triggerCh <- struct{}{}:
	default:
	}
}

func (p *WorkerPool) submitTask(taskID string, priority models.TaskPriority) {
	p.pqMutex.Lock()
	defer p.pqMutex.Unlock()
	heap.Push(&p.pq, &priorityItem{
		taskID:   taskID,
		priority: priority,
	})
}

func (p *WorkerPool) nextTask() (string, bool) {
	p.pqMutex.Lock()
	defer p.pqMutex.Unlock()
	if p.pq.Len() == 0 {
		return "", false
	}
	item := heap.Pop(&p.pq).(*priorityItem)
	return item.taskID, true
}

func (p *WorkerPool) taskDispatcher(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	dispatch := func() {
		p.pqMutex.Lock()
		queueSize := p.pq.Len()
		p.pqMutex.Unlock()

		if queueSize >= p.workerCount {
			return
		}

		limit := p.workerCount - queueSize
		tasks, err := p.taskService.GetPendingTasks(ctx, limit)
		if err != nil {
			log.Printf("Failed to get pending tasks: %v", err)
			return
		}

		for _, task := range tasks {
			updated, err := p.taskService.TrySetTaskRunning(ctx, task.ID)
			if err != nil {
				log.Printf("Failed to set task %s to running: %v", task.ID, err)
				continue
			}
			if !updated {
				continue
			}
			p.submitTask(task.ID, task.Priority)
			log.Printf("Dispatched task %s (priority=%s) to queue", task.ID, task.Priority.String())
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			dispatch()
		case <-p.triggerCh:
			dispatch()
		}
	}
}

func (p *WorkerPool) worker(ctx context.Context, workerID int) {
	log.Printf("Worker %d started", workerID)
	for {
		select {
		case <-ctx.Done():
			log.Printf("Worker %d stopping", workerID)
			return
		case <-p.readyCh:
			taskID, ok := p.nextTask()
			if !ok {
				p.readyCh <- struct{}{}
				time.Sleep(100 * time.Millisecond)
				continue
			}
			p.processTask(ctx, workerID, taskID)
			p.readyCh <- struct{}{}
			p.TriggerDispatch()
		}
	}
}

func (p *WorkerPool) processTask(ctx context.Context, workerID int, taskID string) {
	log.Printf("Worker %d processing task %s", workerID, taskID)

	handle, locked, err := p.taskService.TryLockTask(ctx, taskID)
	if err != nil {
		log.Printf("Worker %d failed to lock task %s: %v", workerID, taskID, err)
		p.taskService.UpdateTaskStatus(ctx, taskID, models.StatusPending)
		return
	}
	if !locked {
		log.Printf("Worker %d skipped task %s: already locked, resetting to pending", workerID, taskID)
		p.taskService.UpdateTaskStatus(ctx, taskID, models.StatusPending)
		return
	}
	defer p.taskService.UnlockTask(ctx, handle)

	renewCtx, renewCancel := context.WithCancel(ctx)
	defer renewCancel()
	go p.startLockRenewer(renewCtx, workerID, handle)

	task, err := p.taskService.GetTaskByID(ctx, taskID)
	if err != nil {
		log.Printf("Worker %d failed to get task %s: %v", workerID, taskID, err)
		return
	}

	records, err := p.taskService.GetTaskRecords(ctx, taskID)
	if err != nil {
		log.Printf("Worker %d failed to get records for task %s: %v", workerID, taskID, err)
		p.taskService.UpdateTaskStatus(ctx, taskID, models.StatusFailed, err.Error())
		return
	}

	successCount := 0
	failedCount := 0

	for _, record := range records {
		select {
		case <-ctx.Done():
			return
		default:
		}

		isValid, errMsg := validateRecord(&record)
		record.IsValid = isValid
		record.Processed = true
		if !isValid {
			record.ErrorMsg = errMsg
			failedCount++
		} else {
			successCount++
		}

		if err := p.taskService.UpdateRecord(ctx, &record); err != nil {
			log.Printf("Worker %d failed to update record %d: %v", workerID, record.ID, err)
		}

		p.taskService.IncrementProcessedCount(ctx, taskID)

		time.Sleep(time.Millisecond * time.Duration(10+rand.Intn(20)))
	}

	finalStatus := models.StatusDone
	if failedCount > 0 && successCount == 0 {
		finalStatus = models.StatusFailed
	}

	err = p.taskService.UpdateTaskStatus(ctx, taskID, finalStatus)
	if err != nil {
		log.Printf("Worker %d failed to update task status for %s: %v", workerID, taskID, err)
	}

	now := time.Now()
	payload := &service.CallbackPayload{
		TaskID:       taskID,
		RequestID:    task.RequestID,
		Status:       finalStatus,
		TotalRecords: task.TotalRecords,
		SuccessCount: successCount,
		FailedCount:  failedCount,
		CompletedAt:  now,
	}

	go func() {
		callbackCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		err := p.callbackService.NotifyWithRetry(callbackCtx, task.CallbackURL, payload, 3)
		if err != nil {
			log.Printf("Callback failed for task %s: %v", taskID, err)
		} else {
			log.Printf("Callback succeeded for task %s", taskID)
		}
	}()

	log.Printf("Worker %d completed task %s: success=%d, failed=%d", workerID, taskID, successCount, failedCount)
}

func (p *WorkerPool) startLockRenewer(ctx context.Context, workerID int, handle *lock.LockHandle) {
	ticker := time.NewTicker(lockRenewInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ok, err := p.taskService.RenewTaskLock(ctx, handle)
			if err != nil {
				log.Printf("Worker %d failed to renew lock for task %s: %v", workerID, handle.Key, err)
				return
			}
			if !ok {
				log.Printf("Worker %d lost lock for task %s", workerID, handle.Key)
				return
			}
			log.Printf("Worker %d renewed lock for task %s", workerID, handle.Key)
		}
	}
}

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	phoneRegex = regexp.MustCompile(`^1[3-9]\d{9}$`)
)

func validateRecord(record *models.UserRecord) (bool, string) {
	var errors []string

	if strings.TrimSpace(record.Username) == "" {
		errors = append(errors, "username is empty")
	}

	if !emailRegex.MatchString(record.Email) {
		errors = append(errors, fmt.Sprintf("invalid email: %s", record.Email))
	}

	if !phoneRegex.MatchString(record.Phone) {
		errors = append(errors, fmt.Sprintf("invalid phone: %s", record.Phone))
	}

	if record.Age < 0 || record.Age > 150 {
		errors = append(errors, fmt.Sprintf("invalid age: %d", record.Age))
	}

	if len(errors) > 0 {
		return false, strings.Join(errors, "; ")
	}

	return true, ""
}
