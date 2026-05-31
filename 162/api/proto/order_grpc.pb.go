// Code generated manually based on order.proto. DO NOT EDIT.

package order

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
)

type orderServiceServer struct {
	UnimplementedOrderServiceServer
	CreateOrderFunc     func(context.Context, *CreateOrderRequest) (*CreateOrderResponse, error)
	TriggerEventFunc    func(context.Context, *TriggerEventRequest) (*TriggerEventResponse, error)
	GetOrderFunc        func(context.Context, *GetOrderRequest) (*GetOrderResponse, error)
	GetOrderHistoryFunc func(context.Context, *GetOrderHistoryRequest) (*GetOrderHistoryResponse, error)
}

func (s *orderServiceServer) CreateOrder(ctx context.Context, req *CreateOrderRequest) (*CreateOrderResponse, error) {
	if s.CreateOrderFunc != nil {
		return s.CreateOrderFunc(ctx, req)
	}
	return nil, fmt.Errorf("CreateOrder not implemented")
}

func (s *orderServiceServer) TriggerEvent(ctx context.Context, req *TriggerEventRequest) (*TriggerEventResponse, error) {
	if s.TriggerEventFunc != nil {
		return s.TriggerEventFunc(ctx, req)
	}
	return nil, fmt.Errorf("TriggerEvent not implemented")
}

func (s *orderServiceServer) GetOrder(ctx context.Context, req *GetOrderRequest) (*GetOrderResponse, error) {
	if s.GetOrderFunc != nil {
		return s.GetOrderFunc(ctx, req)
	}
	return nil, fmt.Errorf("GetOrder not implemented")
}

func (s *orderServiceServer) GetOrderHistory(ctx context.Context, req *GetOrderHistoryRequest) (*GetOrderHistoryResponse, error) {
	if s.GetOrderHistoryFunc != nil {
		return s.GetOrderHistoryFunc(ctx, req)
	}
	return nil, fmt.Errorf("GetOrderHistory not implemented")
}

// OrderServiceServer is the interface that servers must implement.
type FullOrderServiceServer interface {
	CreateOrder(context.Context, *CreateOrderRequest) (*CreateOrderResponse, error)
	TriggerEvent(context.Context, *TriggerEventRequest) (*TriggerEventResponse, error)
	GetOrder(context.Context, *GetOrderRequest) (*GetOrderResponse, error)
	GetOrderHistory(context.Context, *GetOrderHistoryRequest) (*GetOrderHistoryResponse, error)
}

// RegisterOrderServiceServer registers a OrderServiceServer with the gRPC server.
func RegisterOrderServiceServer(s grpc.ServiceRegistrar, srv interface{}) {
	s.RegisterService(&grpc.ServiceDesc{
		ServiceName: "order.OrderService",
		HandlerType: (*FullOrderServiceServer)(nil),
		Methods: []grpc.MethodDesc{
			{
				MethodName: "CreateOrder",
				Handler:    _OrderService_CreateOrder_Handler,
			},
			{
				MethodName: "TriggerEvent",
				Handler:    _OrderService_TriggerEvent_Handler,
			},
			{
				MethodName: "GetOrder",
				Handler:    _OrderService_GetOrder_Handler,
			},
			{
				MethodName: "GetOrderHistory",
				Handler:    _OrderService_GetOrderHistory_Handler,
			},
		},
		Streams:  []grpc.StreamDesc{},
		Metadata: "order.proto",
	}, srv)
}

func _OrderService_CreateOrder_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(CreateOrderRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(FullOrderServiceServer).CreateOrder(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/order.OrderService/CreateOrder",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(FullOrderServiceServer).CreateOrder(ctx, req.(*CreateOrderRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _OrderService_TriggerEvent_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(TriggerEventRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(FullOrderServiceServer).TriggerEvent(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/order.OrderService/TriggerEvent",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(FullOrderServiceServer).TriggerEvent(ctx, req.(*TriggerEventRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _OrderService_GetOrder_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(GetOrderRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(FullOrderServiceServer).GetOrder(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/order.OrderService/GetOrder",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(FullOrderServiceServer).GetOrder(ctx, req.(*GetOrderRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _OrderService_GetOrderHistory_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(GetOrderHistoryRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(FullOrderServiceServer).GetOrderHistory(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/order.OrderService/GetOrderHistory",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(FullOrderServiceServer).GetOrderHistory(ctx, req.(*GetOrderHistoryRequest))
	}
	return interceptor(ctx, in, info, handler)
}
