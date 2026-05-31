package s3client

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Client struct {
	minioClient *minio.Client
	bucket      string
}

type Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Bucket    string
}

func New(cfg Config) (*Client, error) {
	endpoint := strings.TrimPrefix(strings.TrimPrefix(cfg.Endpoint, "https://"), "http://")
	endpoint = strings.TrimSuffix(endpoint, "/")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	ctx := context.Background()
	err = client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{})
	if err != nil {
		exists, _ := client.BucketExists(ctx, cfg.Bucket)
		if !exists {
			return nil, fmt.Errorf("bucket %s does not exist: %w", cfg.Bucket, err)
		}
	}

	return &Client{minioClient: client, bucket: cfg.Bucket}, nil
}

func (c *Client) Upload(ctx context.Context, localPath, s3Path string) error {
	file, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("open file: %w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return fmt.Errorf("stat file: %w", err)
	}

	_, err = c.minioClient.PutObject(ctx, c.bucket, s3Path, file, stat.Size(), minio.PutObjectOptions{
		ContentType: "application/sql",
	})
	if err != nil {
		return fmt.Errorf("upload to s3: %w", err)
	}

	return nil
}

func (c *Client) Download(ctx context.Context, s3Path, localPath string) error {
	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}

	err := c.minioClient.FGetObject(ctx, c.bucket, s3Path, localPath, minio.GetObjectOptions{})
	if err != nil {
		return fmt.Errorf("download from s3: %w", err)
	}

	return nil
}

func (c *Client) ListBackups(ctx context.Context, prefix string) ([]BackupInfo, error) {
	var backups []BackupInfo

	for object := range c.minioClient.ListObjects(ctx, c.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if object.Err != nil {
			return nil, object.Err
		}

		backups = append(backups, BackupInfo{
			Key:          object.Key,
			Size:         object.Size,
			LastModified: object.LastModified,
		})
	}

	return backups, nil
}

func (c *Client) DeleteOldBackups(ctx context.Context, prefix string, retentionDays int) ([]string, error) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	var deleted []string

	for object := range c.minioClient.ListObjects(ctx, c.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if object.Err != nil {
			return deleted, object.Err
		}

		if object.LastModified.Before(cutoff) {
			err := c.minioClient.RemoveObject(ctx, c.bucket, object.Key, minio.RemoveObjectOptions{})
			if err != nil {
				return deleted, fmt.Errorf("delete %s: %w", object.Key, err)
			}
			deleted = append(deleted, object.Key)
		}
	}

	return deleted, nil
}

type BackupInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
}
