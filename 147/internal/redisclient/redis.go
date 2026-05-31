package redisclient

import (
	"context"
	"fmt"
	"time"

	"github.com/realtime-feature-store/internal/config"
	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
	cfg *config.Config
}

func New(cfg *config.Config) *Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})

	return &Client{
		rdb: rdb,
		cfg: cfg,
	}
}

func (c *Client) Close() error {
	return c.rdb.Close()
}

func featureKey(userID, featureName string) string {
	return fmt.Sprintf("feature:%s:%s", userID, featureName)
}

func (c *Client) SetFeature(ctx context.Context, userID, featureName string, value float64, timestamp int64) error {
	key := featureKey(userID, featureName)
	val := fmt.Sprintf("%f:%d", value, timestamp)

	return c.rdb.Set(ctx, key, val, c.cfg.FeatureTTL).Err()
}

func (c *Client) GetFeature(ctx context.Context, userID, featureName string) (float64, int64, error) {
	key := featureKey(userID, featureName)

	val, err := c.rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		return 0, 0, nil
	}
	if err != nil {
		return 0, 0, fmt.Errorf("get feature: %w", err)
	}

	var value float64
	var timestamp int64
	_, err = fmt.Sscanf(val, "%f:%d", &value, &timestamp)
	if err != nil {
		return 0, 0, fmt.Errorf("parse feature value: %w", err)
	}

	return value, timestamp, nil
}

func (c *Client) GetFeatures(ctx context.Context, userID string, featureNames []string) (map[string]float64, map[string]int64, error) {
	values := make(map[string]float64)
	timestamps := make(map[string]int64)

	for _, name := range featureNames {
		value, ts, err := c.GetFeature(ctx, userID, name)
		if err != nil {
			return nil, nil, err
		}
		values[name] = value
		timestamps[name] = ts
	}

	return values, timestamps, nil
}

func (c *Client) BatchGetFeatures(ctx context.Context, userIDs []string, featureNames []string) (map[string]map[string]float64, map[string]map[string]int64, error) {
	values := make(map[string]map[string]float64)
	timestamps := make(map[string]map[string]int64)

	for _, userID := range userIDs {
		userValues, userTimestamps, err := c.GetFeatures(ctx, userID, featureNames)
		if err != nil {
			return nil, nil, err
		}
		values[userID] = userValues
		timestamps[userID] = userTimestamps
	}

	return values, timestamps, nil
}

func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

func (c *Client) SetTTL(ttl time.Duration) {
	c.cfg.FeatureTTL = ttl
}
