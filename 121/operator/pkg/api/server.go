package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	v1 "github.com/database-backup-operator/api/v1"
	"github.com/database-backup-operator/controllers"
	s3client "github.com/database-backup-operator/pkg/s3client"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

type Server struct {
	K8sClient client.Client
	S3Clients map[string]*s3client.Client
	Router    *gin.Engine
}

func NewServer(k8sClient client.Client) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	router.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	s := &Server{
		K8sClient: k8sClient,
		S3Clients: make(map[string]*s3client.Client),
		Router:    router,
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	api := s.Router.Group("/api/v1")
	{
		api.GET("/backups", s.listBackups)
		api.GET("/backups/:namespace/:name", s.getBackup)
		api.POST("/backups/:namespace/:name/trigger", s.triggerBackup)
		api.GET("/backups/:namespace/:name/records", s.listBackupRecords)
		api.POST("/backups/:namespace/:name/restore", s.restoreBackup)
		api.GET("/backups/:namespace/:name/precheck", s.getPreCheck)
		api.GET("/health", s.health)
	}
}

func (s *Server) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type BackupResponse struct {
	Name              string             `json:"name"`
	Namespace         string             `json:"namespace"`
	MySQLHost         string             `json:"mysqlHost"`
	MySQLDatabase     string             `json:"mysqlDatabase"`
	Schedule          string             `json:"schedule,omitempty"`
	RetentionDays     int                `json:"retentionDays"`
	S3Bucket          string             `json:"s3Bucket"`
	CurrentStatus     string             `json:"currentStatus"`
	RetryCount        int                `json:"retryCount"`
	LastError         string             `json:"lastError,omitempty"`
	LastBackupTime    *time.Time         `json:"lastBackupTime,omitempty"`
	NextBackupTime    *time.Time         `json:"nextBackupTime,omitempty"`
	BackupHistory     []BackupRecordResp `json:"backupHistory,omitempty"`
	LastPreCheck      *PreCheckReportResp `json:"lastPreCheck,omitempty"`
}

type PreCheckReportResp struct {
	Passed    bool                `json:"passed"`
	CheckedAt time.Time           `json:"checkedAt"`
	Results   []PreCheckResultResp `json:"results"`
	Estimated string              `json:"estimatedDuration,omitempty"`
	DBSize    string              `json:"dbSize,omitempty"`
}

type PreCheckResultResp struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
	Duration string `json:"duration,omitempty"`
}

type BackupRecordResp struct {
	Name       string     `json:"name"`
	Size       int64      `json:"size"`
	SizeHuman  string     `json:"sizeHuman"`
	Status     string     `json:"status"`
	StartTime  time.Time  `json:"startTime"`
	FinishTime *time.Time `json:"finishTime,omitempty"`
	S3Path     string     `json:"s3Path,omitempty"`
	Error      string     `json:"error,omitempty"`
}

func humanSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func convertRecord(r v1.BackupRecord) BackupRecordResp {
	resp := BackupRecordResp{
		Name:      r.Name,
		Size:      r.Size,
		SizeHuman: humanSize(r.Size),
		Status:    string(r.Status),
		StartTime: r.StartTime.Time,
	}
	if r.FinishTime != nil {
		resp.FinishTime = &r.FinishTime.Time
	}
	resp.S3Path = r.S3Path
	resp.Error = r.Error
	return resp
}

func (s *Server) listBackups(c *gin.Context) {
	var dbBackupList v1.DatabaseBackupList
	if err := s.K8sClient.List(c.Request.Context(), &dbBackupList); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var resp []BackupResponse
	for _, item := range dbBackupList.Items {
		resp = append(resp, s.toBackupResponse(item))
	}

	c.JSON(http.StatusOK, resp)
}

func (s *Server) getBackup(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")

	var dbBackup v1.DatabaseBackup
	key := types.NamespacedName{Namespace: namespace, Name: name}
	if err := s.K8sClient.Get(c.Request.Context(), key, &dbBackup); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup not found"})
		return
	}

	c.JSON(http.StatusOK, s.toBackupResponse(dbBackup))
}

func (s *Server) toBackupResponse(item v1.DatabaseBackup) BackupResponse {
	resp := BackupResponse{
		Name:          item.Name,
		Namespace:     item.Namespace,
		MySQLHost:     item.Spec.MySQLHost,
		MySQLDatabase: item.Spec.MySQLDatabase,
		Schedule:      item.Spec.Schedule,
		RetentionDays: item.Spec.RetentionDays,
		S3Bucket:      item.Spec.S3Bucket,
		CurrentStatus: string(item.Status.CurrentStatus),
		RetryCount:    item.Status.RetryCount,
		LastError:     item.Status.LastError,
	}

	if item.Status.LastBackupTime != nil {
		resp.LastBackupTime = &item.Status.LastBackupTime.Time
	}
	if item.Status.NextBackupTime != nil {
		resp.NextBackupTime = &item.Status.NextBackupTime.Time
	}

	for _, r := range item.Status.BackupHistory {
		resp.BackupHistory = append(resp.BackupHistory, convertRecord(r))
	}

	if item.Status.LastPreCheck != nil {
		resp.LastPreCheck = convertPreCheckReport(item.Status.LastPreCheck)
	}

	return resp
}

func convertPreCheckReport(report *v1.PreCheckReport) *PreCheckReportResp {
	if report == nil {
		return nil
	}

	results := make([]PreCheckResultResp, 0, len(report.Results))
	for _, r := range report.Results {
		results = append(results, PreCheckResultResp{
			Name:     r.Name,
			Status:   r.Status,
			Message:  r.Message,
			Detail:   r.Detail,
			Duration: r.Duration,
		})
	}

	return &PreCheckReportResp{
		Passed:    report.Passed,
		CheckedAt: report.CheckedAt.Time,
		Results:   results,
		Estimated: report.Estimated,
		DBSize:    report.DBSize,
	}
}

func (s *Server) getPreCheck(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")

	var dbBackup v1.DatabaseBackup
	key := types.NamespacedName{Namespace: namespace, Name: name}
	if err := s.K8sClient.Get(c.Request.Context(), key, &dbBackup); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup not found"})
		return
	}

	if dbBackup.Status.LastPreCheck == nil {
		c.JSON(http.StatusOK, gin.H{"preCheck": nil})
		return
	}

	c.JSON(http.StatusOK, convertPreCheckReport(dbBackup.Status.LastPreCheck))
}

func (s *Server) listBackupRecords(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")

	var dbBackup v1.DatabaseBackup
	key := types.NamespacedName{Namespace: namespace, Name: name}
	if err := s.K8sClient.Get(c.Request.Context(), key, &dbBackup); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup not found"})
		return
	}

	var records []BackupRecordResp
	for _, r := range dbBackup.Status.BackupHistory {
		records = append(records, convertRecord(r))
	}

	c.JSON(http.StatusOK, records)
}

func (s *Server) triggerBackup(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")

	key := types.NamespacedName{Namespace: namespace, Name: name}

	var dbBackup v1.DatabaseBackup
	if err := s.K8sClient.Get(c.Request.Context(), key, &dbBackup); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup not found"})
		return
	}

	if dbBackup.Status.CurrentStatus == v1.BackupStatusRunning {
		c.JSON(http.StatusConflict, gin.H{"error": "backup already in progress"})
		return
	}

	controllers.BackupQueue <- controllers.BackupRequest{
		NamespacedName: key,
		Force:          true,
	}

	c.JSON(http.StatusAccepted, gin.H{"message": "backup triggered"})
}

type RestoreRequest struct {
	BackupName string `json:"backupName" binding:"required"`
}

func (s *Server) restoreBackup(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")

	var req RestoreRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	key := types.NamespacedName{Namespace: namespace, Name: name}

	var dbBackup v1.DatabaseBackup
	if err := s.K8sClient.Get(c.Request.Context(), key, &dbBackup); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "backup not found"})
		return
	}

	s3Client, err := s.getOrCreateS3Client(&dbBackup)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("S3 client error: %v", err)})
		return
	}

	localDir := "/tmp/restore"
	os.MkdirAll(localDir, 0755)

	s3Path := fmt.Sprintf("%s/%s.sql", dbBackup.Spec.MySQLDatabase, req.BackupName)
	localPath := filepath.Join(localDir, fmt.Sprintf("%s-%s-restore.sql", dbBackup.Spec.MySQLDatabase, req.BackupName))

	if err := s3Client.Download(c.Request.Context(), s3Path, localPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("download failed: %v", err)})
		return
	}
	defer os.Remove(localPath)

	if err := s.executeRestore(c.Request.Context(), &dbBackup.Spec, localPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("restore failed: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "restore completed successfully"})
}

func (s *Server) executeRestore(ctx context.Context, spec *v1.DatabaseBackupSpec, sqlFile string) error {
	cmd := exec.CommandContext(ctx, "mysql",
		"--host", spec.MySQLHost,
		"--port", fmt.Sprintf("%d", spec.MySQLPort),
		"--user", spec.MySQLUser,
		"--password="+spec.MySQLPassword,
		spec.MySQLDatabase,
	)

	file, err := os.Open(sqlFile)
	if err != nil {
		return fmt.Errorf("open sql file: %w", err)
	}
	defer file.Close()

	cmd.Stdin = file
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("mysql restore: %w", err)
	}

	return nil
}

func (s *Server) getOrCreateS3Client(dbBackup *v1.DatabaseBackup) (*s3client.Client, error) {
	key := fmt.Sprintf("%s/%s", dbBackup.Namespace, dbBackup.Name)

	if client, ok := s.S3Clients[key]; ok {
		return client, nil
	}

	client, err := s3client.New(s3client.Config{
		Endpoint:  dbBackup.Spec.S3Endpoint,
		AccessKey: dbBackup.Spec.S3AccessKey,
		SecretKey: dbBackup.Spec.S3SecretKey,
		UseSSL:    dbBackup.Spec.S3UseSSL,
		Bucket:    dbBackup.Spec.S3Bucket,
	})
	if err != nil {
		return nil, err
	}

	s.S3Clients[key] = client
	return client, nil
}

func (s *Server) Run(addr string) error {
	return s.Router.Run(addr)
}
