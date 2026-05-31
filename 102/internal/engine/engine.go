package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"text/template"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"

	"grpcmock/internal/config"
	"grpcmock/internal/proto"
)

// Engine wires together proto descriptors and YAML templates to produce
// dynamic mock gRPC service registrations and HTTP handlers.
type Engine struct {
	reg   *proto.Registry
	store *config.Store

	// JSON codec options shared across HTTP + gRPC paths.
	marshal   protojson.MarshalOptions
	unmarshal protojson.UnmarshalOptions
}

// New constructs a mock Engine.
func New(reg *proto.Registry, store *config.Store) *Engine {
	resolver := protoregistry.GlobalTypes
	return &Engine{
		reg:   reg,
		store: store,
		marshal: protojson.MarshalOptions{
			UseProtoNames: true,
			Resolver:      resolver,
		},
		unmarshal: protojson.UnmarshalOptions{
			DiscardUnknown: true,
			Resolver:       resolver,
		},
	}
}

// Register installs a dynamic ServiceDesc for every service found in the
// proto registry onto the given gRPC server.
func (e *Engine) Register(srv grpc.ServiceRegistrar) {
	for _, svcName := range e.reg.Services() {
		svc, _ := e.reg.Service(svcName)
		sd := e.buildServiceDesc(svc)
		srv.RegisterService(sd, e)
	}
}

func (e *Engine) buildServiceDesc(svc protoreflect.ServiceDescriptor) *grpc.ServiceDesc {
	methods := svc.Methods()
	sd := &grpc.ServiceDesc{
		ServiceName: string(svc.FullName()),
		HandlerType: (*interface{})(nil),
		Streams:     []grpc.StreamDesc{},
	}
	for i := 0; i < methods.Len(); i++ {
		m := methods.Get(i)
		handler := e.makeHandler(svc, m)
		if m.IsServerStreaming() || m.IsClientStreaming() {
			sd.Streams = append(sd.Streams, grpc.StreamDesc{
				StreamName:    string(m.Name()),
				Handler:       handler.(grpc.StreamHandler),
				ServerStreams: m.IsServerStreaming(),
				ClientStreams: m.IsClientStreaming(),
			})
		} else {
			sd.Methods = append(sd.Methods, grpc.MethodDesc{
				MethodName: string(m.Name()),
				Handler:    handler.(grpc.MethodHandler),
			})
		}
	}
	return sd
}

func (e *Engine) makeHandler(svc protoreflect.ServiceDescriptor, m protoreflect.MethodDescriptor) interface{} {
	svcName := string(svc.FullName())
	methodName := string(m.Name())
	if !m.IsServerStreaming() && !m.IsClientStreaming() {
		return func(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
			return e.handleUnary(ctx, svcName, methodName, m, dec)
		}
	}
	return func(srv interface{}, stream grpc.ServerStream) error {
		return e.handleStreaming(stream.Context(), svcName, methodName, m, stream)
	}
}

func (e *Engine) handleUnary(ctx context.Context, svc, method string, md protoreflect.MethodDescriptor, dec func(interface{}) error) (interface{}, error) {
	req, err := e.reg.NewMessage(string(md.Input().FullName()))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if err := dec(req); err != nil {
		return nil, err
	}
	return e.invoke(ctx, svc, method, md, req)
}

func (e *Engine) handleStreaming(ctx context.Context, svc, method string, md protoreflect.MethodDescriptor, stream grpc.ServerStream) error {
	req, err := e.reg.NewMessage(string(md.Input().FullName()))
	if err != nil {
		return status.Error(codes.Internal, err.Error())
	}
	if !md.IsClientStreaming() {
		if err := stream.RecvMsg(req); err != nil {
			return err
		}
	}
	resp, err := e.invoke(ctx, svc, method, md, req)
	if err != nil {
		return err
	}
	if md.IsServerStreaming() {
		return stream.SendMsg(resp)
	}
	return nil
}

// invoke is the shared core that evaluates YAML templates into proto responses.
func (e *Engine) invoke(ctx context.Context, svc, method string, md protoreflect.MethodDescriptor, req proto.Message) (proto.Message, error) {
	cfg, ok := e.store.Method(svc, method)
	if !ok {
		return nil, status.Errorf(codes.Unimplemented,
			"no mock configured for %s/%s", svc, method)
	}

	if cfg.DelayMs > 0 {
		if err := sleepCtx(ctx, time.Duration(cfg.DelayMs)*time.Millisecond); err != nil {
			return nil, err
		}
	}

	// Optional pre-match: the request JSON must contain these fields.
	if cfg.Match != nil && len(cfg.Match) > 0 {
		if err := e.checkMatch(req, cfg.Match); err != nil {
			return nil, err
		}
	}

	// Explicit gRPC error response.
	if cfg.Error != nil {
		code := codeByName(cfg.Error.Code)
		return nil, status.Error(code, cfg.Error.Message)
	}

	resp, err := e.reg.NewMessage(string(md.Output().FullName()))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	if cfg.Response != nil {
		rendered, err := e.renderTemplate(svc, method, *cfg.Response, req)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "template error: %v", err)
		}
		if err := e.unmarshal.Unmarshal([]byte(rendered), resp); err != nil {
			return nil, status.Errorf(codes.Internal, "response JSON does not match proto: %v", err)
		}
	}
	return resp, nil
}

// checkMatch verifies the request contains all fields from the match clause.
func (e *Engine) checkMatch(req proto.Message, match map[string]interface{}) error {
	raw, err := e.marshal.Marshal(req)
	if err != nil {
		return status.Errorf(codes.Internal, "marshal req: %v", err)
	}
	var got map[string]interface{}
	if err := json.Unmarshal(raw, &got); err != nil {
		return status.Errorf(codes.Internal, "decode req: %v", err)
	}
	for k, v := range match {
		if !equalish(got[k], v) {
			return status.Errorf(codes.InvalidArgument,
				"request field %q does not match mock expectation", k)
		}
	}
	return nil
}

func equalish(a, b interface{}) bool {
	switch bv := b.(type) {
	case string:
		if s, ok := a.(string); ok {
			return s == bv
		}
		return fmt.Sprint(a) == bv
	case bool:
		if ab, ok := a.(bool); ok {
			return ab == bv
		}
		return false
	case int:
		return fmt.Sprint(a) == fmt.Sprint(bv)
	case int64:
		return fmt.Sprint(a) == fmt.Sprint(bv)
	case float64:
		if af, ok := a.(float64); ok {
			return af == bv
		}
		return fmt.Sprint(a) == fmt.Sprint(bv)
	}
	return fmt.Sprint(a) == fmt.Sprint(b)
}

// renderTemplate evaluates a Go text/template with request context.
// The template is re-parsed on every call so that YAML hot-reloads take
// effect immediately without a restart.
func (e *Engine) renderTemplate(svc, method, body string, req proto.Message) (string, error) {
	key := svc + "." + method
	t, err := template.New(key).Funcs(templateFuncs()).Parse(body)
	if err != nil {
		return "", err
	}

	reqJSON, err := e.marshal.Marshal(req)
	if err != nil {
		return "", err
	}
	var reqMap map[string]interface{}
	if err := json.Unmarshal(reqJSON, &reqMap); err != nil {
		return "", err
	}

	data := map[string]interface{}{
		"Service": svc,
		"Method":  method,
		"Request": reqMap,
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// templateFuncs returns the helper functions exposed to response templates.
func templateFuncs() template.FuncMap {
	return template.FuncMap{
		"nowUnix": func() int64 { return time.Now().Unix() },
		"now":     func() string { return time.Now().Format(time.RFC3339) },
		"lower":   strings.ToLower,
		"upper":   strings.ToUpper,
	}
}

// HTTPMux returns an http.Handler that exposes POST /mock/{service}/{method}.
// {service} may be either the simple name or the fully-qualified name.
func (e *Engine) HTTPMux() *httpMux {
	return &httpMux{engine: e}
}

// InvokeJSON is used by the HTTP gateway: request is JSON bytes, response is JSON bytes.
func (e *Engine) InvokeJSON(ctx context.Context, svc, method string, body []byte) ([]byte, error) {
	svcName, md, ok := e.resolveMethod(svc, method)
	if !ok {
		return nil, status.Errorf(codes.NotFound, "unknown method %s/%s", svc, method)
	}
	req, err := e.reg.NewMessage(string(md.Input().FullName()))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if len(body) > 0 {
		if err := e.unmarshal.Unmarshal(body, req); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "bad request JSON: %v", err)
		}
	}
	resp, err := e.invoke(ctx, svcName, method, md, req)
	if err != nil {
		return nil, err
	}
	out, err := e.marshal.Marshal(resp)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "marshal response: %v", err)
	}
	return out, nil
}

func (e *Engine) resolveMethod(svc, method string) (string, protoreflect.MethodDescriptor, bool) {
	// Try exact match first (fully-qualified).
	if s, ok := e.reg.Service(svc); ok {
		md := s.Methods().ByName(protoreflect.Name(method))
		if md != nil {
			return string(s.FullName()), md, true
		}
	}
	// Otherwise search by simple service name.
	for _, name := range e.reg.Services() {
		if shortName(name) == svc {
			s, _ := e.reg.Service(name)
			md := s.Methods().ByName(protoreflect.Name(method))
			if md != nil {
				return name, md, true
			}
		}
	}
	return "", nil, false
}

func shortName(full string) string {
	if i := strings.LastIndex(full, "."); i >= 0 {
		return full[i+1:]
	}
	return full
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func codeByName(n string) codes.Code {
	switch strings.ToUpper(strings.TrimSpace(n)) {
	case "OK":
		return codes.OK
	case "CANCELLED", "CANCELED":
		return codes.Canceled
	case "UNKNOWN":
		return codes.Unknown
	case "INVALID_ARGUMENT":
		return codes.InvalidArgument
	case "DEADLINE_EXCEEDED":
		return codes.DeadlineExceeded
	case "NOT_FOUND":
		return codes.NotFound
	case "ALREADY_EXISTS":
		return codes.AlreadyExists
	case "PERMISSION_DENIED":
		return codes.PermissionDenied
	case "RESOURCE_EXHAUSTED":
		return codes.ResourceExhausted
	case "FAILED_PRECONDITION":
		return codes.FailedPrecondition
	case "ABORTED":
		return codes.Aborted
	case "OUT_OF_RANGE":
		return codes.OutOfRange
	case "UNIMPLEMENTED":
		return codes.Unimplemented
	case "INTERNAL":
		return codes.Internal
	case "UNAVAILABLE":
		return codes.Unavailable
	case "DATA_LOSS":
		return codes.DataLoss
	case "UNAUTHENTICATED":
		return codes.Unauthenticated
	default:
		return codes.Internal
	}
}
