package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/realtime-feature-store/internal/config"
	"github.com/realtime-feature-store/internal/historystore"
	"github.com/realtime-feature-store/internal/redisclient"

	"github.com/segmentio/kafka-go"
)

type FeatureMessage struct {
	UserId           string  `json:"user_id"`
	ClickCount5m     int64   `json:"click_count_5m"`
	PurchaseAmount1h float64 `json:"purchase_amount_1h"`
	LastUpdated      int64   `json:"last_updated"`
}

type Consumer struct {
	reader    *kafka.Reader
	redisCli  *redisclient.Client
	historyDB *historystore.HistoryStore
	cfg       *config.Config
	lastWrite sync.Map
}

func New(cfg *config.Config, redisCli *redisclient.Client, historyDB *historystore.HistoryStore) *Consumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        cfg.RedpandaBrokers,
		Topic:          cfg.FeaturesTopic,
		GroupID:        cfg.ConsumerGroup,
		MinBytes:       10,
		MaxBytes:       10e6,
		CommitInterval: 0,
		StartOffset:    kafka.LastOffset,
		MaxAttempts:    3,
	})

	return &Consumer{
		reader:    reader,
		redisCli:  redisCli,
		historyDB: historyDB,
		cfg:       cfg,
	}
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}

func (c *Consumer) shouldUpdate(userID string, featureName string, newTimestamp int64) bool {
	key := fmt.Sprintf("%s:%s", userID, featureName)

	lastTs, ok := c.lastWrite.Load(key)
	if !ok {
		c.lastWrite.Store(key, newTimestamp)
		return true
	}

	if newTimestamp > lastTs.(int64) {
		c.lastWrite.Store(key, newTimestamp)
		return true
	}

	return false
}

func (c *Consumer) writeToHistory(ctx context.Context, featureMsg FeatureMessage) {
	if c.historyDB == nil {
		return
	}

	records := []historystore.FeatureRecord{
		{
			UserID:       featureMsg.UserId,
			FeatureName:  "click_count_5m",
			FeatureValue: float64(featureMsg.ClickCount5m),
			Timestamp:    featureMsg.LastUpdated,
		},
		{
			UserID:       featureMsg.UserId,
			FeatureName:  "purchase_amount_1h",
			FeatureValue: featureMsg.PurchaseAmount1h,
			Timestamp:    featureMsg.LastUpdated,
		},
	}

	if err := c.historyDB.WriteFeatures(ctx, records); err != nil {
		log.Printf("Error writing to history store: %v", err)
	}
}

func (c *Consumer) processMessage(ctx context.Context, msg kafka.Message) error {
	var featureMsg FeatureMessage
	if err := json.Unmarshal(msg.Value, &featureMsg); err != nil {
		return fmt.Errorf("unmarshal feature message: %w", err)
	}

	updated := false
	if c.shouldUpdate(featureMsg.UserId, "click_count_5m", featureMsg.LastUpdated) {
		if err := c.redisCli.SetFeature(ctx, featureMsg.UserId, "click_count_5m",
			float64(featureMsg.ClickCount5m), featureMsg.LastUpdated); err != nil {
			log.Printf("Error setting click_count_5m for user %s: %v", featureMsg.UserId, err)
		} else {
			updated = true
		}
	}

	if c.shouldUpdate(featureMsg.UserId, "purchase_amount_1h", featureMsg.LastUpdated) {
		if err := c.redisCli.SetFeature(ctx, featureMsg.UserId, "purchase_amount_1h",
			featureMsg.PurchaseAmount1h, featureMsg.LastUpdated); err != nil {
			log.Printf("Error setting purchase_amount_1h for user %s: %v", featureMsg.UserId, err)
		} else {
			updated = true
		}
	}

	if updated {
		c.writeToHistory(ctx, featureMsg)
		log.Printf("Updated features for user %s: clicks_5m=%d, purchases_1h=%.2f",
			featureMsg.UserId, featureMsg.ClickCount5m, featureMsg.PurchaseAmount1h)
	}

	return nil
}

func (c *Consumer) processBatch(ctx context.Context, messages []kafka.Message) error {
	for _, msg := range messages {
		if err := c.processMessage(ctx, msg); err != nil {
			log.Printf("Error processing message: %v", err)
		}
	}
	return nil
}

func (c *Consumer) Run(ctx context.Context) {
	log.Println("Starting feature consumer with optimizations...")

	batchSize := 100
	batchTimeout := 100 * time.Millisecond

	for {
		select {
		case <-ctx.Done():
			log.Println("Consumer shutting down...")
			return
		default:
		}

		var messages []kafka.Message
		deadline := time.After(batchTimeout)

		for len(messages) < batchSize {
			select {
			case <-ctx.Done():
				if len(messages) > 0 {
					c.processBatch(ctx, messages)
					c.reader.CommitMessages(ctx, messages...)
				}
				return
			case <-deadline:
				goto process
			default:
			}

			msg, err := c.reader.FetchMessage(ctx)
			if err != nil {
				log.Printf("Error fetching message: %v", err)
				time.Sleep(time.Second)
				break
			}
			messages = append(messages, msg)
		}

	process:
		if len(messages) > 0 {
			if err := c.processBatch(ctx, messages); err != nil {
				log.Printf("Error processing batch: %v", err)
			}

			if err := c.reader.CommitMessages(ctx, messages...); err != nil {
				log.Printf("Error committing messages: %v", err)
			}

			log.Printf("Processed batch of %d messages", len(messages))
		}
	}
}
