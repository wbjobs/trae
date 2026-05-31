package remote

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/pkg/sftp"
)

type SFTPClient struct {
	Client *sftp.Client
	sshConn *SSHConnection
}

func NewSFTPClient(sshConn *SSHConnection) (*SFTPClient, error) {
	sftpClient, err := sftp.NewClient(sshConn.Client)
	if err != nil {
		return nil, fmt.Errorf("failed to create SFTP client: %w", err)
	}

	return &SFTPClient{
		Client:  sftpClient,
		sshConn: sshConn,
	}, nil
}

func (s *SFTPClient) Close() error {
	if s.Client != nil {
		if err := s.Client.Close(); err != nil {
			return err
		}
	}
	if s.sshConn != nil {
		return s.sshConn.Close()
	}
	return nil
}

func (s *SFTPClient) ListDir(path string) ([]os.FileInfo, error) {
	return s.Client.ReadDir(path)
}

func (s *SFTPClient) Stat(path string) (os.FileInfo, error) {
	return s.Client.Stat(path)
}

func (s *SFTPClient) MkdirAll(path string) error {
	parts := filepath.ToSlash(path)
	dirs := filepath.SplitList(parts)

	current := ""
	for _, dir := range dirs {
		if dir == "" {
			current = "/"
			continue
		}
		if current == "/" {
			current = current + dir
		} else {
			current = current + "/" + dir
		}

		if err := s.Client.Mkdir(current); err != nil {
			if !os.IsExist(err) {
				return err
			}
		}
	}

	return nil
}

func (s *SFTPClient) Create(path string) (*sftp.File, error) {
	return s.Client.Create(path)
}

func (s *SFTPClient) Open(path string) (*sftp.File, error) {
	return s.Client.Open(path)
}

func (s *SFTPClient) Remove(path string) error {
	return s.Client.Remove(path)
}

func (s *SFTPClient) RemoveAll(path string) error {
	return s.Client.RemoveDirectory(path)
}

func (s *SFTPClient) Rename(oldPath, newPath string) error {
	return s.Client.Rename(oldPath, newPath)
}

func (s *SFTPClient) Chtimes(path string, atime, mtime time.Time) error {
	return s.Client.Chtimes(path, atime, mtime)
}

func (s *SFTPClient) Chmod(path string, mode os.FileMode) error {
	return s.Client.Chmod(path, mode)
}

func (s *SFTPClient) Chown(path string, uid, gid uint32) error {
	return s.Client.Chown(path, uid, gid)
}

func (s *SFTPClient) Getwd() (string, error) {
	return s.Client.Getwd()
}

func (s *SFTPClient) Walk(root string) *sftp.WalkDir {
	return s.Client.Walk(root)
}

func (s *SFTPClient) Exists(path string) bool {
	_, err := s.Client.Stat(path)
	return err == nil
}

func (s *SFTPClient) IsDir(path string) bool {
	info, err := s.Client.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}
