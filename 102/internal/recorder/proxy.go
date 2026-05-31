package recorder

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	"grpcmock/internal/proto"
)

// Proxy wraps a gRPC client connection to a real backend and registers
// dynamic service handlers on the proxy server that forward every call
// to the backend while recording request-response pairs.
type Proxy struct {
	reg      *proto.Registry
	rec      *Recorder
	backend  *grpc.ClientConn
	marshal  protojson.MarshalOptions
}

// NewProxy dials backendAddr and returns a Proxy ready to forward calls.
func NewProxy(reg *proto.Registry, rec *Recorder, backendAddr string) (*Proxy, error) {
	conn, err := grpc.NewClient(backendAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("dial backend %s: %w", backendAddr, err)
	}
	return &Proxy{
		reg:     reg,
		rec:     rec,
		backend: conn,
		marshal: protojson.MarshalOptions{UseProtoNames: true},
	}, nil
}

// Close releases the backend connection.
func (p *Proxy) Close() error {
	return p.backend.Close()
}

// Register installs dynamic proxy handlers for every known service onto srv.
func (p *Proxy) Register(srv grpc.ServiceRegistrar) {
	for _, svcName := range p.reg.Services() {
		svc, _ := p.reg.Service(svcName)
		sd := p.buildServiceDesc(svc)
		srv.RegisterService(sd, p)
	}
}

func (p *Proxy) buildServiceDesc(svc protoreflect.ServiceDescriptor) *grpc.ServiceDesc {
	methods := svc.Methods()
	sd := &grpc.ServiceDesc{
		ServiceName: string(svc.FullName()),
		HandlerType: (*interface{})(nil),
		Streams:     []grpc.StreamDesc{},
	}
	for i := 0; i < methods.Len(); i++ {
		m := methods.Get(i)
		handler := p.makeHandler(svc, m)
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

func (p *Proxy) makeHandler(svc protoreflect.ServiceDescriptor, m protoreflect.MethodDescriptor) interface{} {
	svcName := string(svc.FullName())
	methodName := string(m.Name())
	fullMethod := "/" + svcName + "/" + methodName

	if !m.IsServerStreaming() && !m.IsClientStreaming() {
		return func(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
			return p.handleUnary(ctx, svcName, methodName, fullMethod, m, dec)
		}
	}
	return func(srv interface{}, stream grpc.ServerStream) error {
		return p.handleStreaming(stream.Context(), svcName, methodName, fullMethod, m, stream)
	}
}

func (p *Proxy) handleUnary(ctx context.Context, svc, method, fullMethod string, md protoreflect.MethodDescriptor, dec func(interface{}) error) (interface{}, error) {
	req, err := p.reg.NewMessage(string(md.Input().FullName()))
	if err != nil {
		return nil, err
	}
	if err := dec(req); err != nil {
		return nil, err
	}

	start := time.Now()

	// Serialize request to wire format for forwarding.
	reqBytes, err := proto.Marshal(req)
	if err != nil {
		return nil, err
	}

	// Forward to backend using raw codec so we don't need compiled protos.
	reqMsg := rawMsg(reqBytes)
	var respRaw rawMsg
	var headerMD, trailerMD metadata.MD
	err = p.backend.Invoke(ctx, fullMethod, &reqMsg, &respRaw,
		grpc.ForceCodec(&rawCodec{}),
		grpc.Header(&headerMD),
		grpc.Trailer(&trailerMD),
	)
	elapsed := time.Since(start)

	// Deserialize response back into a proto message for recording.
	resp, _ := p.reg.NewMessage(string(md.Output().FullName()))
	if err == nil && resp != nil {
		if err2 := proto.Unmarshal(respRaw, resp); err2 == nil {
			p.record(svc, method, req, resp, elapsed)
		}
	}
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (p *Proxy) handleStreaming(ctx context.Context, svc, method, fullMethod string, md protoreflect.MethodDescriptor, stream grpc.ServerStream) error {
	req, err := p.reg.NewMessage(string(md.Input().FullName()))
	if err != nil {
		return err
	}
	if !md.IsClientStreaming() {
		if err := stream.RecvMsg(req); err != nil {
			return err
		}
	}

	start := time.Now()
	reqBytes, _ := proto.Marshal(req)
	reqMsg := rawMsg(reqBytes)

	var respRaw rawMsg
	err = p.backend.Invoke(ctx, fullMethod, &reqMsg, &respRaw,
		grpc.ForceCodec(&rawCodec{}))
	elapsed := time.Since(start)

	resp, _ := p.reg.NewMessage(string(md.Output().FullName()))
	if err == nil && resp != nil {
		if err2 := proto.Unmarshal(respRaw, resp); err2 == nil {
			p.record(svc, method, req, resp, elapsed)
		}
	}
	if err != nil {
		return err
	}
	if md.IsServerStreaming() {
		return stream.SendMsg(resp)
	}
	return nil
}

func (p *Proxy) record(svc, method string, req, resp proto.Message, elapsed time.Duration) {
	reqJSON, _ := p.marshal.Marshal(req)
	respJSON, _ := p.marshal.Marshal(resp)
	p.rec.Capture(svc, method, reqJSON, respJSON, int(elapsed.Milliseconds()))
}

// --- raw codec: forwards wire-format bytes without interpreting them ---

type rawMsg []byte

func (r *rawMsg) Reset()         { *r = (*r)[:0] }
func (r *rawMsg) String() string { return string(*r) }
func (r *rawMsg) ProtoMessage()  {}

type rawCodec struct{}

func (rawCodec) Marshal(v interface{}) ([]byte, error) {
	if m, ok := v.(*rawMsg); ok {
		return []byte(*m), nil
	}
	return nil, fmt.Errorf("rawCodec.Marshal: expected *rawMsg, got %T", v)
}

func (rawCodec) Unmarshal(data []byte, v interface{}) error {
	if m, ok := v.(*rawMsg); ok {
		*m = append((*m)[:0], data...)
		return nil
	}
	return fmt.Errorf("rawCodec.Unmarshal: expected *rawMsg, got %T", v)
}

func (rawCodec) Name() string { return "raw" }
