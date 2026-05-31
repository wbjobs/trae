package backup

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	v1 "github.com/database-backup-operator/api/v1"
)

type Service struct {
	backupDir string
}

func NewService(backupDir string) *Service {
	os.MkdirAll(backupDir, 0755)
	return &Service{backupDir: backupDir}
}

func (s *Service) ExecuteBackup(ctx context.Context, spec *v1.DatabaseBackupSpec) (string, int64, error) {
	timestamp := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("%s-%s.sql", spec.MySQLDatabase, timestamp)
	filepath := filepath.Join(s.backupDir, filename)

	args := []string{
		"--host", spec.MySQLHost,
		"--port", fmt.Sprintf("%d", spec.MySQLPort),
		"--user", spec.MySQLUser,
		"--password=" + spec.MySQLPassword,
		"--single-transaction",
		"--routines",
		"--triggers",
		"--result-file", filepath,
		spec.MySQLDatabase,
	}

	cmd := exec.CommandContext(ctx, "mysqldump", args...)
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		os.Remove(filepath)
		return "", 0, fmt.Errorf("mysqldump failed: %w", err)
	}

	info, err := os.Stat(filepath)
	if err != nil {
		return "", 0, fmt.Errorf("stat backup file: %w", err)
	}

	return filepath, info.Size(), nil
}

func (s *Service) CleanupLocal(filepath string) error {
	return os.Remove(filepath)
}
