package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStore struct {
	client    *redis.Client
	keyPrefix string
}

type RedisConfig struct {
	Addr      string
	Password  string
	DB        int
	KeyPrefix string
}

func NewRedisStore(cfg RedisConfig) (*RedisStore, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return &RedisStore{
		client:    client,
		keyPrefix: cfg.KeyPrefix,
	}, nil
}

func (s *RedisStore) prefixKey(key string) string {
	if s.keyPrefix != "" {
		return s.keyPrefix + ":" + key
	}
	return key
}

func (s *RedisStore) versionKey(key string) string {
	return s.prefixKey(key) + ":versions"
}

func (s *RedisStore) versionDataKey(key string, version int64) string {
	return fmt.Sprintf("%s:version:%d", s.prefixKey(key), version)
}

func (s *RedisStore) Get(ctx context.Context, key string) ([]byte, error) {
	val, err := s.client.Get(ctx, s.prefixKey(key)).Bytes()
	if err == redis.Nil {
		return nil, fmt.Errorf("key not found: %s", key)
	}
	if err != nil {
		return nil, fmt.Errorf("redis get error: %w", err)
	}
	return val, nil
}

func (s *RedisStore) Set(ctx context.Context, key string, value []byte) error {
	pipe := s.client.TxPipeline()

	pipe.Set(ctx, s.prefixKey(key), value, 0)

	version := time.Now().UnixNano()
	sv := &StateVersion{
		Key:       key,
		Value:     value,
		Version:   version,
		Timestamp: time.Now(),
	}

	data, err := json.Marshal(sv)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	pipe.Set(ctx, s.versionDataKey(key, version), data, 0)

	pipe.ZAdd(ctx, s.versionKey(key), redis.Z{
		Score:  float64(version),
		Member: version,
	})

	pipe.ZRemRangeByRank(ctx, s.versionKey(key), 0, -int64(MaxVersions)-1)

	_, err = pipe.Exec(ctx)
	return err
}

func (s *RedisStore) Delete(ctx context.Context, key string) error {
	return s.client.Del(ctx, s.prefixKey(key)).Err()
}

func (s *RedisStore) BulkGet(ctx context.Context, keys []string) (map[string][]byte, error) {
	result := make(map[string][]byte)
	if len(keys) == 0 {
		return result, nil
	}

	prefixedKeys := make([]string, len(keys))
	for i, key := range keys {
		prefixedKeys[i] = s.prefixKey(key)
	}

	vals, err := s.client.MGet(ctx, prefixedKeys...).Result()
	if err != nil {
		return nil, fmt.Errorf("redis mget error: %w", err)
	}

	for i, val := range vals {
		if val != nil {
			if strVal, ok := val.(string); ok {
				result[keys[i]] = []byte(strVal)
			}
		}
	}
	return result, nil
}

func (s *RedisStore) BulkSet(ctx context.Context, items map[string][]byte) error {
	if len(items) == 0 {
		return nil
	}

	pipe := s.client.TxPipeline()
	now := time.Now()

	for key, val := range items {
		pipe.Set(ctx, s.prefixKey(key), val, 0)

		version := now.UnixNano()
		sv := &StateVersion{
			Key:       key,
			Value:     val,
			Version:   version,
			Timestamp: now,
		}

		data, err := json.Marshal(sv)
		if err != nil {
			return fmt.Errorf("marshal error: %w", err)
		}

		pipe.Set(ctx, s.versionDataKey(key, version), data, 0)

		pipe.ZAdd(ctx, s.versionKey(key), redis.Z{
			Score:  float64(version),
			Member: version,
		})

		pipe.ZRemRangeByRank(ctx, s.versionKey(key), 0, -int64(MaxVersions)-1)
	}

	_, err := pipe.Exec(ctx)
	return err
}

func (s *RedisStore) BulkDelete(ctx context.Context, keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	prefixedKeys := make([]string, len(keys))
	for i, key := range keys {
		prefixedKeys[i] = s.prefixKey(key)
	}
	return s.client.Del(ctx, prefixedKeys...).Err()
}

func (s *RedisStore) GetVersion(ctx context.Context, key string, version int64) (*StateVersion, error) {
	data, err := s.client.Get(ctx, s.versionDataKey(key, version)).Bytes()
	if err == redis.Nil {
		return nil, fmt.Errorf("version not found: %s v%d", key, version)
	}
	if err != nil {
		return nil, fmt.Errorf("redis get error: %w", err)
	}

	var sv StateVersion
	if err := json.Unmarshal(data, &sv); err != nil {
		return nil, fmt.Errorf("unmarshal error: %w", err)
	}

	return &sv, nil
}

func (s *RedisStore) GetVersionHistory(ctx context.Context, key string) ([]*StateVersion, error) {
	members, err := s.client.ZRevRange(ctx, s.versionKey(key), 0, int64(MaxVersions)-1).Result()
	if err != nil {
		return nil, fmt.Errorf("redis zrange error: %w", err)
	}

	result := make([]*StateVersion, 0, len(members))
	for _, member := range members {
		var version int64
		if _, err := fmt.Sscanf(member, "%d", &version); err != nil {
			continue
		}

		sv, err := s.GetVersion(ctx, key, version)
		if err != nil {
			continue
		}
		result = append(result, sv)
	}

	return result, nil
}

func (s *RedisStore) GetAtTime(ctx context.Context, key string, timestamp time.Time) ([]byte, error) {
	targetScore := float64(timestamp.UnixNano())

	members, err := s.client.ZRangeByScore(ctx, s.versionKey(key), &redis.ZRangeBy{
		Min:    "-inf",
		Max:    fmt.Sprintf("%f", targetScore),
		Offset: 0,
		Count:  1,
	}).Result()
	if err != nil {
		return nil, fmt.Errorf("redis zrange error: %w", err)
	}

	if len(members) == 0 {
		return nil, fmt.Errorf("no version found at the specified time")
	}

	var version int64
	if _, err := fmt.Sscanf(members[0], "%d", &version); err != nil {
		return nil, fmt.Errorf("parse version error: %w", err)
	}

	sv, err := s.GetVersion(ctx, key, version)
	if err != nil {
		return nil, err
	}

	return sv.Value, nil
}

func (s *RedisStore) DeleteOldVersions(ctx context.Context, key string) error {
	return s.client.Del(ctx, s.versionKey(key)).Err()
}

func (s *RedisStore) Close() error {
	return s.client.Close()
}
