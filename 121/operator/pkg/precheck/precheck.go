package precheck

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"

	v1 "github.com/database-backup-operator/api/v1"
	s3client "github.com/database-backup-operator/pkg/s3client"
)

type CheckStatus string

const (
	CheckStatusPass    CheckStatus = "Passed"
	CheckStatusWarn    CheckStatus = "Warning"
	CheckStatusFail    CheckStatus = "Failed"
	CheckStatusSkipped CheckStatus = "Skipped"
)

type CheckResult struct {
	Name     string      `json:"name"`
	Status   CheckStatus `json:"status"`
	Message  string      `json:"message"`
	Detail   string      `json:"detail,omitempty"`
	Duration string      `json:"duration,omitempty"`
}

type PreCheckReport struct {
	Passed     bool          `json:"passed"`
	CheckedAt  time.Time     `json:"checkedAt"`
	Results    []CheckResult `json:"results"`
	Estimated  string        `json:"estimatedDuration,omitempty"`
	DiskFree   string        `json:"diskFree,omitempty"`
	DBSize     string        `json:"dbSize,omitempty"`
}

type Service struct {
	backupDir string
}

func NewService(backupDir string) *Service {
	return &Service{backupDir: backupDir}
}

func (s *Service) RunPreCheck(ctx context.Context, spec *v1.DatabaseBackupSpec, s3 *s3client.Client) PreCheckReport {
	report := PreCheckReport{
		Passed:    true,
		CheckedAt: time.Now(),
	}

	report.Results = append(report.Results, s.checkMySQLConnection(ctx, spec))
	report.Results = append(report.Results, s.checkDiskSpace(ctx, spec))
	report.Results = append(report.Results, s.checkDatabaseSize(ctx, spec, &report))
	report.Results = append(report.Results, s.checkS3Access(ctx, s3, spec))
	report.Results = append(report.Results, s.estimateBackupDuration(&report))

	for _, r := range report.Results {
		if r.Status == CheckStatusFail {
			report.Passed = false
		}
	}

	return report
}

func (s *Service) checkMySQLConnection(ctx context.Context, spec *v1.DatabaseBackupSpec) CheckResult {
	start := time.Now()
	result := CheckResult{
		Name:   "mysql-connection",
		Status: CheckStatusPass,
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	args := []string{
		"--host", spec.MySQLHost,
		"--port", fmt.Sprintf("%d", spec.MySQLPort),
		"--user", spec.MySQLUser,
		"--password=" + spec.MySQLPassword,
		"--connect-timeout", "5",
		"-e", "SELECT 1",
	}

	cmd := exec.CommandContext(timeoutCtx, "mysql", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		result.Status = CheckStatusFail
		result.Message = "无法连接到 MySQL"
		result.Detail = string(output)
	} else {
		result.Message = "MySQL 连接正常"
	}

	result.Duration = time.Since(start).String()
	return result
}

func (s *Service) checkDiskSpace(ctx context.Context, spec *v1.DatabaseBackupSpec) CheckResult {
	start := time.Now()
	result := CheckResult{
		Name:   "disk-space",
		Status: CheckStatusPass,
	}

	os.MkdirAll(s.backupDir, 0755)

	var stat syscall.Statfs_t
	err := syscall.Statfs(s.backupDir, &stat)
	if err != nil {
		result.Status = CheckStatusFail
		result.Message = "无法获取磁盘信息"
		result.Detail = err.Error()
		result.Duration = time.Since(start).String()
		return result
	}

	freeBytes := int64(stat.Bavail) * int64(stat.Bsize)
	freeMB := float64(freeBytes) / (1024 * 1024)
	result.Detail = fmt.Sprintf("可用空间: %.1f MB", freeMB)

	if freeMB < 100 {
		result.Status = CheckStatusFail
		result.Message = fmt.Sprintf("磁盘空间不足 (%.0f MB < 100 MB)", freeMB)
	} else if freeMB < 500 {
		result.Status = CheckStatusWarn
		result.Message = fmt.Sprintf("磁盘空间偏低 (%.0f MB)", freeMB)
	} else {
		result.Message = fmt.Sprintf("磁盘空间充足 (%.0f MB)", freeMB)
	}

	result.Duration = time.Since(start).String()
	return result
}

func (s *Service) checkDatabaseSize(ctx context.Context, spec *v1.DatabaseBackupSpec, report *PreCheckReport) CheckResult {
	start := time.Now()
	result := CheckResult{
		Name:   "database-size",
		Status: CheckStatusPass,
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	query := fmt.Sprintf(
		`SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb 
		 FROM information_schema.tables 
		 WHERE table_schema = '%s' 
		 GROUP BY table_schema`,
		spec.MySQLDatabase,
	)

	args := []string{
		"--host", spec.MySQLHost,
		"--port", fmt.Sprintf("%d", spec.MySQLPort),
		"--user", spec.MySQLUser,
		"--password=" + spec.MySQLPassword,
		"--connect-timeout", "10",
		"-N", "-e", query,
	}

	cmd := exec.CommandContext(timeoutCtx, "mysql", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		result.Status = CheckStatusWarn
		result.Message = "无法获取数据库大小"
		result.Detail = string(output)
		result.Duration = time.Since(start).String()
		return result
	}

	sizeStr := string(output)
	if sizeStr == "" || sizeStr == "NULL\n" {
		result.Message = "数据库为空或无法获取大小"
		result.Status = CheckStatusWarn
	} else {
		result.Message = fmt.Sprintf("数据库大小: %s MB", sizeStr)
		report.DBSize = sizeStr + " MB"
	}

	result.Duration = time.Since(start).String()
	return result
}

func (s *Service) checkS3Access(ctx context.Context, s3 *s3client.Client, spec *v1.DatabaseBackupSpec) CheckResult {
	start := time.Now()
	result := CheckResult{
		Name:   "s3-access",
		Status: CheckStatusPass,
	}

	if s3 == nil {
		result.Status = CheckStatusFail
		result.Message = "S3 客户端未初始化"
		result.Duration = time.Since(start).String()
		return result
	}

	testFile := fmt.Sprintf("%s/.precheck-%d", spec.MySQLDatabase, time.Now().UnixNano())
	testContent := []byte("precheck")

	tmpFile, err := os.CreateTemp("", "s3-precheck-*")
	if err != nil {
		result.Status = CheckStatusFail
		result.Message = "无法创建临时文件"
		result.Detail = err.Error()
		result.Duration = time.Since(start).String()
		return result
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := tmpFile.Write(testContent); err != nil {
		tmpFile.Close()
		result.Status = CheckStatusFail
		result.Message = "写入临时文件失败"
		result.Detail = err.Error()
		result.Duration = time.Since(start).String()
		return result
	}
	tmpFile.Close()

	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	if err := s3.Upload(timeoutCtx, tmpPath, testFile); err != nil {
		result.Status = CheckStatusFail
		result.Message = "S3 上传失败"
		result.Detail = err.Error()
		result.Duration = time.Since(start).String()
		return result
	}

	testDownload := tmpPath + ".download"
	defer os.Remove(testDownload)
	if err := s3.Download(timeoutCtx, testFile, testDownload); err != nil {
		result.Status = CheckStatusFail
		result.Message = "S3 下载失败"
		result.Detail = err.Error()
		result.Duration = time.Since(start).String()
		return result
	}

	if err := s3.DeleteOldBackups(timeoutCtx, testFile, 0); err != nil {
		result.Status = CheckStatusWarn
		result.Message = "S3 清理测试文件失败"
		result.Detail = err.Error()
	} else {
		result.Message = "S3 读写权限正常"
	}

	result.Duration = time.Since(start).String()
	return result
}

func (s *Service) estimateBackupDuration(report *PreCheckReport) CheckResult {
	start := time.Now()
	result := CheckResult{
		Name:   "estimate-duration",
		Status: CheckStatusPass,
	}

	var dbSizeMB float64
	if report.DBSize != "" {
		fmt.Sscanf(report.DBSize, "%f", &dbSizeMB)
	}

	var estimated time.Duration
	if dbSizeMB > 0 {
		estimated = time.Duration(dbSizeMB*0.5) * time.Second
		if estimated < 10*time.Second {
			estimated = 10 * time.Second
		}
	} else {
		estimated = 30 * time.Second
		result.Status = CheckStatusWarn
	}

	if estimated > 1*time.Hour {
		result.Status = CheckStatusWarn
		result.Message = fmt.Sprintf("预估备份时长较长: %v", estimated)
	} else {
		result.Message = fmt.Sprintf("预估备份时长: %v", estimated)
	}

	report.Estimated = estimated.String()
	result.Duration = time.Since(start).String()
	return result
}

func FormatReport(report PreCheckReport) string {
	var output string
	output += fmt.Sprintf("预校验结果: %v\n\n", report.Passed)
	for _, r := range report.Results {
		icon := map[CheckStatus]string{
			CheckStatusPass:    "✓",
			CheckStatusWarn:    "⚠",
			CheckStatusFail:    "✗",
			CheckStatusSkipped: "○",
		}[r.Status]
		output += fmt.Sprintf("%s [%s] %s\n", icon, r.Name, r.Message)
		if r.Detail != "" {
			output += fmt.Sprintf("  详情: %s\n", r.Detail)
		}
	}
	if report.Estimated != "" {
		output += fmt.Sprintf("\n预估备份时长: %s\n", report.Estimated)
	}
	return output
}
