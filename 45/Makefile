.PHONY: all build proto tidy clean run

all: build

proto:
	protoc --go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		proto/worker.proto

tidy:
	go mod tidy

build:
	go build -o bin/worker ./cmd/worker

run: build
	./bin/worker --listen :50051 --scheduler localhost:50050

clean:
	rm -rf bin/
