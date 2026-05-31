package sync

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SyncEngine struct {
	task      *SyncTask
	scanner   *FileScanner
	transfer  *TransferManager
	merger    *Merger
	result    *SyncResult
	startTime time.Time
}

func NewSyncEngine(task *SyncTask) *SyncEngine {
	scanner := NewFileScanner(task.IgnorePatterns, task.ExcludeHidden)

	backupDir := ""
	if task.ConflictBackup {
		backupDir = filepath.Join(os.TempDir(), "filesync_backups", task.Name)
	}

	merger := NewMerger(task.MergeStrategy, task.TextFileExtensions, backupDir, task.Verbose)

	engine := &SyncEngine{
		task:    task,
		scanner: scanner,
		merger:  merger,
		result: &SyncResult{
			TaskName:  task.Name,
			Success:   true,
			Conflicts: []Conflict{},
			Errors:    []string{},
			Actions:   []SyncAction{},
		},
		startTime: time.Now(),
	}
	return engine
}

func (se *SyncEngine) Run() (*SyncResult, error) {
	sshClient, sftpClient, err := se.connect()
	if err != nil {
		se.result.Success = false
		se.result.Errors = append(se.result.Errors, fmt.Sprintf("Connection failed: %v", err))
		se.result.Duration = time.Since(se.startTime)
		return se.result, err
	}
	defer se.closeConnections(sshClient, sftpClient)

	se.transfer = NewTransferManager(sshClient, sftpClient, se.task.Verbose)

	switch se.task.Direction {
	case DirectionLocalToRemote:
		err = se.syncLocalToRemote()
	case DirectionRemoteToLocal:
		err = se.syncRemoteToLocal()
	case DirectionBidirectional:
		err = se.syncBidirectional()
	default:
		err = fmt.Errorf("unknown sync direction: %s", se.task.Direction)
	}

	if err != nil {
		se.result.Success = false
		se.result.Errors = append(se.result.Errors, err.Error())
	}

	se.result.Duration = time.Since(se.startTime)

	if se.task.GenerateReport && len(se.result.Conflicts) > 0 {
		se.generateConflictReport()
	}

	return se.result, nil
}

func (se *SyncEngine) connect() (*ssh.Client, *sftp.Client, error) {
	config := &ssh.ClientConfig{
		User:            se.task.RemoteConfig.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}

	if se.task.RemoteConfig.AuthMethod == "password" {
		config.Auth = []ssh.AuthMethod{
			ssh.Password(se.task.RemoteConfig.Password),
		}
	} else {
		keyPath := se.task.RemoteConfig.KeyFile
		if keyPath == "" {
			keyPath = filepath.Join(os.Getenv("HOME"), ".ssh", "id_rsa")
		}

		keyData, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to read SSH key: %w", err)
		}

		signer, err := ssh.ParsePrivateKey(keyData)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to parse SSH key: %w", err)
		}

		config.Auth = []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		}
	}

	host := se.task.RemoteConfig.Host
	port := se.task.RemoteConfig.Port
	if port == 0 {
		port = 22
	}

	addr := fmt.Sprintf("%s:%d", host, port)

	sshClient, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to connect to %s: %w", addr, err)
	}

	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		sshClient.Close()
		return nil, nil, fmt.Errorf("failed to create SFTP client: %w", err)
	}

	return sshClient, sftpClient, nil
}

func (se *SyncEngine) closeConnections(sshClient *ssh.Client, sftpClient *sftp.Client) {
	if sftpClient != nil {
		sftpClient.Close()
	}
	if sshClient != nil {
		sshClient.Close()
	}
}

func (se *SyncEngine) syncLocalToRemote() error {
	localFiles, err := se.scanner.ScanLocalDir(se.task.LocalPath)
	if err != nil {
		return fmt.Errorf("failed to scan local directory: %w", err)
	}

	remoteFiles, err := se.scanner.ScanRemoteDir(se.transfer.sftpClient, se.task.RemotePath)
	if err != nil {
		return fmt.Errorf("failed to scan remote directory: %w", err)
	}

	remoteMap := BuildFileMap(remoteFiles)

	for _, localFile := range localFiles {
		relPath := localFile.Path
		remoteFile, exists := remoteMap[relPath]

		if !exists {
			if se.task.DryRun {
				se.recordAction("upload", relPath, "new file")
				continue
			}
			if err := se.uploadFile(localFile); err != nil {
				se.result.Errors = append(se.result.Errors, fmt.Sprintf("upload %s: %v", relPath, err))
			} else {
				se.result.FilesUploaded++
				se.result.BytesTransferred += localFile.Size
				se.recordAction("upload", relPath, "new file")
			}
		} else if !localFile.IsDir && (localFile.Mtime > remoteFile.Mtime || localFile.Size != remoteFile.Size) {
			if se.task.DryRun {
				se.recordAction("upload", relPath, "local newer or different size")
				continue
			}
			if err := se.uploadFile(localFile); err != nil {
				se.result.Errors = append(se.result.Errors, fmt.Sprintf("upload %s: %v", relPath, err))
			} else {
				se.result.FilesUploaded++
				se.result.BytesTransferred += localFile.Size
				se.recordAction("upload", relPath, "local newer or different size")
			}
		} else {
			se.result.FilesSkipped++
		}
	}

	return nil
}

func (se *SyncEngine) syncRemoteToLocal() error {
	localFiles, err := se.scanner.ScanLocalDir(se.task.LocalPath)
	if err != nil {
		return fmt.Errorf("failed to scan local directory: %w", err)
	}

	remoteFiles, err := se.scanner.ScanRemoteDir(se.transfer.sftpClient, se.task.RemotePath)
	if err != nil {
		return fmt.Errorf("failed to scan remote directory: %w", err)
	}

	localMap := BuildFileMap(localFiles)

	for _, remoteFile := range remoteFiles {
		relPath := remoteFile.Path
		localFile, exists := localMap[relPath]

		if !exists {
			if se.task.DryRun {
				se.recordAction("download", relPath, "new file")
				continue
			}
			if err := se.downloadFile(remoteFile); err != nil {
				se.result.Errors = append(se.result.Errors, fmt.Sprintf("download %s: %v", relPath, err))
			} else {
				se.result.FilesDownloaded++
				se.result.BytesTransferred += remoteFile.Size
				se.recordAction("download", relPath, "new file")
			}
		} else if !remoteFile.IsDir && (remoteFile.Mtime > localFile.Mtime || remoteFile.Size != localFile.Size) {
			if se.task.DryRun {
				se.recordAction("download", relPath, "remote newer or different size")
				continue
			}
			if err := se.downloadFile(remoteFile); err != nil {
				se.result.Errors = append(se.result.Errors, fmt.Sprintf("download %s: %v", relPath, err))
			} else {
				se.result.FilesDownloaded++
				se.result.BytesTransferred += remoteFile.Size
				se.recordAction("download", relPath, "remote newer or different size")
			}
		} else {
			se.result.FilesSkipped++
		}
	}

	return nil
}

func (se *SyncEngine) syncBidirectional() error {
	localFiles, err := se.scanner.ScanLocalDir(se.task.LocalPath)
	if err != nil {
		return fmt.Errorf("failed to scan local directory: %w", err)
	}

	remoteFiles, err := se.scanner.ScanRemoteDir(se.transfer.sftpClient, se.task.RemotePath)
	if err != nil {
		return fmt.Errorf("failed to scan remote directory: %w", err)
	}

	localMap := BuildFileMap(localFiles)
	remoteMap := BuildFileMap(remoteFiles)

	for _, localFile := range localFiles {
		relPath := localFile.Path
		remoteFile, exists := remoteMap[relPath]

		if !exists {
			if !se.task.DryRun {
				if err := se.uploadFile(localFile); err != nil {
					se.result.Errors = append(se.result.Errors, fmt.Sprintf("upload %s: %v", relPath, err))
				} else {
					se.result.FilesUploaded++
					se.result.BytesTransferred += localFile.Size
					se.recordAction("upload", relPath, "new file")
				}
			} else {
				se.recordAction("upload", relPath, "new file")
			}
		} else if !se.detectAndHandleConflict(localFile, remoteFile) {
			if !localFile.IsDir && (localFile.Mtime > remoteFile.Mtime || localFile.Size != remoteFile.Size) {
				if !se.task.DryRun {
					if err := se.uploadFile(localFile); err != nil {
						se.result.Errors = append(se.result.Errors, fmt.Sprintf("upload %s: %v", relPath, err))
					} else {
						se.result.FilesUploaded++
						se.result.BytesTransferred += localFile.Size
						se.recordAction("upload", relPath, "local newer or different size")
					}
				} else {
					se.recordAction("upload", relPath, "local newer or different size")
				}
			}
		}
	}

	for _, remoteFile := range remoteFiles {
		relPath := remoteFile.Path
		if _, exists := localMap[relPath]; !exists {
			if !se.task.DryRun {
				if err := se.downloadFile(remoteFile); err != nil {
					se.result.Errors = append(se.result.Errors, fmt.Sprintf("download %s: %v", relPath, err))
				} else {
					se.result.FilesDownloaded++
					se.result.BytesTransferred += remoteFile.Size
					se.recordAction("download", relPath, "new file")
				}
			} else {
				se.recordAction("download", relPath, "new file")
			}
		}
	}

	return nil
}

func (se *SyncEngine) detectAndHandleConflict(local, remote FileInfo) bool {
	if local.IsDir || remote.IsDir {
		return false
	}

	localNewer := local.Mtime > remote.Mtime
	remoteNewer := remote.Mtime > local.Mtime
	sizeDifferent := local.Size != remote.Size

	if (localNewer || remoteNewer) && sizeDifferent {
		conflict := Conflict{
			Path:           local.Path,
			LocalInfo:      local,
			RemoteInfo:     remote,
			ConflictType:   "content_modified",
			LocalSize:      local.Size,
			RemoteSize:     remote.Size,
			LocalModified:  time.Unix(local.Mtime, 0).Format("2006-01-02 15:04:05"),
			RemoteModified: time.Unix(remote.Mtime, 0).Format("2006-01-02 15:04:05"),
			Timestamp:      time.Now().Unix(),
		}

		switch se.task.ConflictResolution {
		case ConflictNewerWins:
			if localNewer {
				conflict.Resolution = "local_wins"
			} else {
				conflict.Resolution = "remote_wins"
			}
		case ConflictLocalWins:
			conflict.Resolution = "local_wins"
		case ConflictRemoteWins:
			conflict.Resolution = "remote_wins"
		case ConflictSkip:
			conflict.Resolution = "skipped"
			se.result.Conflicts = append(se.result.Conflicts, conflict)
			se.result.FilesSkipped++
			return true
		case ConflictAutoMerge:
			if se.merger.IsTextFile(local.Path) {
				merged, err := se.handleAutoMerge(local, remote)
				if err == nil && merged != nil {
					conflict.Resolution = "merged"
					conflict.MergeResult = fmt.Sprintf("Strategy: %s, Lines merged: %d",
						merged.Strategy, len(se.splitLines(merged.Content)))
					if merged.LocalOnly > 0 || merged.RemoteOnly > 0 {
						conflict.MergeResult += fmt.Sprintf(" (local only: %d, remote only: %d)",
							merged.LocalOnly, merged.RemoteOnly)
					}
					se.result.FilesMerged++
					se.recordAction("merge", local.Path, conflict.MergeResult)
					se.result.Conflicts = append(se.result.Conflicts, conflict)
					return true
				}
			}
			conflict.Resolution = "auto_merge_failed"
		case ConflictKeepBoth:
			conflict.Resolution = "kept_both"
			se.result.FilesKeptBoth++
			backupLocal, _ := se.merger.CreateBackup(joinPath(se.task.LocalPath, local.Path))
			backupRemote, _ := se.merger.CreateBackup(joinRemotePath(se.task.RemotePath, remote.Path))
			if backupLocal != "" {
				conflict.BackupPath = backupLocal
			}
			if se.task.Verbose {
				fmt.Printf("Keeping both versions: %s (local) and %s.backup (remote)\n",
					local.Path, remote.Path)
			}
		case ConflictManual:
			conflict.Resolution = "manual"
			conflict.MergeResult = "Requires manual resolution"
		case ConflictAsk:
			conflict.Resolution = "ask"
		}

		se.result.Conflicts = append(se.result.Conflicts, conflict)

		if conflict.Resolution == "local_wins" {
			if !se.task.DryRun {
				if err := se.uploadFile(local); err != nil {
					se.result.Errors = append(se.result.Errors, fmt.Sprintf("upload %s: %v", local.Path, err))
				} else {
					se.result.FilesUploaded++
					se.result.BytesTransferred += local.Size
					se.recordAction("upload", local.Path, "conflict resolution - local wins")
				}
			} else {
				se.recordAction("upload", local.Path, "conflict resolution - local wins")
			}
		} else if conflict.Resolution == "remote_wins" {
			if !se.task.DryRun {
				if err := se.downloadFile(remote); err != nil {
					se.result.Errors = append(se.result.Errors, fmt.Sprintf("download %s: %v", remote.Path, err))
				} else {
					se.result.FilesDownloaded++
					se.result.BytesTransferred += remote.Size
					se.recordAction("download", remote.Path, "conflict resolution - remote wins")
				}
			} else {
				se.recordAction("download", remote.Path, "conflict resolution - remote wins")
			}
		}

		return true
	}

	return false
}

func (se *SyncEngine) handleAutoMerge(local, remote FileInfo) (*MergeResult, error) {
	localPath := joinPath(se.task.LocalPath, local.Path)
	remotePath := joinRemotePath(se.task.RemotePath, remote.Path)

	tempLocal := localPath + ".merge_local"
	tempRemote := remotePath + ".merge_remote"

	if err := se.transfer.DownloadFile(remotePath, tempRemote); err != nil {
		return nil, fmt.Errorf("failed to download remote file for merge: %w", err)
	}
	defer os.Remove(tempRemote)

	mergeResult, err := se.merger.Merge(localPath, tempRemote)
	if err != nil {
		return nil, fmt.Errorf("merge failed: %w", err)
	}

	if mergeResult.Success && mergeResult.Content != "" {
		if err := os.WriteFile(localPath, []byte(mergeResult.Content), 0644); err != nil {
			return nil, fmt.Errorf("failed to write merged content: %w", err)
		}

		if err := se.transfer.UploadFile(localPath, remotePath); err != nil {
			return nil, fmt.Errorf("failed to upload merged file: %w", err)
		}
	}

	return mergeResult, nil
}

func (se *SyncEngine) splitLines(content string) []string {
	var lines []string
	parts := strings.Split(content, "\n")
	for _, line := range parts {
		lines = append(lines, line)
	}
	return lines
}

func (se *SyncEngine) generateConflictReport() {
	report := NewConflictReport(se.result)

	reportPath := se.task.ReportPath
	if reportPath == "" {
		reportPath = fmt.Sprintf("conflict_report_%s_%s.json",
			se.task.Name,
			time.Now().Format("20060102_150405"))
	}

	reportData, err := report.ToJSON()
	if err != nil {
		se.result.Errors = append(se.result.Errors, fmt.Sprintf("failed to generate report: %v", err))
		return
	}

	if err := os.WriteFile(reportPath, reportData, 0644); err != nil {
		se.result.Errors = append(se.result.Errors, fmt.Sprintf("failed to save report: %v", err))
		return
	}

	se.result.ReportGenerated = true
	se.result.ReportPath = reportPath

	htmlPath := strings.TrimSuffix(reportPath, ".json") + ".html"
	htmlContent := report.ToHTML()
	if err := os.WriteFile(htmlPath, []byte(htmlContent), 0644); err == nil {
		if se.task.Verbose {
			fmt.Printf("HTML report generated: %s\n", htmlPath)
		}
	}

	if se.task.Verbose {
		fmt.Printf("Conflict report generated: %s\n", reportPath)
		fmt.Printf("Summary: %d conflicts detected\n", len(se.result.Conflicts))
	}
}

func (se *SyncEngine) uploadFile(file FileInfo) error {
	localPath := joinPath(se.task.LocalPath, file.Path)
	remotePath := joinRemotePath(se.task.RemotePath, file.Path)

	if se.task.Verbose {
		fmt.Printf("Upload file: %s -> %s\n", localPath, remotePath)
	}

	if file.IsDir {
		return se.transfer.ensureRemoteDir(remotePath)
	}

	return se.transfer.UploadFile(localPath, remotePath)
}

func (se *SyncEngine) downloadFile(file FileInfo) error {
	remotePath := joinRemotePath(se.task.RemotePath, file.Path)
	localPath := joinPath(se.task.LocalPath, file.Path)

	if se.task.Verbose {
		fmt.Printf("Download file: %s -> %s\n", remotePath, localPath)
	}

	if file.IsDir {
		return os.MkdirAll(localPath, 0755)
	}

	return se.transfer.DownloadFile(remotePath, localPath)
}

func (se *SyncEngine) recordAction(actionType, path, reason string) {
	se.result.Actions = append(se.result.Actions, SyncAction{
		Type:       actionType,
		Path:       path,
		Timestamp:  time.Now().Unix(),
		Reason:     reason,
	})
}

func joinPath(base, rel string) string {
	rel = filepath.FromSlash(rel)
	return filepath.Join(base, rel)
}

func joinRemotePath(base, rel string) string {
	rel = filepath.ToSlash(rel)

	if !strings.HasPrefix(base, "/") {
		base = "/" + base
	}

	if strings.HasSuffix(base, "/") {
		base = strings.TrimSuffix(base, "/")
	}

	if rel == "" {
		return base
	}

	if strings.HasPrefix(rel, "/") {
		rel = strings.TrimPrefix(rel, "/")
	}

	return base + "/" + rel
}
