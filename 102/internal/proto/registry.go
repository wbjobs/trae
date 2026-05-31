package proto

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/jhump/protoreflect/desc/protoparse"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

// Registry holds parsed proto information keyed by fully-qualified names
// (e.g. "demo.Greeter", "demo.HelloRequest").
type Registry struct {
	mu            sync.RWMutex
	files         []*descriptorpb.FileDescriptorProto
	filesByName   map[string]*descriptorpb.FileDescriptorProto
	services      map[string]protoreflect.ServiceDescriptor
	messages      map[string]protoreflect.MessageDescriptor
	types         *protoregistry.Files
	reflectionSet []*descriptorpb.FileDescriptorProto
}

// NewRegistry parses every .proto file under dir (recursively) and returns
// a Registry ready to serve mock RPCs.
func NewRegistry(dir string) (*Registry, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	var protoFiles []string
	err = filepath.Walk(abs, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.HasSuffix(path, ".proto") {
			protoFiles = append(protoFiles, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk proto dir: %w", err)
	}
	if len(protoFiles) == 0 {
		return nil, fmt.Errorf("no .proto files under %s", abs)
	}

	parser := protoparse.Parser{
		ImportPaths:      []string{abs},
		InferImportPaths: true,
	}
	fds, err := parser.ParseFiles(protoFiles...)
	if err != nil {
		return nil, fmt.Errorf("parse proto files: %w", err)
	}

	r := &Registry{
		filesByName: make(map[string]*descriptorpb.FileDescriptorProto),
		services:    make(map[string]protoreflect.ServiceDescriptor),
		messages:    make(map[string]protoreflect.MessageDescriptor),
		types:       &protoregistry.Files{},
	}

	for _, fd := range fds {
		fdp := fd.AsFileDescriptorProto()
		r.files = append(r.files, fdp)
		r.filesByName[fd.GetName()] = fdp
	}

	// Register files with a protoregistry.Files to get protoreflect descriptors.
	fileProtos := make([]*descriptorpb.FileDescriptorProto, len(r.files))
	copy(fileProtos, r.files)
	files, err := protodesc.NewFiles(&descriptorpb.FileDescriptorSet{File: fileProtos})
	if err != nil {
		return nil, fmt.Errorf("build proto registry: %w", err)
	}
	r.types = files
	r.reflectionSet = fileProtos

	files.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		svcs := fd.Services()
		for i := 0; i < svcs.Len(); i++ {
			svc := svcs.Get(i)
			r.services[string(svc.FullName())] = svc
		}
		msgs := fd.Messages()
		for i := 0; i < msgs.Len(); i++ {
			r.registerMessages(msgs.Get(i))
		}
		return true
	})

	// Register every message and enum type into the global type registry
	// so that protojson can instantiate nested messages during unmarshal.
	if err := r.RegisterAllTypes(); err != nil {
		return nil, fmt.Errorf("register types: %w", err)
	}
	return r, nil
}

func (r *Registry) registerMessages(m protoreflect.MessageDescriptor) {
	r.messages[string(m.FullName())] = m
	nested := m.Messages()
	for i := 0; i < nested.Len(); i++ {
		r.registerMessages(nested.Get(i))
	}
}

// Services returns the fully-qualified names of all registered services.
func (r *Registry) Services() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.services))
	for n := range r.services {
		out = append(out, n)
	}
	return out
}

// Service returns the service descriptor, if known.
func (r *Registry) Service(fullName string) (protoreflect.ServiceDescriptor, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.services[fullName]
	return s, ok
}

// Message returns the message descriptor, if known.
func (r *Registry) Message(fullName string) (protoreflect.MessageDescriptor, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.messages[fullName]
	return m, ok
}

// NewMessage creates a new empty dynamic message for the given fully-qualified name.
func (r *Registry) NewMessage(fullName string) (proto.Message, error) {
	md, ok := r.Message(fullName)
	if !ok {
		return nil, fmt.Errorf("unknown message %q", fullName)
	}
	return dynamicpb.NewMessage(md), nil
}

// FileDescriptorSet returns all parsed file descriptors (used for gRPC reflection).
func (r *Registry) FileDescriptorSet() []*descriptorpb.FileDescriptorProto {
	return r.reflectionSet
}

// RegisterAllTypes recursively registers every message and enum type found in
// the registry into protoregistry.GlobalTypes.
//
// This is required so that protojson.Unmarshal can instantiate nested messages
// (including map values and repeated elements) when decoding into a
// dynamicpb.Message. Without this, any field whose type is a message will
// fail with a "not found" error during JSON parsing.
func (r *Registry) RegisterAllTypes() error {
	var firstErr error
	for _, md := range r.messages {
		mt := &dynamicMessageType{md: md}
		if err := protoregistry.GlobalTypes.RegisterMessage(mt); err != nil {
			if firstErr == nil && !isAlreadyRegistered(err) {
				firstErr = err
			}
		}
		// Register nested enums too.
		enums := md.Enums()
		for i := 0; i < enums.Len(); i++ {
			et := &dynamicEnumType{ed: enums.Get(i)}
			if err := protoregistry.GlobalTypes.RegisterEnum(et); err != nil {
				if firstErr == nil && !isAlreadyRegistered(err) {
					firstErr = err
				}
			}
		}
	}
	// Also register top-level enums from every file.
	r.types.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		enums := fd.Enums()
		for i := 0; i < enums.Len(); i++ {
			et := &dynamicEnumType{ed: enums.Get(i)}
			if err := protoregistry.GlobalTypes.RegisterEnum(et); err != nil {
				if firstErr == nil && !isAlreadyRegistered(err) {
					firstErr = err
				}
			}
		}
		return true
	})
	return firstErr
}

func isAlreadyRegistered(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "already") ||
		strings.Contains(err.Error(), "conflict") ||
		strings.Contains(err.Error(), "registered")
}

// --- dynamic protoreflect.MessageType ---

type dynamicMessageType struct {
	md protoreflect.MessageDescriptor
}

func (t *dynamicMessageType) New() protoreflect.Message {
	return dynamicpb.NewMessage(t.md).ProtoReflect()
}

func (t *dynamicMessageType) Zero() protoreflect.Message {
	return dynamicpb.NewMessage(t.md).ProtoReflect()
}

func (t *dynamicMessageType) Descriptor() protoreflect.MessageDescriptor {
	return t.md
}

// --- dynamic protoreflect.EnumType ---

type dynamicEnumType struct {
	ed protoreflect.EnumDescriptor
}

func (t *dynamicEnumType) New() protoreflect.Enum {
	return &dynamicEnum{ed: t.ed}
}

func (t *dynamicEnumType) Descriptor() protoreflect.EnumDescriptor {
	return t.ed
}

// dynamicEnum is a minimal protoreflect.Enum implementation.
type dynamicEnum struct {
	ed protoreflect.EnumDescriptor
}

func (e *dynamicEnum) Descriptor() protoreflect.EnumDescriptor { return e.ed }
func (e *dynamicEnum) Type() protoreflect.EnumType             { return &dynamicEnumType{ed: e.ed} }
func (e *dynamicEnum) Number() protoreflect.EnumNumber          { return 0 }
