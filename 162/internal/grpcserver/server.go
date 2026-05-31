package grpcserver

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"go.temporal.io/sdk/client"

	"github.com/google/uuid"

	pb "order-workflow/api/proto"
	"order-workflow/internal/circuitbreaker"
	"order-workflow/internal/ratelimit"
	"order-workflow/internal/sla"
	"order-workflow/internal/store"
	"order-workflow/internal/workflow"
)

type orderKey struct{}

type OrderServer struct {
	pb.UnimplementedOrderServiceServer
	temporalClient    client.Client
	store             *store.OrderStore
	rateLimiter       *ratelimit.RateLimiter
	cbManager         *circuitbreaker.Manager
	wfCache           *workflowCache
	slaMonitor        *sla.Monitor
}

type workflowCache struct {
	mu    sync.RWMutex
	cache map[string]*client.WorkflowRun
}

func newWorkflowCache() *workflowCache {
	return &workflowCache{cache: make(map[string]*client.WorkflowRun)}
}

func (c *workflowCache) Put(orderID string, run *client.WorkflowRun) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache[orderID] = run
}

func (c *workflowCache) Get(orderID string) (*client.WorkflowRun, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	r, ok := c.cache[orderID]
	return r, ok
}

func (c *workflowCache) Delete(orderID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.cache, orderID)
}

func NewOrderServer(
	c client.Client,
	s *store.OrderStore,
	rl *ratelimit.RateLimiter,
	cbMgr *circuitbreaker.Manager,
	slaMon *sla.Monitor,
) *OrderServer {
	return &OrderServer{
		temporalClient: c,
		store:          s,
		rateLimiter:    rl,
		cbManager:      cbMgr,
		wfCache:        newWorkflowCache(),
		slaMonitor:     slaMon,
	}
}

var activeRequests int64

func (s *OrderServer) CreateOrder(ctx context.Context, req *pb.CreateOrderRequest) (*pb.CreateOrderResponse, error) {
	if err := s.rateLimiter.Wait(ctx, "create_order"); err != nil {
		return nil, fmt.Errorf("rate limit exceeded: %w", err)
	}

	cb := s.cbManager.Get("create_order", circuitbreaker.Options{
		MaxRequests: 50,
		Interval:    10 * time.Second,
		Timeout:     30 * time.Second,
	})

	result, err := cb.Execute(func() (interface{}, error) {
		atomic.AddInt64(&activeRequests, 1)
		defer atomic.AddInt64(&activeRequests, -1)

		if req.GetUserId() == "" {
			return nil, fmt.Errorf("user_id is required")
		}
		if len(req.GetItems()) == 0 {
			return nil, fmt.Errorf("at least one item is required")
		}

		orderID := uuid.New().String()[:8]

		var totalAmount float64
		for _, item := range req.GetItems() {
			if item.Quantity <= 0 {
				return nil, fmt.Errorf("invalid quantity for product %s", item.ProductId)
			}
			totalAmount += item.Price * float64(item.Quantity)
		}

		now := time.Now().Unix()
		order := &pb.Order{
			OrderId:     orderID,
			UserId:      req.GetUserId(),
			Items:       req.GetItems(),
			TotalAmount: totalAmount,
			State:       pb.OrderState_CREATED,
			CreatedAt:   now,
			UpdatedAt:   now,
		}

		s.store.Save(order)
		s.store.AddTransition(orderID, pb.OrderState_ORDER_STATE_UNSPECIFIED,
			pb.OrderState_CREATED, pb.OrderEvent_CREATE, "order created", now)

		if s.slaMonitor != nil {
			s.slaMonitor.RecordState(orderID, pb.OrderState_CREATED, now)
		}

		wfOpts := client.StartWorkflowOptions{
			ID:        workflow.OrderWorkflowID(orderID),
			TaskQueue: workflow.TaskQueue,
		}

		wfInput := workflow.OrderWorkflowInput{
			OrderID:     orderID,
			UserID:      req.GetUserId(),
			Items:       req.GetItems(),
			TotalAmount: totalAmount,
			Address:     "123 Default Street, Test City",
		}

		run, wfErr := s.temporalClient.ExecuteWorkflow(ctx, wfOpts, workflow.OrderWorkflow, wfInput)
		if wfErr != nil {
			return nil, fmt.Errorf("failed to start workflow: %w", wfErr)
		}

		s.wfCache.Put(orderID, &run)

		order.State = pb.OrderState_PENDING_PAYMENT
		order.UpdatedAt = time.Now().Unix()
		s.store.Save(order)
		s.store.AddTransition(orderID, pb.OrderState_CREATED,
			pb.OrderState_PENDING_PAYMENT, pb.OrderEvent_INITIATE_PAYMENT,
			"awaiting payment (30min timeout)", order.UpdatedAt)

		if s.slaMonitor != nil {
			s.slaMonitor.RecordState(orderID, pb.OrderState_PENDING_PAYMENT, order.UpdatedAt)
		}

		return &pb.CreateOrderResponse{
			OrderId: orderID,
			Order:   order,
		}, nil
	})

	if err != nil {
		return nil, err
	}
	return result.(*pb.CreateOrderResponse), nil
}

func (s *OrderServer) TriggerEvent(ctx context.Context, req *pb.TriggerEventRequest) (*pb.TriggerEventResponse, error) {
	if err := s.rateLimiter.Wait(ctx, "trigger_event"); err != nil {
		return nil, fmt.Errorf("rate limit exceeded: %w", err)
	}

	orderID := req.GetOrderId()
	event := req.GetEvent()

	order, err := s.store.Get(orderID)
	if err != nil {
		return nil, err
	}

	wfID := workflow.OrderWorkflowID(orderID)
	now := time.Now().Unix()
	previousState := order.State

	switch event {
	case pb.OrderEvent_PAY_SUCCESS:
		order.State = pb.OrderState_PAID
		order.UpdatedAt = now
		s.store.Save(order)
		s.store.AddTransition(orderID, previousState,
			pb.OrderState_PAID, pb.OrderEvent_PAY_SUCCESS, "payment successful", now)

		sig := workflow.PaymentSignal{
			Success:   true,
			PaymentID: fmt.Sprintf("PAY-%s-%d", orderID, now),
		}
		if err := s.temporalClient.SignalWorkflow(ctx, wfID, "", workflow.SignalPayment, sig); err != nil {
			return nil, fmt.Errorf("failed to signal payment success: %w", err)
		}

		if s.slaMonitor != nil {
			s.slaMonitor.RecordState(orderID, pb.OrderState_PAID, now)
		}

	case pb.OrderEvent_PAY_FAIL:
		order.State = pb.OrderState_CANCELLED
		order.UpdatedAt = now
		order.ErrorMsg = "payment failed"
		s.store.Save(order)
		s.store.AddTransition(orderID, previousState,
			pb.OrderState_CANCELLED, pb.OrderEvent_PAY_FAIL, req.GetReason(), now)

		sig := workflow.PaymentSignal{
			Success:  false,
			ErrorMsg: req.GetReason(),
		}
		if err := s.temporalClient.SignalWorkflow(ctx, wfID, "", workflow.SignalPayment, sig); err != nil {
			return nil, fmt.Errorf("failed to signal payment fail: %w", err)
		}
		s.wfCache.Delete(orderID)

		if s.slaMonitor != nil {
			s.slaMonitor.RecordState(orderID, pb.OrderState_CANCELLED, now)
			s.slaMonitor.Remove(orderID)
		}

	case pb.OrderEvent_CANCEL:
		order.State = pb.OrderState_CANCELLED
		order.UpdatedAt = now
		order.ErrorMsg = req.GetReason()
		s.store.Save(order)
		s.store.AddTransition(orderID, previousState,
			pb.OrderState_CANCELLED, pb.OrderEvent_CANCEL, req.GetReason(), now)

		if err := s.temporalClient.SignalWorkflow(ctx, wfID, "", workflow.SignalCancel, req.GetReason()); err != nil {
			return nil, fmt.Errorf("failed to signal cancel: %w", err)
		}
		s.wfCache.Delete(orderID)

		if s.slaMonitor != nil {
			s.slaMonitor.RecordState(orderID, pb.OrderState_CANCELLED, now)
			s.slaMonitor.Remove(orderID)
		}

	case pb.OrderEvent_SHIP:
		order.State = pb.OrderState_SHIPPED
		order.UpdatedAt = now
		s.store.Save(order)
		s.store.AddTransition(orderID, previousState,
			pb.OrderState_SHIPPED, pb.OrderEvent_SHIP, "order shipped", now)

		if s.slaMonitor != nil {
			s.slaMonitor.RecordState(orderID, pb.OrderState_SHIPPED, now)
		}

	case pb.OrderEvent_CONFIRM_RECEIPT:
		order.State = pb.OrderState_COMPLETED
		order.UpdatedAt = now
		s.store.Save(order)
		s.store.AddTransition(orderID, previousState,
			pb.OrderState_COMPLETED, pb.OrderEvent_CONFIRM_RECEIPT, "receipt confirmed", now)
		s.wfCache.Delete(orderID)

		if s.slaMonitor != nil {
			s.slaMonitor.RecordState(orderID, pb.OrderState_COMPLETED, now)
			s.slaMonitor.Remove(orderID)
		}

	default:
		return nil, fmt.Errorf("unsupported event: %v", event)
	}

	return &pb.TriggerEventResponse{Order: order}, nil
}

func (s *OrderServer) GetOrder(ctx context.Context, req *pb.GetOrderRequest) (*pb.GetOrderResponse, error) {
	order, err := s.store.Get(req.GetOrderId())
	if err != nil {
		return nil, err
	}
	return &pb.GetOrderResponse{Order: order}, nil
}

func (s *OrderServer) GetOrderHistory(ctx context.Context, req *pb.GetOrderHistoryRequest) (*pb.GetOrderHistoryResponse, error) {
	order, err := s.store.Get(req.GetOrderId())
	if err != nil {
		return nil, err
	}

	history, err := s.store.GetHistory(req.GetOrderId())
	if err != nil {
		return nil, err
	}

	return &pb.GetOrderHistoryResponse{
		Transitions:  history,
		CurrentOrder: order,
	}, nil
}

func ActiveRequests() int64 {
	return atomic.LoadInt64(&activeRequests)
}
