.PHONY: all build run test clean deps

BINARY_NAME=thanos-downsampler
BUILD_DIR=bin

all: build

deps:
	go mod download
	go mod verify

build: deps
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd

run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

test:
	go test -v ./...

test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

clean:
	rm -rf $(BUILD_DIR)
	rm -f coverage.out

fmt:
	go fmt ./...

lint:
	golangci-lint run ./...

docker-build:
	docker build -t thanos-downsampler:latest .

docker-run:
	docker run -p 8080:8080 -v $(PWD)/config.yaml:/app/config.yaml thanos-downsampler:latest
