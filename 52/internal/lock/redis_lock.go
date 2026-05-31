package lock

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type LockHandle struct {
	Key   string
	Token string
	TTL   time.Duration
}

type RedisLock struct {
	client *redis.Client
	ttl    time.Duration
}

func NewRedisLock(client *redis.Client, ttlSeconds int) *RedisLock {
	return &RedisLock{
		client: client,
		ttl:    time.Duration(ttlSeconds) * time.Second,
	}
}

func (l *RedisLock) TryLock(ctx context.Context, key string) (*LockHandle, bool, error) {
	lockKey := fmt.Sprintf("lock:task:%s", key)
	token := uuid.New().String()

	ok, err := l.client.SetNX(ctx, lockKey, token, l.ttl).Result()
	if err != nil {
		return nil, false, fmt.Errorf("failed to acquire lock: %w", err)
	}
	if !ok {
		return nil, false, nil
	}

	return &LockHandle{
		Key:   key,
		Token: token,
		TTL:   l.ttl,
	}, true, nil
}

func (l *RedisLock) Renew(ctx context.Context, handle *LockHandle) (bool, error) {
	lockKey := fmt.Sprintf("lock:task:%s", handle.Key)

	script := `
		if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("EXPIRE", KEYS[1], ARGV[2])
		else
			return 0
		end
	`

	result, err := l.client.Eval(ctx, script, []string{lockKey}, handle.Token, int(l.ttl.Seconds())).Result()
	if err != nil {
		return false, fmt.Errorf("failed to renew lock: %w", err)
	}

	return result.(int64) == 1, nil
}

func (l *RedisLock) Unlock(ctx context.Context, handle *LockHandle) error {
	lockKey := fmt.Sprintf("lock:task:%s", handle.Key)

	script := `
		if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("DEL", KEYS[1])
		else
			return 0
		end
	`

	_, err := l.client.Eval(ctx, script, []string{lockKey}, handle.Token).Result()
	if err != nil {
		return fmt.Errorf("failed to release lock: %w", err)
	}
	return nil
}
