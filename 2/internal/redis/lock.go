package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

type DistributedLock struct {
	key        string
	lockValue  string
	expiration time.Duration
}

func NewDistributedLock(resource string, expiration time.Duration) *DistributedLock {
	return &DistributedLock{
		key:        LockKeyPrefix + resource,
		lockValue:  uuid.New().String(),
		expiration: expiration,
	}
}

func (l *DistributedLock) Lock(ctx context.Context) (bool, error) {
	ok, err := Client.SetNX(ctx, l.key, l.lockValue, l.expiration).Result()
	if err != nil {
		return false, fmt.Errorf("failed to acquire lock: %w", err)
	}
	return ok, nil
}

func (l *DistributedLock) Unlock(ctx context.Context) error {
	script := `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`

	result, err := Client.Eval(ctx, script, []string{l.key}, l.lockValue).Result()
	if err != nil {
		return fmt.Errorf("failed to release lock: %w", err)
	}

	if result == int64(0) {
		return fmt.Errorf("lock does not exist or does not belong to this holder")
	}

	return nil
}

func (l *DistributedLock) TryLock(ctx context.Context, maxWait time.Duration) (bool, error) {
	start := time.Now()
	for {
		ok, err := l.Lock(ctx)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}

		if time.Since(start) >= maxWait {
			return false, nil
		}

		time.Sleep(100 * time.Millisecond)
	}
}

func (l *DistributedLock) Extend(ctx context.Context, additionalDuration time.Duration) (bool, error) {
	script := `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("pexpire", KEYS[1], ARGV[2])
		else
			return 0
		end
	`

	ms := additionalDuration.Milliseconds()
	result, err := Client.Eval(ctx, script, []string{l.key}, l.lockValue, ms).Result()
	if err != nil {
		return false, fmt.Errorf("failed to extend lock: %w", err)
	}

	return result == int64(1), nil
}

func LockTask(ctx context.Context, taskID string) (*DistributedLock, error) {
	lock := NewDistributedLock("task:"+taskID, 30*time.Second)
	ok, err := lock.Lock(ctx)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("task %s is already locked", taskID)
	}
	return lock, nil
}

func ExecuteWithLock(ctx context.Context, resource string, expiration time.Duration, fn func() error) error {
	lock := NewDistributedLock(resource, expiration)
	ok, err := lock.Lock(ctx)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("failed to acquire lock for resource: %s", resource)
	}
	defer lock.Unlock(ctx)

	return fn()
}
