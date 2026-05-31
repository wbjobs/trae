package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/edge/wruntime/pkg/config"
	"github.com/edge/wruntime/pkg/types"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage struct {
	client *minio.Client
	bucket string
}

func New(cfg *config.Config) (*Storage, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	s := &Storage{
		client: client,
		bucket: cfg.MinIOBucket,
	}

	if err := s.ensureBucket(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *Storage) ensureBucket() error {
	ctx := context.Background()
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		if err := s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
	}
	return nil
}

func (s *Storage) DeployFunction(ctx context.Context, req *types.DeployRequest) (*types.DeployResponse, error) {
	objectName := fmt.Sprintf("%s/%s/function.wasm", req.Name, req.Version)

	info, err := s.client.PutObject(ctx, s.bucket, objectName,
		strings.NewReader(string(req.WasmFile)), int64(len(req.WasmFile)),
		minio.PutObjectOptions{
			ContentType: "application/wasm",
			UserMetadata: map[string]string{
				"description": req.Description,
				"name":         req.Name,
				"version":      req.Version,
				"memory_limit": fmt.Sprintf("%d", req.MemoryLimit),
				"timeout_ms":   fmt.Sprintf("%d", req.TimeoutMs),
			},
		})
	if err != nil {
		return nil, fmt.Errorf("failed to upload wasm: %w", err)
	}

	meta := types.FunctionVersion{
		Name:        req.Name,
		Version:     req.Version,
		Description: req.Description,
		CreatedAt:   time.Now(),
		Size:        info.Size,
	}
	metaName := fmt.Sprintf("%s/%s/meta.json", req.Name, req.Version)
	metaBytes, _ := json.Marshal(meta)
	_, err = s.client.PutObject(ctx, s.bucket, metaName,
		strings.NewReader(string(metaBytes)), int64(len(metaBytes)),
		minio.PutObjectOptions{ContentType: "application/json"})
	if err != nil {
		return nil, fmt.Errorf("failed to upload meta: %w", err)
	}

	latestName := fmt.Sprintf("%s/latest", req.Name)
	_, err = s.client.PutObject(ctx, s.bucket, latestName,
		strings.NewReader(req.Version), int64(len(req.Version)),
		minio.PutObjectOptions{ContentType: "text/plain"})
	if err != nil {
		return nil, fmt.Errorf("failed to set latest: %w", err)
	}

	return &types.DeployResponse{
		Success: true,
		Message: "Function deployed successfully",
		Name:    req.Name,
		Version: req.Version,
		Size:    info.Size,
	}, nil
}

func (s *Storage) GetFunction(ctx context.Context, name, version string) ([]byte, *types.FunctionConfig, error) {
	if version == "" || version == "latest" {
		var err error
		version, err = s.getLatestVersion(ctx, name)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to get latest version: %w", err)
		}
	}

	objectName := fmt.Sprintf("%s/%s/function.wasm", name, version)
	obj, err := s.client.GetObject(ctx, s.bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get function: %w", err)
	}
	defer obj.Close()

	wasmBytes, err := io.ReadAll(obj)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read wasm: %w", err)
	}

	metaName := fmt.Sprintf("%s/%s/meta.json", name, version)
	metaObj, err := s.client.GetObject(ctx, s.bucket, metaName, minio.GetObjectOptions{})
	if err != nil {
		return wasmBytes, &types.FunctionConfig{Name: name, Version: version}, nil
	}
	defer metaObj.Close()

	var meta types.FunctionVersion
	if metaBytes, err := io.ReadAll(metaObj); err == nil {
		json.Unmarshal(metaBytes, &meta)
	}

	return wasmBytes, &types.FunctionConfig{
		Name:    name,
		Version: version,
	}, nil
}

func (s *Storage) getLatestVersion(ctx context.Context, name string) (string, error) {
	latestName := fmt.Sprintf("%s/latest", name)
	obj, err := s.client.GetObject(ctx, s.bucket, latestName, minio.GetObjectOptions{})
	if err != nil {
		return "", err
	}
	defer obj.Close()

	version, err := io.ReadAll(obj)
	if err != nil {
		return "", err
	}

	return string(version), nil
}

func (s *Storage) ListVersions(ctx context.Context, name string) ([]types.FunctionVersion, error) {
	prefix := fmt.Sprintf("%s/", name)
	var versions []types.FunctionVersion

	for object := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if strings.HasSuffix(object.Key, "meta.json") {
			obj, err := s.client.GetObject(ctx, s.bucket, object.Key, minio.GetObjectOptions{})
			if err != nil {
				continue
			}
			var meta types.FunctionVersion
			if bytes, err := io.ReadAll(obj); err == nil {
				json.Unmarshal(bytes, &meta)
				versions = append(versions, meta)
			}
			obj.Close()
		}
	}

	return versions, nil
}
