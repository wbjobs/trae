package order

import "fmt"



type OrderState int32

const (
	OrderState_ORDER_STATE_UNSPECIFIED OrderState = 0
	OrderState_CREATED                 OrderState = 1
	OrderState_PENDING_PAYMENT         OrderState = 2
	OrderState_PAYING                  OrderState = 3
	OrderState_PAID                    OrderState = 4
	OrderState_SHIPPED                 OrderState = 5
	OrderState_COMPLETED               OrderState = 6
	OrderState_CANCELLED               OrderState = 7
)

var OrderState_name = map[int32]string{
	0: "ORDER_STATE_UNSPECIFIED",
	1: "CREATED",
	2: "PENDING_PAYMENT",
	3: "PAYING",
	4: "PAID",
	5: "SHIPPED",
	6: "COMPLETED",
	7: "CANCELLED",
}

var OrderState_value = map[string]int32{
	"ORDER_STATE_UNSPECIFIED": 0,
	"CREATED":                 1,
	"PENDING_PAYMENT":         2,
	"PAYING":                  3,
	"PAID":                    4,
	"SHIPPED":                 5,
	"COMPLETED":               6,
	"CANCELLED":               7,
}

func (x OrderState) String() string {
	if s, ok := OrderState_name[int32(x)]; ok {
		return s
	}
	return fmt.Sprintf("OrderState(%d)", int32(x))
}

type OrderEvent int32

const (
	OrderEvent_ORDER_EVENT_UNSPECIFIED OrderEvent = 0
	OrderEvent_CREATE                  OrderEvent = 1
	OrderEvent_INITIATE_PAYMENT        OrderEvent = 2
	OrderEvent_PAY_SUCCESS             OrderEvent = 3
	OrderEvent_PAY_FAIL                OrderEvent = 4
	OrderEvent_SHIP                    OrderEvent = 5
	OrderEvent_CONFIRM_RECEIPT         OrderEvent = 6
	OrderEvent_CANCEL                  OrderEvent = 7
	OrderEvent_TIMEOUT                 OrderEvent = 8
)

var OrderEvent_name = map[int32]string{
	0: "ORDER_EVENT_UNSPECIFIED",
	1: "CREATE",
	2: "INITIATE_PAYMENT",
	3: "PAY_SUCCESS",
	4: "PAY_FAIL",
	5: "SHIP",
	6: "CONFIRM_RECEIPT",
	7: "CANCEL",
	8: "TIMEOUT",
}

var OrderEvent_value = map[string]int32{
	"ORDER_EVENT_UNSPECIFIED": 0,
	"CREATE":                  1,
	"INITIATE_PAYMENT":        2,
	"PAY_SUCCESS":             3,
	"PAY_FAIL":                4,
	"SHIP":                    5,
	"CONFIRM_RECEIPT":         6,
	"CANCEL":                  7,
	"TIMEOUT":                 8,
}

func (x OrderEvent) String() string {
	if s, ok := OrderEvent_name[int32(x)]; ok {
		return s
	}
	return fmt.Sprintf("OrderEvent(%d)", int32(x))
}

type OrderItem struct {
	ProductId string  `protobuf:"bytes,1,opt,name=product_id" json:"product_id"`
	Quantity  int32   `protobuf:"varint,2,opt,name=quantity" json:"quantity"`
	Price     float64 `protobuf:"fixed64,3,opt,name=price" json:"price"`
}

type Order struct {
	OrderId     string       `protobuf:"bytes,1,opt,name=order_id" json:"order_id"`
	UserId      string       `protobuf:"bytes,2,opt,name=user_id" json:"user_id"`
	Items       []*OrderItem `protobuf:"bytes,3,rep,name=items" json:"items"`
	TotalAmount float64      `protobuf:"fixed64,4,opt,name=total_amount" json:"total_amount"`
	State       OrderState   `protobuf:"varint,5,opt,name=state" json:"state"`
	CreatedAt   int64        `protobuf:"varint,6,opt,name=created_at" json:"created_at"`
	UpdatedAt   int64        `protobuf:"varint,7,opt,name=updated_at" json:"updated_at"`
	ErrorMsg    string       `protobuf:"bytes,8,opt,name=error_msg" json:"error_msg"`
}

type CreateOrderRequest struct {
	UserId string       `protobuf:"bytes,1,opt,name=user_id" json:"user_id"`
	Items  []*OrderItem `protobuf:"bytes,2,rep,name=items" json:"items"`
}

type CreateOrderResponse struct {
	OrderId string `protobuf:"bytes,1,opt,name=order_id" json:"order_id"`
	Order   *Order `protobuf:"bytes,2,opt,name=order" json:"order"`
}

type TriggerEventRequest struct {
	OrderId string     `protobuf:"bytes,1,opt,name=order_id" json:"order_id"`
	Event   OrderEvent `protobuf:"varint,2,opt,name=event" json:"event"`
	Reason  string     `protobuf:"bytes,3,opt,name=reason" json:"reason"`
}

type TriggerEventResponse struct {
	Order *Order `protobuf:"bytes,1,opt,name=order" json:"order"`
}

type GetOrderRequest struct {
	OrderId string `protobuf:"bytes,1,opt,name=order_id" json:"order_id"`
}

type GetOrderResponse struct {
	Order *Order `protobuf:"bytes,1,opt,name=order" json:"order"`
}

type StateTransition struct {
	FromState OrderState `protobuf:"varint,1,opt,name=from_state" json:"from_state"`
	ToState   OrderState `protobuf:"varint,2,opt,name=to_state" json:"to_state"`
	Event     OrderEvent `protobuf:"varint,3,opt,name=event" json:"event"`
	Timestamp int64      `protobuf:"varint,4,opt,name=timestamp" json:"timestamp"`
	Reason    string     `protobuf:"bytes,5,opt,name=reason" json:"reason"`
}

type GetOrderHistoryRequest struct {
	OrderId string `protobuf:"bytes,1,opt,name=order_id" json:"order_id"`
}

type GetOrderHistoryResponse struct {
	Transitions  []*StateTransition `protobuf:"bytes,1,rep,name=transitions" json:"transitions"`
	CurrentOrder *Order             `protobuf:"bytes,2,opt,name=current_order" json:"current_order"`
}

func (r *CreateOrderRequest) GetUserId() string {
	if r != nil {
		return r.UserId
	}
	return ""
}

func (r *CreateOrderRequest) GetItems() []*OrderItem {
	if r != nil {
		return r.Items
	}
	return nil
}

func (r *CreateOrderResponse) SetOrderId(id string) { r.OrderId = id }
func (r *CreateOrderResponse) SetOrder(o *Order)    { r.Order = o }

func (r *TriggerEventRequest) GetOrderId() string {
	if r != nil {
		return r.OrderId
	}
	return ""
}

func (r *TriggerEventRequest) GetEvent() OrderEvent {
	if r != nil {
		return r.Event
	}
	return OrderEvent_ORDER_EVENT_UNSPECIFIED
}

func (r *TriggerEventRequest) GetReason() string {
	if r != nil {
		return r.Reason
	}
	return ""
}

func (r *TriggerEventResponse) SetOrder(o *Order) { r.Order = o }

func (r *GetOrderRequest) GetOrderId() string {
	if r != nil {
		return r.OrderId
	}
	return ""
}

func (r *GetOrderResponse) SetOrder(o *Order) { r.Order = o }

func (r *GetOrderHistoryRequest) GetOrderId() string {
	if r != nil {
		return r.OrderId
	}
	return ""
}

func (r *GetOrderHistoryResponse) SetTransitions(t []*StateTransition) { r.Transitions = t }
func (r *GetOrderHistoryResponse) SetCurrentOrder(o *Order)             { r.CurrentOrder = o }

type UnimplementedOrderServiceServer struct{}
