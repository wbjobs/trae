package sync

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type TransferManager struct {
	sshClient  *ssh.Client
	sftpClient *sftp.Client
	verbose    bool
}

func NewTransferManager(sshClient *ssh.Client, sftpClient *sftp.Client, verbose bool) *TransferManager {
	return &TransferManager{
		sshClient:  sshClient,
		sftpClient: sftpClient,
		verbose:    verbose,
	}
}

func (tm *TransferManager) UploadFile(localPath, remotePath string) error {
	if tm.verbose {
		fmt.Printf("Uploading: %s -> %s\n", localPath, remotePath)
	}

	localFile, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open local file: %w", err)
	}
	defer localFile.Close()

	remoteDir := getRemoteDir(remotePath)
	if err := tm.ensureRemoteDir(remoteDir); err != nil {
		return fmt.Errorf("failed to create remote directory: %w", err)
	}

	remoteFile, err := tm.sftpClient.Create(remotePath)
	if err != nil {
		return fmt.Errorf("failed to create remote file: %w", err)
	}
	defer remoteFile.Close()

	if _, err := io.Copy(remoteFile, localFile); err != nil {
		return fmt.Errorf("failed to upload file: %w", err)
	}

	if err := tm.sftpClient.Chtimes(remotePath, time.Now(), getFileModTime(localFile)); err != nil {
		if tm.verbose {
			fmt.Printf("Warning: failed to set remote file mtime: %v\n", err)
		}
	}

	return nil
}

func (tm *TransferManager) DownloadFile(remotePath, localPath string) error {
	if tm.verbose {
		fmt.Printf("Downloading: %s -> %s\n", remotePath, localPath)
	}

	remoteFile, err := tm.sftpClient.Open(remotePath)
	if err != nil {
		return fmt.Errorf("failed to open remote file: %w", err)
	}
	defer remoteFile.Close()

	localDir := filepath.Dir(localPath)
	if err := os.MkdirAll(localDir, 0755); err != nil {
		return fmt.Errorf("failed to create local directory: %w", err)
	}

	localFile, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create local file: %w", err)
	}
	defer localFile.Close()

	if _, err := io.Copy(localFile, remoteFile); err != nil {
		return fmt.Errorf("failed to download file: %w", err)
	}

	if err := localFile.Close(); err != nil {
		return fmt.Errorf("failed to close local file: %w", err)
	}

	stat, err := remoteFile.Stat()
	if err == nil {
		os.Chtimes(localPath, time.Now(), stat.ModTime())
	}

	return nil
}

func (tm *TransferManager) DeleteRemoteFile(remotePath string) error {
	if tm.verbose {
		fmt.Printf("Deleting remote: %s\n", remotePath)
	}
	return tm.sftpClient.Remove(remotePath)
}

func (tm *TransferManager) DeleteLocalFile(localPath string) error {
	if tm.verbose {
		fmt.Printf("Deleting local: %s\n", localPath)
	}
	return os.Remove(localPath)
}

func (tm *TransferManager) ensureRemoteDir(remotePath string) error {
	if remotePath == "" || remotePath == "/" {
		return nil
	}

	remotePath = filepath.ToSlash(remotePath)
	
	if !strings.HasPrefix(remotePath, "/") {
		remotePath = "/" + remotePath
	}

	parts := strings.Split(remotePath, "/")
	current := ""

	for i, part := range parts {
		if part == "" {
			if i == 0 {
				current = "/"
			}
			continue
		}
		
		if current == "/" {
			current = "/" + part
		} else if current == "" {
			current = part
		} else {
			current = current + "/" + part
		}

		if err := tm.sftpClient.Mkdir(current); err != nil {
			if !os.IsExist(err) {
				return fmt.Errorf("failed to create remote directory %q: %w", current, err)
			}
		}
	}

	return nil
}

func (tm *TransferManager) Close() {
	if tm.sftpClient != nil {
		tm.sftpClient.Close()
	}
	if tm.sshClient != nil {
		tm.sshClient.Close()
	}
}

func getFileModTime(file *os.File) time.Time {
	info, err := file.Stat()
	if err != nil {
		return time.Now()
	}
	return info.ModTime()
}

func getRemoteDir(remotePath string) string {
	remotePath = filepath.ToSlash(remotePath)
	
	if strings.HasSuffix(remotePath, "/") {
		remotePath = strings.TrimSuffix(remotePath, "/")
	}
	
	idx := strings.LastIndex(remotePath, "/")
	if idx == -1 {
		return ""
	}
	
	return remotePath[:idx]
}
