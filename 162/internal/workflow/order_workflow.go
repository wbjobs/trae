package workflow

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	pb "order-workflow/api/proto"
	"order-workflow/internal/activity"
)

const (
	TaskQueue = "ORDER_TASK_QUEUE"

	PaymentTimeout = 30 * time.Minute

	ActivityTimeoutShort  = 1 * time.Minute
	ActivityTimeoutMedium = 5 * time.Minute
	ActivityTimeoutLong   = 10 * time.Minute
)

type OrderWorkflowInput struct {
	OrderID     string
	UserID      string
	Items       []*pb.OrderItem
	TotalAmount float64
	Address     string
}

type OrderWorkflowResult struct {
	FinalState string
	OrderID    string
	ErrorMsg   string
}

type PaymentSignal struct {
	Success   bool
	PaymentID string
	ErrorMsg  string
}

const (
	SignalPayment = "PaymentSignal"
	SignalCancel  = "CancelSignal"
	QueryState    = "OrderStateQuery"
)

func OrderWorkflow(ctx workflow.Context, input OrderWorkflowInput) (OrderWorkflowResult, error) {
	result := OrderWorkflowResult{
		OrderID: input.OrderID,
	}

	logger := workflow.GetLogger(ctx)
	logger.Info("Order workflow started", "order_id", input.OrderID)

	actOpts := workflow.ActivityOptions{
		StartToCloseTimeout: ActivityTimeoutMedium,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    time.Minute,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, actOpts)

	acts := activity.New()

	if err := workflow.ExecuteActivity(ctx, acts.ReserveInventory, input.Items).Get(ctx, nil); err != nil {
		logger.Error("Inventory reservation failed", "error", err)
		result.FinalState = "CANCELLED"
		result.ErrorMsg = fmt.Sprintf("inventory reservation failed: %v", err)
		return result, nil
	}

	logger.Info("Inventory reserved, awaiting payment", "order_id", input.OrderID)

	paymentSignalCh := workflow.GetSignalChannel(ctx, SignalPayment)
	cancelSignalCh := workflow.GetSignalChannel(ctx, SignalCancel)

	timerFuture := workflow.NewTimer(ctx, PaymentTimeout)

	var paymentReceived bool
	var paymentSignal PaymentSignal
	var cancelled bool

	selector := workflow.NewSelector(ctx)

	selector.AddFuture(timerFuture, func(f workflow.Future) {
		logger.Info("Payment timeout reached, auto-cancelling order", "order_id", input.OrderID)
		cancelled = true
	})

	selector.AddReceive(paymentSignalCh, func(c workflow.ReceiveChannel, more bool) {
		var sig PaymentSignal
		c.Receive(ctx, &sig)
		paymentReceived = true
		paymentSignal = sig
		logger.Info("Payment signal received", "success", sig.Success)
	})

	selector.AddReceive(cancelSignalCh, func(c workflow.ReceiveChannel, more bool) {
		var reason string
		c.Receive(ctx, &reason)
		cancelled = true
		logger.Info("Order cancellation signal received", "reason", reason)
	})

	selector.Select(ctx)

	if cancelled {
		return cancelOrder(ctx, acts, input, "Timeout or manual cancellation")
	}

	if !paymentReceived {
		return cancelOrder(ctx, acts, input, "Payment not received")
	}

	if !paymentSignal.Success {
		logger.Warn("Payment failed", "error", paymentSignal.ErrorMsg)
		return cancelOrder(ctx, acts, input, fmt.Sprintf("payment failed: %s", paymentSignal.ErrorMsg))
	}

	logger.Info("Payment successful, proceeding to shipping", "payment_id", paymentSignal.PaymentID)

	var shipResult activity.ShipOrderResult
	if err := workflow.ExecuteActivity(ctx, acts.ShipOrder, activity.ShipOrderRequest{
		OrderID: input.OrderID,
		Address: input.Address,
	}).Get(ctx, &shipResult); err != nil {
		logger.Error("Shipping failed", "error", err)
		result.FinalState = "PAID_BUT_SHIP_FAILED"
		result.ErrorMsg = fmt.Sprintf("shipping failed: %v", err)
		return result, nil
	}

	logger.Info("Order shipped", "tracking_id", shipResult.TrackingID)

	if err := workflow.ExecuteActivity(ctx, acts.ConfirmReceipt, input.OrderID).Get(ctx, nil); err != nil {
		logger.Error("Receipt confirmation failed", "error", err)
	}

	logger.Info("Order completed", "order_id", input.OrderID)
	result.FinalState = "COMPLETED"
	return result, nil
}

func cancelOrder(ctx workflow.Context, acts *activity.Activities, input OrderWorkflowInput, reason string) (OrderWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Cancelling order", "order_id", input.OrderID, "reason", reason)

	rollbackCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: ActivityTimeoutShort,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
			MaximumAttempts:    5,
		},
	})

	_ = workflow.ExecuteActivity(rollbackCtx, acts.RollbackInventory, input.Items).Get(ctx, nil)
	_ = workflow.ExecuteActivity(rollbackCtx, acts.CancelOrder, input.OrderID, reason).Get(ctx, nil)

	return OrderWorkflowResult{
		OrderID:    input.OrderID,
		FinalState: "CANCELLED",
		ErrorMsg:   reason,
	}, nil
}

func OrderWorkflowID(orderID string) string {
	return fmt.Sprintf("ORDER-%s", orderID)
}
