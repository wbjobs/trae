package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"ssh-bastion-audit/internal/config"
)

type Storage interface {
	UploadFile(ctx context.Context, filePath, storageKey string) error
	DownloadFile(ctx context.Context, storageKey, filePath string) error
	GetObject(ctx context.Context, storageKey string) (io.ReadCloser, error)
	PutObject(ctx context.Context, storageKey string, reader io.Reader, size int64) error
	DeleteObject(ctx context.Context, storageKey string) error
	ListObjects(ctx context.Context, prefix string) ([]string, error)
}

type S3Storage struct {
	client *minio.Client
	bucket string
}

type LocalStorage struct {
	basePath string
}

func NewStorage(cfg *config.StorageConfig, storageType string) (Storage, error) {
	switch strings.ToLower(storageType) {
	case "s3":
		return NewS3Storage(&cfg.S3)
	case "local":
		return NewLocalStorage(&cfg.Local)
	default:
		return NewLocalStorage(&cfg.Local)
	}
}

func NewS3Storage(cfg *config.S3StorageConfig) (*S3Storage, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create S3 client: %w", err)
	}

	ctx := context.Background()
	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	return &S3Storage{
		client: client,
		bucket: cfg.Bucket,
	}, nil
}

func (s *S3Storage) UploadFile(ctx context.Context, filePath, storageKey string) error {
	_, err := s.client.FPutObject(ctx, s.bucket, storageKey, filePath, minio.PutObjectOptions{})
	return err
}

func (s *S3Storage) DownloadFile(ctx context.Context, storageKey, filePath string) error {
	return s.client.FGetObject(ctx, s.bucket, storageKey, filePath, minio.GetObjectOptions{})
}

func (s *S3Storage) GetObject(ctx context.Context, storageKey string) (io.ReadCloser, error) {
	return s.client.GetObject(ctx, s.bucket, storageKey, minio.GetObjectOptions{})
}

func (s *S3Storage) PutObject(ctx context.Context, storageKey string, reader io.Reader, size int64) error {
	_, err := s.client.PutObject(ctx, s.bucket, storageKey, reader, size, minio.PutObjectOptions{})
	return err
}

func (s *S3Storage) DeleteObject(ctx context.Context, storageKey string) error {
	return s.client.RemoveObject(ctx, s.bucket, storageKey, minio.RemoveObjectOptions{})
}

func (s *S3Storage) ListObjects(ctx context.Context, prefix string) ([]string, error) {
	objects := make([]string, 0)
	for obj := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if obj.Err != nil {
			return nil, obj.Err
		}
		objects = append(objects, obj.Key)
	}
	return objects, nil
}

func NewLocalStorage(cfg *config.LocalStorageConfig) (*LocalStorage, error) {
	if err := os.MkdirAll(cfg.BasePath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage directory: %w", err)
	}
	return &LocalStorage{basePath: cfg.BasePath}, nil
}

func (s *LocalStorage) fullPath(key string) string {
	return filepath.Join(s.basePath, key)
}

func (s *LocalStorage) UploadFile(ctx context.Context, filePath, storageKey string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}
	return s.PutObject(ctx, storageKey, strings.NewReader(string(data)), int64(len(data)))
}

func (s *LocalStorage) DownloadFile(ctx context.Context, storageKey, filePath string) error {
	src := s.fullPath(storageKey)
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

func (s *LocalStorage) GetObject(ctx context.Context, storageKey string) (io.ReadCloser, error) {
	return os.Open(s.fullPath(storageKey))
}

func (s *LocalStorage) PutObject(ctx context.Context, storageKey string, reader io.Reader, size int64) error {
	dstPath := s.fullPath(storageKey)
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}

	f, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.CopyN(f, reader, size)
	return err
}

func (s *LocalStorage) DeleteObject(ctx context.Context, storageKey string) error {
	return os.Remove(s.fullPath(storageKey))
}

func (s *LocalStorage) ListObjects(ctx context.Context, prefix string) ([]string, error) {
	searchPath := s.fullPath(prefix)
	objects := make([]string, 0)

	err := filepath.Walk(searchPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			relPath, _ := filepath.Rel(s.basePath, path)
			objects = append(objects, filepath.ToSlash(relPath))
		}
		return nil
	})

	if os.IsNotExist(err) {
		return objects, nil
	}
	return objects, err
}
