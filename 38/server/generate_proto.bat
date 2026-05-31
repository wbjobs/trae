@echo off
echo Generating Go gRPC code...

protoc --go_out=. --go_opt=paths=source_relative ^
    --go-grpc_out=. --go-grpc_opt=paths=source_relative ^
    ../proto/access.proto

echo Done!
