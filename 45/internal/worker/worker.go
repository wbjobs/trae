package worker

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"

	pb "github.com/distributed-scheduler/worker/proto"
	"github.com/distributed-scheduler/worker/internal/config"
	"github.com/distributed-scheduler/worker/internal/executor"
	"github.com/distributed-scheduler/worker/internal/monitor"
)

const (
	maxLogBufferSize     = 10000
	maxResultRetryTimes  = 10
	retryBaseInterval    = 2 * time.Second
	streamReconnectDelay = 3 * time.Second
)

var (
	clientKeepaliveParams = keepalive.ClientParameters{
		Time:                30 * time.Second,
		Timeout:             10 * time.Second,
		PermitWithoutStream: true,
	}

	clientKeepalivePolicy = keepalive.ClientParameters{
		Time:                1 * time.Minute,
		Timeout:             20 * time.Second,
		PermitWithoutStream: true,
	}
)

type runningTask struct {
	executor *executor.TaskExecutor
	cancel   context.CancelFunc
	logChan  chan *pb.TaskLog
	resourceUsage *pb.ResourceUsage
	resourceMu   sync.Mutex
}

type logBuffer struct {
	mu    sync.Mutex
	logs  []*pb.TaskLog
	maxSize int
}

func newLogBuffer(maxSize int) *logBuffer {
	return &logBuffer{
		logs:    make([]*pb.TaskLog, 0, maxSize),
		maxSize: maxSize,
	}
}

func (b *logBuffer) add(log *pb.TaskLog) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if len(b.logs) >= b.maxSize {
		b.logs = b.logs[1:]
	}
	b.logs = append(b.logs, log)
}

func (b *logBuffer) drainAll() []*pb.TaskLog {
	b.mu.Lock()
	defer b.mu.Unlock()

	logs := b.logs
	b.logs = make([]*pb.TaskLog, 0, b.maxSize)
	return logs
}

func (b *logBuffer) isEmpty() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.logs) == 0
}

type pendingResult struct {
	result *pb.TaskResult
	retryCount int
	nextRetry time.Time
}

type Worker struct {
	pb.UnimplementedWorkerServiceServer

	cfg       *config.Config
	monitor   *monitor.ResourceMonitor
	tasks     map[string]*runningTask
	tasksMu   sync.RWMutex
	sem       chan struct{}

	schedulerConn   *grpc.ClientConn
	schedulerClient pb.SchedulerServiceClient
	connMu          sync.RWMutex
	connected       bool

	logStream       pb.SchedulerService_StreamLogsClient
	logStreamCtx    context.Context
	logStreamCancel context.CancelFunc
	logStreamMu     sync.Mutex

	logBuffer       *logBuffer
	pendingResults  map[string]*pendingResult
	pendingResultsMu sync.Mutex

	logSubscribers map[string]chan *pb.TaskLog
	logSubMu       sync.RWMutex

	stopCh    chan struct{}
	wg        sync.WaitGroup
}

func NewWorker(cfg *config.Config) (*Worker, error) {
	w := &Worker{
		cfg:            cfg,
		monitor:        monitor.NewResourceMonitor(),
		tasks:          make(map[string]*runningTask),
		sem:            make(chan struct{}, cfg.MaxConcurrent),
		logSubscribers: make(map[string]chan *pb.TaskLog),
		logBuffer:      newLogBuffer(maxLogBufferSize),
		pendingResults: make(map[string]*pendingResult),
		stopCh:         make(chan struct{}),
	}

	if err := w.connectToScheduler(); err != nil {
		log.Printf("Warning: failed to connect to scheduler: %v", err)
	}

	return w, nil
}

func (w *Worker) connectToScheduler() error {
	conn, err := grpc.Dial(
		w.cfg.SchedulerAddress,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithKeepaliveParams(clientKeepaliveParams),
		grpc.WithKeepaliveParams(clientKeepalivePolicy),
	)
	if err != nil {
		w.setConnected(false)
		return err
	}

	w.connMu.Lock()
	if w.schedulerConn != nil {
		w.schedulerConn.Close()
	}
	w.schedulerConn = conn
	w.schedulerClient = pb.NewSchedulerServiceClient(conn)
	w.connMu.Unlock()

	w.setConnected(true)
	log.Printf("Successfully connected to scheduler at %s", w.cfg.SchedulerAddress)

	go w.startLogStream()
	return nil
}

func (w *Worker) setConnected(connected bool) {
	w.connMu.Lock()
	defer w.connMu.Unlock()
	w.connected = connected
}

func (w *Worker) isConnected() bool {
	w.connMu.RLock()
	defer w.connMu.RUnlock()
	return w.connected
}

func (w *Worker) getSchedulerClient() pb.SchedulerServiceClient {
	w.connMu.RLock()
	defer w.connMu.RUnlock()
	return w.schedulerClient
}

func (w *Worker) Start() error {
	lis, err := net.Listen("tcp", w.cfg.ListenAddress)
	if err != nil {
		return fmt.Errorf("failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer(
		grpc.KeepaliveParams(keepalive.ServerParameters{
			Time:    1 * time.Minute,
			Timeout: 20 * time.Second,
		}),
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             30 * time.Second,
			PermitWithoutStream: true,
		}),
	)
	pb.RegisterWorkerServiceServer(grpcServer, w)

	w.wg.Add(3)
	go w.startHeartbeat()
	go w.startResultRetryLoop()
	go w.startConnectionMonitor()

	log.Printf("Worker %s starting on %s, max concurrent: %d",
		w.cfg.WorkerID, w.cfg.ListenAddress, w.cfg.MaxConcurrent)

	return grpcServer.Serve(lis)
}

func (w *Worker) ExecuteTask(ctx context.Context, req *pb.ExecuteTaskRequest) (*pb.ExecuteTaskResponse, error) {
	task := req.Task
	log.Printf("Received task: %s, type: %s", task.Id, task.Type)

	select {
	case w.sem <- struct{}{}:
	default:
		return &pb.ExecuteTaskResponse{
			Accepted: false,
			Message:  "worker is at max capacity",
		}, nil
	}

	if w.isTaskRunning(task.Id) {
		<-w.sem
		return &pb.ExecuteTaskResponse{
			Accepted: false,
			Message:  "task is already running",
		}, nil
	}

	taskCtx, taskCancel := context.WithCancel(context.Background())
	exec := executor.NewTaskExecutor(task)
	logChan := make(chan *pb.TaskLog, 1000)

	rt := &runningTask{
		executor:      exec,
		cancel:        taskCancel,
		logChan:       logChan,
		resourceUsage: &pb.ResourceUsage{},
	}

	w.tasksMu.Lock()
	w.tasks[task.Id] = rt
	w.tasksMu.Unlock()

	w.updateRunningTasksCount()

	exec.SetLogCallback(func(content string, isStderr bool, timestamp int64) {
		logEntry := &pb.TaskLog{
			TaskId:    task.Id,
			Content:   content,
			IsStderr:  isStderr,
			Timestamp: timestamp,
		}

		select {
		case logChan <- logEntry:
		default:
		}

		w.broadcastLog(logEntry)
		w.sendLog(logEntry)
	})

	exec.SetResourceMonitorCallback(func(usage *pb.ResourceUsage) {
		rt.resourceMu.Lock()
		rt.resourceUsage = usage
		rt.resourceMu.Unlock()
	})

	go w.runTask(taskCtx, task, rt)

	return &pb.ExecuteTaskResponse{
		Accepted: true,
		Message:  "task accepted",
	}, nil
}

func (w *Worker) CancelTask(ctx context.Context, req *pb.CancelTaskRequest) (*pb.CancelTaskResponse, error) {
	w.tasksMu.RLock()
	rt, exists := w.tasks[req.TaskId]
	w.tasksMu.RUnlock()

	if !exists {
		return &pb.CancelTaskResponse{
			Cancelled: false,
			Message:   "task not found",
		}, nil
	}

	if err := rt.executor.Cancel(); err != nil {
		return &pb.CancelTaskResponse{
			Cancelled: false,
			Message:   err.Error(),
		}, nil
	}

	rt.cancel()

	return &pb.CancelTaskResponse{
		Cancelled: true,
		Message:   "task cancelled",
	}, nil
}

func (w *Worker) StreamTaskLogs(req *pb.TaskLogRequest, stream pb.WorkerService_StreamTaskLogsServer) error {
	logChan := make(chan *pb.TaskLog, 100)

	w.logSubMu.Lock()
	w.logSubscribers[req.TaskId] = logChan
	w.logSubMu.Unlock()

	defer func() {
		w.logSubMu.Lock()
		delete(w.logSubscribers, req.TaskId)
		w.logSubMu.Unlock()
		close(logChan)
	}()

	for logEntry := range logChan {
		if err := stream.Send(logEntry); err != nil {
			return err
		}
	}

	return nil
}

func (w *Worker) runTask(ctx context.Context, task *pb.Task, rt *runningTask) {
	defer func() {
		<-w.sem
		w.tasksMu.Lock()
		delete(w.tasks, task.Id)
		w.tasksMu.Unlock()
		w.updateRunningTasksCount()
		close(rt.logChan)
	}()

	result, err := rt.executor.Execute()
	if err != nil {
		log.Printf("Task %s execution error: %v", task.Id, err)
	}

	log.Printf("Task %s completed with status: %s, exit code: %d",
		task.Id, result.Status, result.ExitCode)

	if result.ErrorMessage != "" {
		log.Printf("Task %s error: %s", task.Id, result.ErrorMessage)
	}

	stdout := rt.executor.GetStdout()
	stderr := rt.executor.GetStderr()
	if stdout != "" {
		log.Printf("Task %s stdout:\n%s", task.Id, stdout)
	}
	if stderr != "" {
		log.Printf("Task %s stderr:\n%s", task.Id, stderr)
	}

	if result.ResourceUsage != nil {
		log.Printf("Task %s resource usage - CPU: %.1f%%, Memory Peak: %.2f MB, Memory Avg: %.2f MB",
			task.Id,
			result.ResourceUsage.CpuUsagePercent,
			float64(result.ResourceUsage.MemoryPeakBytes)/1024/1024,
			float64(result.ResourceUsage.MemoryAvgBytes)/1024/1024,
		)
	}

	w.queueTaskResult(result)
}

func (w *Worker) startHeartbeat() {
	defer w.wg.Done()

	ticker := time.NewTicker(time.Duration(w.cfg.HeartbeatInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.sendHeartbeat()
		}
	}
}

func (w *Worker) sendHeartbeat() {
	resource, err := w.monitor.GetResourceUsage()
	if err != nil {
		log.Printf("Failed to get resource usage: %v", err)
		return
	}

	req := &pb.HeartbeatRequest{
		WorkerId: w.cfg.WorkerID,
		Resource: resource,
	}

	client := w.getSchedulerClient()
	if client == nil {
		log.Printf("No scheduler connection, skipping heartbeat")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = client.Heartbeat(ctx, req)
	if err != nil {
		log.Printf("Heartbeat failed: %v", err)
		w.setConnected(false)
		go w.tryReconnect()
	} else if !w.isConnected() {
		w.setConnected(true)
		log.Printf("Connection restored via heartbeat")
	}
}

func (w *Worker) tryReconnect() {
	log.Printf("Attempting to reconnect to scheduler...")
	for i := 0; i < 5; i++ {
		if err := w.connectToScheduler(); err == nil {
			return
		}
		time.Sleep(time.Duration(i+1) * retryBaseInterval)
	}
	log.Printf("Failed to reconnect after 5 attempts, will retry via heartbeat")
}

func (w *Worker) startConnectionMonitor() {
	defer w.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			if !w.isConnected() {
				log.Printf("Connection monitor detected disconnection, attempting reconnect")
				w.tryReconnect()
			}
		}
	}
}

func (w *Worker) startLogStream() {
	for {
		select {
		case <-w.stopCh:
			return
		default:
		}

		if !w.isConnected() {
			time.Sleep(streamReconnectDelay)
			continue
		}

		client := w.getSchedulerClient()
		if client == nil {
			time.Sleep(streamReconnectDelay)
			continue
		}

		ctx, cancel := context.WithCancel(context.Background())
		stream, err := client.StreamLogs(ctx)
		if err != nil {
			log.Printf("Failed to create log stream: %v", err)
			cancel()
			time.Sleep(streamReconnectDelay)
			continue
		}

		w.logStreamMu.Lock()
		if w.logStreamCancel != nil {
			w.logStreamCancel()
		}
		w.logStream = stream
		w.logStreamCtx = ctx
		w.logStreamCancel = cancel
		w.logStreamMu.Unlock()

		log.Printf("Log stream established")
		w.flushBufferedLogs()

		<-ctx.Done()
		log.Printf("Log stream disconnected, will reconnect")
		time.Sleep(streamReconnectDelay)
	}
}

func (w *Worker) sendLog(logEntry *pb.TaskLog) {
	if w.sendLogViaStream(logEntry) {
		return
	}
	w.logBuffer.add(logEntry)
}

func (w *Worker) sendLogViaStream(logEntry *pb.TaskLog) bool {
	w.logStreamMu.Lock()
	defer w.logStreamMu.Unlock()

	if w.logStream == nil {
		return false
	}

	ctx, cancel := context.WithTimeout(w.logStreamCtx, 5*time.Second)
	defer cancel()

	select {
	case <-ctx.Done():
		return false
	default:
	}

	if err := w.logStream.Send(logEntry); err != nil {
		log.Printf("Failed to send log via stream: %v", err)
		if w.logStreamCancel != nil {
			w.logStreamCancel()
		}
		return false
	}
	return true
}

func (w *Worker) flushBufferedLogs() {
	if w.logBuffer.isEmpty() {
		return
	}

	logs := w.logBuffer.drainAll()
	log.Printf("Flushing %d buffered logs", len(logs))

	failed := make([]*pb.TaskLog, 0)
	for _, logEntry := range logs {
		if !w.sendLogViaStream(logEntry) {
			failed = append(failed, logEntry)
		}
	}

	if len(failed) > 0 {
		for _, logEntry := range failed {
			w.logBuffer.add(logEntry)
		}
		log.Printf("%d logs failed to flush, re-buffered", len(failed))
	} else {
		log.Printf("All buffered logs flushed successfully")
	}
}

func (w *Worker) queueTaskResult(result *pb.TaskResult) {
	w.pendingResultsMu.Lock()
	w.pendingResults[result.TaskId] = &pendingResult{
		result:     result,
		retryCount: 0,
		nextRetry:  time.Now(),
	}
	w.pendingResultsMu.Unlock()

	log.Printf("Queued result for task %s for reporting", result.TaskId)
	w.tryReportResult(result.TaskId)
}

func (w *Worker) tryReportResult(taskID string) bool {
	w.pendingResultsMu.Lock()
	pr, exists := w.pendingResults[taskID]
	w.pendingResultsMu.Unlock()

	if !exists {
		return true
	}

	if pr.retryCount >= maxResultRetryTimes {
		log.Printf("Max retries reached for task %s result, giving up but keeping in queue", taskID)
		return false
	}

	client := w.getSchedulerClient()
	if client == nil {
		log.Printf("No scheduler connection, will retry reporting task %s result later", taskID)
		pr.retryCount++
		pr.nextRetry = time.Now().Add(time.Duration(pr.retryCount*pr.retryCount) * retryBaseInterval)
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := client.ReportTaskResult(ctx, pr.result)
	if err != nil {
		log.Printf("Failed to report task %s result (attempt %d/%d): %v",
			taskID, pr.retryCount+1, maxResultRetryTimes, err)
		pr.retryCount++
		pr.nextRetry = time.Now().Add(time.Duration(pr.retryCount*pr.retryCount) * retryBaseInterval)
		w.setConnected(false)
		go w.tryReconnect()
		return false
	}

	log.Printf("Successfully reported result for task %s", taskID)
	w.pendingResultsMu.Lock()
	delete(w.pendingResults, taskID)
	w.pendingResultsMu.Unlock()

	if !w.isConnected() {
		w.setConnected(true)
	}
	return true
}

func (w *Worker) startResultRetryLoop() {
	defer w.wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.retryPendingResults()
		}
	}
}

func (w *Worker) retryPendingResults() {
	w.pendingResultsMu.Lock()
	taskIDs := make([]string, 0, len(w.pendingResults))
	now := time.Now()
	for taskID, pr := range w.pendingResults {
		if now.After(pr.nextRetry) {
			taskIDs = append(taskIDs, taskID)
		}
	}
	w.pendingResultsMu.Unlock()

	for _, taskID := range taskIDs {
		w.tryReportResult(taskID)
	}
}

func (w *Worker) broadcastLog(logEntry *pb.TaskLog) {
	w.logSubMu.RLock()
	defer w.logSubMu.RUnlock()

	if ch, exists := w.logSubscribers[logEntry.TaskId]; exists {
		select {
		case ch <- logEntry:
		default:
		}
	}
}

func (w *Worker) isTaskRunning(taskID string) bool {
	w.tasksMu.RLock()
	defer w.tasksMu.RUnlock()
	_, exists := w.tasks[taskID]
	return exists
}

func (w *Worker) updateRunningTasksCount() {
	w.tasksMu.RLock()
	count := int32(len(w.tasks))
	w.tasksMu.RUnlock()
	w.monitor.SetRunningTasks(count)
}

func (w *Worker) Stop() {
	close(w.stopCh)
	w.wg.Wait()

	w.logStreamMu.Lock()
	if w.logStreamCancel != nil {
		w.logStreamCancel()
	}
	w.logStreamMu.Unlock()

	w.connMu.Lock()
	if w.schedulerConn != nil {
		w.schedulerConn.Close()
	}
	w.connMu.Unlock()

	if !w.logBuffer.isEmpty() {
		logs := w.logBuffer.drainAll()
		log.Printf("Warning: %d logs were not sent to scheduler before shutdown", len(logs))
	}

	w.pendingResultsMu.Lock()
	if len(w.pendingResults) > 0 {
		log.Printf("Warning: %d task results were not reported before shutdown", len(w.pendingResults))
	}
	w.pendingResultsMu.Unlock()
}
