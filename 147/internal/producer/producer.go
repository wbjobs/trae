package producer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/realtime-feature-store/internal/config"
	pb "github.com/realtime-feature-store/proto"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	writer *kafka.Writer
	cfg    *config.Config
}

func New(cfg *config.Config) *Producer {
	writer := &kafka.Writer{
		Addr:         kafka.TCP(cfg.RedpandaBrokers...),
		Topic:        cfg.EventsTopic,
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
		Async:        false,
	}

	return &Producer{
		writer: writer,
		cfg:    cfg,
	}
}

func (p *Producer) Close() error {
	return p.writer.Close()
}

func (p *Producer) SendEvent(ctx context.Context, event *pb.UserEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	err = p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(event.UserId),
		Value: data,
		Headers: []kafka.Header{
			{Key: "event_type", Value: []byte(event.EventType)},
		},
	})
	if err != nil {
		return fmt.Errorf("write message: %w", err)
	}

	return nil
}

func (p *Producer) GenerateMockEvent() *pb.UserEvent {
	eventTypes := []string{"click", "purchase"}
	eventType := eventTypes[rand.Intn(len(eventTypes))]

	event := &pb.UserEvent{
		EventId:   fmt.Sprintf("evt-%d", time.Now().UnixNano()),
		UserId:    fmt.Sprintf("user-%d", rand.Intn(100)),
		EventType: eventType,
		Timestamp: time.Now().Unix(),
		ItemId:    fmt.Sprintf("item-%d", rand.Intn(1000)),
		SessionId: fmt.Sprintf("sess-%d", rand.Intn(1000)),
	}

	if eventType == "purchase" {
		event.Amount = float64(rand.Intn(500)) + float64(rand.Intn(100))/100.0
	}

	return event
}

func (p *Producer) RunMockProducer(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	count := 0
	for {
		select {
		case <-ctx.Done():
			log.Println("Producer shutting down...")
			return
		case <-ticker.C:
			event := p.GenerateMockEvent()
			if err := p.SendEvent(ctx, event); err != nil {
				log.Printf("Failed to send event: %v", err)
			} else {
				count++
				log.Printf("[%d] Sent %s event for user %s", count, event.EventType, event.UserId)
			}
		}
	}
}
