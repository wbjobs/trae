package activity

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	pb "order-workflow/api/proto"
	"order-workflow/internal/pool"
)

type Activities struct {
	dbPool *pool.ConnectionPool
}

var (
	instance     *Activities
	instanceOnce sync.Once
)

func New() *Activities {
	return NewWithPool(nil)
}

func NewWithPool(dbPool *pool.ConnectionPool) *Activities {
	instanceOnce.Do(func() {
		instance = &Activities{
			dbPool: dbPool,
		}
	})
	return instance
}

func (a *Activities) SetPool(dbPool *pool.ConnectionPool) {
	a.dbPool = dbPool
}

type PaymentRequest struct {
	OrderID      string
	TotalAmount  float64
	UserID       string
}

type PaymentResult struct {
	Success   bool
	Gateway   string
	PaymentID string
	ErrorMsg  string
}

func (a *Activities) ReserveInventory(ctx context.Context, items []*pb.OrderItem) error {
	if a.dbPool != nil {
		conn, err := a.dbPool.Get(ctx)
		if err != nil {
			return fmt.Errorf("failed to get DB connection: %w", err)
		}
		defer a.dbPool.Put(conn)
	}

	log.Printf("[Activity] Reserving inventory for %d items...", len(items))
	for _, item := range items {
		if item.Quantity <= 0 {
			return fmt.Errorf("invalid quantity for product %s", item.ProductId)
		}
	}
	return nil
}

func (a *Activities) RollbackInventory(ctx context.Context, items []*pb.OrderItem) error {
	if a.dbPool != nil {
		conn, err := a.dbPool.Get(ctx)
		if err != nil {
			return fmt.Errorf("failed to get DB connection: %w", err)
		}
		defer a.dbPool.Put(conn)
	}

	log.Printf("[Activity] Rolling back inventory for %d items...", len(items))
	return nil
}

func (a *Activities) ProcessPayment(ctx context.Context, req PaymentRequest) (PaymentResult, error) {
	if a.dbPool != nil {
		conn, err := a.dbPool.Get(ctx)
		if err != nil {
			return PaymentResult{}, fmt.Errorf("failed to get DB connection: %w", err)
		}
		defer a.dbPool.Put(conn)
	}

	log.Printf("[Activity] Processing payment for order %s: amount=%.2f", req.OrderID, req.TotalAmount)

	select {
	case <-ctx.Done():
		return PaymentResult{}, fmt.Errorf("payment cancelled: %v", ctx.Err())
	case <-time.After(500 * time.Millisecond):
	}

	if rand.Float32() < 0.1 {
		return PaymentResult{
			Success:  false,
			Gateway:  "mock_gateway",
			ErrorMsg: "insufficient balance",
		}, nil
	}

	paymentID := fmt.Sprintf("PAY-%s-%d", req.OrderID, time.Now().UnixNano())
	return PaymentResult{
		Success:   true,
		Gateway:   "mock_gateway",
		PaymentID: paymentID,
	}, nil
}

type ShipOrderRequest struct {
	OrderID string
	Address string
}

type ShipOrderResult struct {
	TrackingID string
	Carrier    string
	ShippedAt  int64
}

func (a *Activities) ShipOrder(ctx context.Context, req ShipOrderRequest) (ShipOrderResult, error) {
	if a.dbPool != nil {
		conn, err := a.dbPool.Get(ctx)
		if err != nil {
			return ShipOrderResult{}, fmt.Errorf("failed to get DB connection: %w", err)
		}
		defer a.dbPool.Put(conn)
	}

	log.Printf("[Activity] Shipping order %s to %s", req.OrderID, req.Address)

	select {
	case <-ctx.Done():
		return ShipOrderResult{}, fmt.Errorf("shipping cancelled: %v", ctx.Err())
	case <-time.After(300 * time.Millisecond):
	}

	trackingID := fmt.Sprintf("TRK-%s-%d", req.OrderID, time.Now().UnixNano())
	return ShipOrderResult{
		TrackingID: trackingID,
		Carrier:    "mock_carrier",
		ShippedAt:  time.Now().Unix(),
	}, nil
}

func (a *Activities) ConfirmReceipt(ctx context.Context, orderID string) error {
	log.Printf("[Activity] Confirming receipt for order %s", orderID)
	return nil
}

func (a *Activities) CancelOrder(ctx context.Context, orderID, reason string) error {
	if a.dbPool != nil {
		conn, err := a.dbPool.Get(ctx)
		if err != nil {
			return fmt.Errorf("failed to get DB connection: %w", err)
		}
		defer a.dbPool.Put(conn)
	}

	log.Printf("[Activity] Cancelling order %s: %s", orderID, reason)
	return nil
}

func CreateDBConnectionPool(maxOpen, maxIdle int, maxLifetime, maxIdleTime time.Duration) *pool.ConnectionPool {
	return pool.NewConnectionPool(
		func(ctx context.Context) (interface{ Close() error }, error) {
			return &noopCloser{}, nil
		},
		pool.PoolConfig{
			MaxOpen:     maxOpen,
			MaxIdle:     maxIdle,
			MaxLifetime: maxLifetime,
			MaxIdleTime: maxIdleTime,
		},
	)
}

type noopCloser struct{}

func (n *noopCloser) Close() error { return nil }

var _ = sql.Open
