package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
)

type TaskQueueItem struct {
	TaskID      string `json:"task_id"`
	ExecutionID string `json:"execution_id"`
	Priority    int    `json:"priority"`
	ScheduledAt int64  `json:"scheduled_at"`
}

func EnqueueTask(ctx context.Context, item *TaskQueueItem) error {
	data, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("failed to marshal queue item: %w", err)
	}

	score := float64(item.ScheduledAt)
	err = Client.ZAdd(ctx, TaskQueueKey, &redis.Z{
		Score:  score,
		Member: string(data),
	}).Err()

	if err != nil {
		return fmt.Errorf("failed to enqueue task: %w", err)
	}

	return nil
}

func DequeueTask(ctx context.Context, timeout time.Duration) (*TaskQueueItem, error) {
	now := time.Now().Unix()

	script := `
		local items = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, 1)
		if #items == 0 then
			return nil
		end
		redis.call('ZREM', KEYS[1], items[1])
		return items[1]
	`

	result, err := Client.Eval(ctx, script, []string{TaskQueueKey}, now).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to dequeue task: %w", err)
	}

	if result == nil {
		return nil, nil
	}

	item := &TaskQueueItem{}
	data, ok := result.(string)
	if !ok {
		return nil, fmt.Errorf("invalid queue item format")
	}

	if err := json.Unmarshal([]byte(data), item); err != nil {
		return nil, fmt.Errorf("failed to unmarshal queue item: %w", err)
	}

	return item, nil
}

func GetQueueLength(ctx context.Context) (int64, error) {
	return Client.ZCard(ctx, TaskQueueKey).Result()
}

func ClearQueue(ctx context.Context) error {
	return Client.Del(ctx, TaskQueueKey).Err()
}

func MarkTaskRunning(ctx context.Context, taskID, executionID string) error {
	key := TaskRunningKey + ":" + taskID
	return Client.Set(ctx, key, executionID, 10*time.Minute).Err()
}

func MarkTaskComplete(ctx context.Context, taskID string) error {
	key := TaskRunningKey + ":" + taskID
	return Client.Del(ctx, key).Err()
}

func IsTaskRunning(ctx context.Context, taskID string) (bool, error) {
	key := TaskRunningKey + ":" + taskID
	result, err := Client.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return result > 0, nil
}

func PublishTaskResult(ctx context.Context, result interface{}) error {
	data, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal result: %w", err)
	}
	return Client.RPush(ctx, TaskResultKey, string(data)).Err()
}

func ConsumeTaskResult(ctx context.Context, timeout time.Duration) (string, error) {
	result, err := Client.BLPop(ctx, timeout, TaskResultKey).Result()
	if err != nil {
		if err == redis.Nil {
			return "", nil
		}
		return "", fmt.Errorf("failed to consume result: %w", err)
	}

	if len(result) < 2 {
		return "", nil
	}

	return result[1], nil
}
