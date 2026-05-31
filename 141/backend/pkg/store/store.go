package store

import (
	"context"
	"time"
)

const MaxVersions = 10

type StateStore interface {
	Get(ctx context.Context, key string) ([]byte, error)
	Set(ctx context.Context, key string, value []byte) error
	Delete(ctx context.Context, key string) error
	BulkGet(ctx context.Context, keys []string) (map[string][]byte, error)
	BulkSet(ctx context.Context, items map[string][]byte) error
	BulkDelete(ctx context.Context, keys []string) error

	GetVersion(ctx context.Context, key string, version int64) (*StateVersion, error)
	GetVersionHistory(ctx context.Context, key string) ([]*StateVersion, error)
	GetAtTime(ctx context.Context, key string, timestamp time.Time) ([]byte, error)
	DeleteOldVersions(ctx context.Context, key string) error

	Close() error
}

type StateItem struct {
	Key   string `json:"key"`
	Value []byte `json:"value"`
	ETag  string `json:"etag,omitempty"`
}

type StateVersion struct {
	Key       string    `json:"key"`
	Value     []byte    `json:"value"`
	Version   int64     `json:"version"`
	Timestamp time.Time `json:"timestamp"`
}
