package middleware

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"

	"github.com/dapr-wasm/middleware/pkg/engine"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

const (
	DefaultPort = 50051
)

type GRPCServer struct {
	server    *grpc.Server
	handler   *Handler
	listener  net.Listener
	port      int
}

func NewGRPCServer(eng *engine.Engine, port int) *GRPCServer {
	return &GRPCServer{
		handler: NewHandler(eng),
		port:    port,
	}
}

func (s *GRPCServer) Start() error {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", s.port))
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}
	s.listener = lis

	s.server = grpc.NewServer()

	go func() {
		log.Printf("gRPC middleware server listening on :%d", s.port)
		if err := s.server.Serve(lis); err != nil {
			log.Printf("gRPC server error: %v", err)
		}
	}()

	return nil
}

func (s *GRPCServer) Stop() {
	if s.server != nil {
		s.server.GracefulStop()
	}
}

func (s *GRPCServer) OnRequest(ctx context.Context, req *engine.RequestContext) (*engine.ResponseContext, error) {
	md, _ := metadata.FromIncomingContext(ctx)

	if req.Headers == nil {
		req.Headers = make(http.Header)
	}
	for k, v := range md {
		if strings.HasPrefix(k, "dapr-") || strings.HasPrefix(k, ":") {
			continue
		}
		req.Headers[k] = v
	}

	if req.BodyLen == 0 && len(req.Body) > 0 {
		req.BodyLen = len(req.Body)
	}

	return s.handler.HandleRequestResponse(ctx, req)
}

func (s *GRPCServer) OnResponse(ctx context.Context, req *engine.RequestContext, resp *engine.ResponseContext) *engine.ResponseContext {
	return resp
}
