package reflect

import (
	"google.golang.org/grpc/reflection"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoregistry"

	"grpcmock/internal/proto"
)

// RegisterReflection installs gRPC server reflection on srv using the file
// descriptors known to reg. It also registers every file with the global
// proto registry so that dynamic clients (e.g. grpcurl) can resolve types.
func RegisterReflection(srv reflection.GRPCServer, reg *proto.Registry) error {
	for _, fdp := range reg.FileDescriptorSet() {
		if _, err := protoregistry.GlobalFiles.FindFileByPath(fdp.GetName()); err == nil {
			continue
		}
		fd, err := protodesc.NewFile(fdp, protoregistry.GlobalFiles)
		if err != nil {
			return err
		}
		if err := protoregistry.GlobalFiles.RegisterFile(fd); err != nil {
			return err
		}
	}
	reflection.Register(srv)
	return nil
}
