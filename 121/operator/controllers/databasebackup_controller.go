package controllers

import (
	"context"
	"fmt"
	"math"
	"sync"
	"time"

	v1 "github.com/database-backup-operator/api/v1"
	"github.com/database-backup-operator/pkg/backup"
	"github.com/database-backup-operator/pkg/precheck"
	s3client "github.com/database-backup-operator/pkg/s3client"
	"github.com/go-logr/logr"
	"github.com/robfig/cron/v3"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"
)

const (
	DefaultBackoffBaseSeconds = 30
	MaxBackoffSeconds         = 3600
	MaxRetryCount             = 10
)

func calcBackoff(retryCount int) time.Duration {
	if retryCount <= 0 {
		return 0
	}
	backoff := float64(DefaultBackoffBaseSeconds) * math.Pow(2, float64(retryCount-1))
	if backoff > MaxBackoffSeconds {
		backoff = MaxBackoffSeconds
	}
	return time.Duration(backoff) * time.Second
}

type DatabaseBackupReconciler struct {
	client.Client
	Scheme       *runtime.Scheme
	Log          logr.Logger
	BackupSvc    *backup.Service
	PreCheckSvc  *precheck.Service
	S3Clients    map[string]*s3client.Client
	S3ClientsMux sync.RWMutex
	Cron         *cron.Cron
	CronEntries  map[types.NamespacedName]cron.EntryID
	CronMux      sync.RWMutex
}

type BackupRequest struct {
	NamespacedName types.NamespacedName
	Force          bool
}

var BackupQueue = make(chan BackupRequest, 100)

func (r *DatabaseBackupReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	var dbBackup v1.DatabaseBackup
	if err := r.Get(ctx, req.NamespacedName, &dbBackup); err != nil {
		if apierrors.IsNotFound(err) {
			r.removeCronJob(req.NamespacedName)
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	logger.Info("reconciling DatabaseBackup", "name", dbBackup.Name, "status", dbBackup.Status.CurrentStatus, "retryCount", dbBackup.Status.RetryCount)

	if dbBackup.DeletionTimestamp != nil {
		r.removeCronJob(req.NamespacedName)
		return ctrl.Result{}, nil
	}

	if dbBackup.Spec.Schedule != "" {
		r.scheduleBackup(ctx, &dbBackup)
	}

	r.ensureS3Client(&dbBackup)

	if dbBackup.Status.CurrentStatus == v1.BackupStatusRunning {
		logger.Info("backup already running, skipping")
		return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
	}

	now := time.Now()

	if dbBackup.Status.CurrentStatus == v1.BackupStatusFailed && dbBackup.Status.RetryCount > 0 {
		if dbBackup.Status.NextBackupTime != nil && dbBackup.Status.NextBackupTime.Time.After(now) {
			backoff := time.Until(dbBackup.Status.NextBackupTime.Time)
			logger.Info("in backoff period", "retryCount", dbBackup.Status.RetryCount, "backoff", backoff)
			return ctrl.Result{RequeueAfter: backoff}, nil
		}
	}

	if dbBackup.Status.RetryCount >= MaxRetryCount {
		logger.Info("max retry count reached, stopping retries", "retryCount", dbBackup.Status.RetryCount)
		if dbBackup.Spec.Schedule != "" {
			r.scheduleNextBackup(ctx, &dbBackup)
			if dbBackup.Status.NextBackupTime != nil && dbBackup.Status.NextBackupTime.Time.After(now) {
				return ctrl.Result{RequeueAfter: time.Until(dbBackup.Status.NextBackupTime.Time)}, nil
			}
		}
		return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
	}

	if dbBackup.Status.NextBackupTime != nil && dbBackup.Status.NextBackupTime.Time.After(now) {
		next := time.Until(dbBackup.Status.NextBackupTime.Time)
		return ctrl.Result{RequeueAfter: next}, nil
	}

	go r.executeBackup(ctx, req.NamespacedName, &dbBackup)

	return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}

func (r *DatabaseBackupReconciler) scheduleBackup(ctx context.Context, dbBackup *v1.DatabaseBackup) {
	key := types.NamespacedName{
		Namespace: dbBackup.Namespace,
		Name:      dbBackup.Name,
	}

	r.CronMux.Lock()
	defer r.CronMux.Unlock()

	if _, exists := r.CronEntries[key]; exists {
		return
	}

	entryID, err := r.Cron.AddFunc(dbBackup.Spec.Schedule, func() {
		BackupQueue <- BackupRequest{NamespacedName: key, Force: false}
	})
	if err != nil {
		r.Log.Error(err, "failed to schedule cron job", "name", dbBackup.Name)
		return
	}

	r.CronEntries[key] = entryID
	r.Log.Info("scheduled backup", "name", dbBackup.Name, "schedule", dbBackup.Spec.Schedule)
}

func (r *DatabaseBackupReconciler) removeCronJob(key types.NamespacedName) {
	r.CronMux.Lock()
	defer r.CronMux.Unlock()

	if entryID, exists := r.CronEntries[key]; exists {
		r.Cron.Remove(entryID)
		delete(r.CronEntries, key)
		r.Log.Info("removed cron job", "key", key)
	}
}

func (r *DatabaseBackupReconciler) ensureS3Client(dbBackup *v1.DatabaseBackup) {
	key := fmt.Sprintf("%s/%s", dbBackup.Namespace, dbBackup.Name)

	r.S3ClientsMux.RLock()
	if _, exists := r.S3Clients[key]; exists {
		r.S3ClientsMux.RUnlock()
		return
	}
	r.S3ClientsMux.RUnlock()

	r.S3ClientsMux.Lock()
	defer r.S3ClientsMux.Unlock()

	if _, exists := r.S3Clients[key]; exists {
		return
	}

	client, err := s3client.New(s3client.Config{
		Endpoint:  dbBackup.Spec.S3Endpoint,
		AccessKey: dbBackup.Spec.S3AccessKey,
		SecretKey: dbBackup.Spec.S3SecretKey,
		UseSSL:    dbBackup.Spec.S3UseSSL,
		Bucket:    dbBackup.Spec.S3Bucket,
	})
	if err != nil {
		r.Log.Error(err, "failed to create S3 client", "name", dbBackup.Name)
		return
	}

	r.S3Clients[key] = client
}

func (r *DatabaseBackupReconciler) getS3Client(dbBackup *v1.DatabaseBackup) *s3client.Client {
	key := fmt.Sprintf("%s/%s", dbBackup.Namespace, dbBackup.Name)

	r.S3ClientsMux.RLock()
	defer r.S3ClientsMux.RUnlock()

	return r.S3Clients[key]
}

func (r *DatabaseBackupReconciler) executeBackup(ctx context.Context, key types.NamespacedName, dbBackup *v1.DatabaseBackup) {
	r.Log.Info("starting backup execution", "name", dbBackup.Name)

	var latest v1.DatabaseBackup
	if err := r.Get(ctx, key, &latest); err != nil {
		r.Log.Error(err, "failed to get latest DatabaseBackup")
		return
	}

	if latest.Status.RetryCount >= MaxRetryCount {
		r.Log.Info("max retry count reached, skipping execution", "retryCount", latest.Status.RetryCount)
		return
	}

	s3Client := r.getS3Client(&latest)

	r.Log.Info("running pre-check", "name", latest.Name)
	preCheckReport := r.PreCheckSvc.RunPreCheck(ctx, &latest.Spec, s3Client)
	r.savePreCheckReport(ctx, key, &preCheckReport)
	r.Log.Info("pre-check completed", "passed", preCheckReport.Passed)

	if !preCheckReport.Passed {
		warnMsg := fmt.Sprintf("预校验失败，跳过备份: %s", precheck.FormatReport(preCheckReport))
		r.Log.Info("pre-check failed, skipping backup", "report", warnMsg)

		failRecord := v1.BackupRecord{
			Name:       fmt.Sprintf("%s-%s", latest.Spec.MySQLDatabase, time.Now().Format("20060102-150405")),
			Status:     v1.BackupStatusFailed,
			StartTime:  metav1.Now(),
			FinishTime: &[]metav1.Time{metav1.Now()}[0],
			Error:      warnMsg,
		}

		var current v1.DatabaseBackup
		if err := r.Get(ctx, key, &current); err != nil {
			return
		}

		if current.Status.BackupHistory == nil {
			current.Status.BackupHistory = []v1.BackupRecord{}
		}
		current.Status.BackupHistory = append([]v1.BackupRecord{failRecord}, current.Status.BackupHistory...)

		if len(current.Status.BackupHistory) > 50 {
			current.Status.BackupHistory = current.Status.BackupHistory[:50]
		}

		current.Status.CurrentStatus = v1.BackupStatusFailed
		current.Status.RetryCount++
		current.Status.LastError = warnMsg

		if current.Status.RetryCount < MaxRetryCount {
			backoff := calcBackoff(current.Status.RetryCount)
			nextRetry := metav1.NewTime(time.Now().Add(backoff))
			current.Status.NextBackupTime = &nextRetry
		}

		r.Status().Update(ctx, &current)
		return
	}

	latest.Status.CurrentStatus = v1.BackupStatusRunning
	now := metav1.Now()
	latest.Status.LastBackupTime = &now

	record := v1.BackupRecord{
		Name:      fmt.Sprintf("%s-%s", latest.Spec.MySQLDatabase, now.Format("20060102-150405")),
		Status:    v1.BackupStatusRunning,
		StartTime: now,
	}

	if latest.Status.BackupHistory == nil {
		latest.Status.BackupHistory = []v1.BackupRecord{}
	}
	latest.Status.BackupHistory = append([]v1.BackupRecord{record}, latest.Status.BackupHistory...)

	if len(latest.Status.BackupHistory) > 50 {
		latest.Status.BackupHistory = latest.Status.BackupHistory[:50]
	}

	if err := r.Status().Update(ctx, &latest); err != nil {
		r.Log.Error(err, "failed to update status to Running")
		return
	}

	if s3Client == nil {
		r.failBackup(ctx, key, record, "S3 client not available")
		return
	}

	localPath, size, err := r.BackupSvc.ExecuteBackup(ctx, &latest.Spec)
	if err != nil {
		r.Log.Error(err, "backup execution failed")
		r.failBackup(ctx, key, record, err.Error())
		return
	}
	defer r.BackupSvc.CleanupLocal(localPath)

	s3Path := fmt.Sprintf("%s/%s.sql", latest.Spec.MySQLDatabase, record.Name)
	if err := s3Client.Upload(ctx, localPath, s3Path); err != nil {
		r.Log.Error(err, "S3 upload failed")
		r.failBackup(ctx, key, record, err.Error())
		return
	}

	retentionDays := latest.Spec.RetentionDays
	if retentionDays == 0 {
		retentionDays = 7
	}
	deleted, err := s3Client.DeleteOldBackups(ctx, latest.Spec.MySQLDatabase+"/", retentionDays)
	if err != nil {
		r.Log.Error(err, "failed to delete old backups")
	} else if len(deleted) > 0 {
		r.Log.Info("deleted old backups", "count", len(deleted))
	}

	r.completeBackup(ctx, key, record, s3Path, size)

	r.scheduleNextBackup(ctx, &latest)
}

func (r *DatabaseBackupReconciler) savePreCheckReport(ctx context.Context, key types.NamespacedName, report *precheck.PreCheckReport) {
	var latest v1.DatabaseBackup
	if err := r.Get(ctx, key, &latest); err != nil {
		return
	}

	results := make([]v1.PreCheckResult, 0, len(report.Results))
	for _, r := range report.Results {
		results = append(results, v1.PreCheckResult{
			Name:     r.Name,
			Status:   string(r.Status),
			Message:  r.Message,
			Detail:   r.Detail,
			Duration: r.Duration,
		})
	}

	latest.Status.LastPreCheck = &v1.PreCheckReport{
		Passed:    report.Passed,
		CheckedAt: metav1.NewTime(report.CheckedAt),
		Results:   results,
		Estimated: report.Estimated,
		DBSize:    report.DBSize,
	}

	if err := r.Status().Update(ctx, &latest); err != nil {
		r.Log.Error(err, "failed to save pre-check report")
	}
}

func (r *DatabaseBackupReconciler) failBackup(ctx context.Context, key types.NamespacedName, record v1.BackupRecord, errMsg string) {
	var latest v1.DatabaseBackup
	if err := r.Get(ctx, key, &latest); err != nil {
		return
	}

	now := metav1.Now()
	for i := range latest.Status.BackupHistory {
		if latest.Status.BackupHistory[i].Name == record.Name {
			latest.Status.BackupHistory[i].Status = v1.BackupStatusFailed
			latest.Status.BackupHistory[i].FinishTime = &now
			latest.Status.BackupHistory[i].Error = errMsg
			break
		}
	}

	latest.Status.CurrentStatus = v1.BackupStatusFailed
	latest.Status.RetryCount++
	latest.Status.LastError = errMsg

	if latest.Status.RetryCount < MaxRetryCount {
		backoff := calcBackoff(latest.Status.RetryCount)
		nextRetry := metav1.NewTime(time.Now().Add(backoff))
		latest.Status.NextBackupTime = &nextRetry
		r.Log.Info("backup failed, scheduling retry with backoff",
			"retryCount", latest.Status.RetryCount,
			"backoff", backoff,
			"nextRetry", nextRetry.Time.Format(time.RFC3339))
	} else {
		r.Log.Info("max retry count reached, not scheduling automatic retry",
			"retryCount", latest.Status.RetryCount)
	}

	if err := r.Status().Update(ctx, &latest); err != nil {
		r.Log.Error(err, "failed to update status to Failed")
	}
}

func (r *DatabaseBackupReconciler) completeBackup(ctx context.Context, key types.NamespacedName, record v1.BackupRecord, s3Path string, size int64) {
	var latest v1.DatabaseBackup
	if err := r.Get(ctx, key, &latest); err != nil {
		return
	}

	now := metav1.Now()
	for i := range latest.Status.BackupHistory {
		if latest.Status.BackupHistory[i].Name == record.Name {
			latest.Status.BackupHistory[i].Status = v1.BackupStatusCompleted
			latest.Status.BackupHistory[i].FinishTime = &now
			latest.Status.BackupHistory[i].S3Path = s3Path
			latest.Status.BackupHistory[i].Size = size
			break
		}
	}

	latest.Status.CurrentStatus = v1.BackupStatusCompleted
	latest.Status.RetryCount = 0
	latest.Status.LastError = ""

	if err := r.Status().Update(ctx, &latest); err != nil {
		r.Log.Error(err, "failed to update status to Completed")
	}
}

func (r *DatabaseBackupReconciler) scheduleNextBackup(ctx context.Context, dbBackup *v1.DatabaseBackup) {
	if dbBackup.Spec.Schedule == "" {
		return
	}

	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	sched, err := parser.Parse(dbBackup.Spec.Schedule)
	if err != nil {
		return
	}

	next := sched.Next(time.Now())
	nextTime := metav1.NewTime(next)

	var latest v1.DatabaseBackup
	key := types.NamespacedName{Namespace: dbBackup.Namespace, Name: dbBackup.Name}
	if err := r.Get(ctx, key, &latest); err != nil {
		return
	}

	latest.Status.NextBackupTime = &nextTime
	r.Status().Update(ctx, &latest)
}

func (r *DatabaseBackupReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&v1.DatabaseBackup{}).
		Owns(&corev1.Pod{}).
		Complete(r)
}

func (r *DatabaseBackupReconciler) StartBackupWorker(ctx context.Context) {
	r.Log.Info("starting backup worker")

	for {
		select {
		case req := <-BackupQueue:
			var dbBackup v1.DatabaseBackup
			if err := r.Get(ctx, req.NamespacedName, &dbBackup); err != nil {
				r.Log.Error(err, "failed to get DatabaseBackup for worker", "key", req.NamespacedName)
				continue
			}

			if dbBackup.Status.CurrentStatus != v1.BackupStatusRunning {
				if dbBackup.Status.RetryCount >= MaxRetryCount && !req.Force {
					r.Log.Info("max retry count reached, skipping worker task",
						"key", req.NamespacedName, "retryCount", dbBackup.Status.RetryCount)
					continue
				}
				go r.executeBackup(ctx, req.NamespacedName, &dbBackup)
			}
		case <-ctx.Done():
			return
		}
	}
}
