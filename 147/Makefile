.PHONY: all build proto up down clean

PROTO_DIR := proto
GO_OUT := proto

all: build

proto:
	protoc --go_out=$(GO_OUT) \
		--go_opt=paths=source_relative \
		--go-grpc_out=$(GO_OUT) \
		--go-grpc_opt=paths=source_relative \
		$(PROTO_DIR)/feature.proto

build-producer:
	go build -o bin/producer ./cmd/producer

build-consumer:
	go build -o bin/consumer ./cmd/consumer

build-service:
	go build -o bin/feature-service ./cmd/feature-service

build-client:
	go build -o bin/client ./cmd/client

build-lookup:
	go build -o bin/lookup ./cmd/lookup

build: build-producer build-consumer build-service build-client build-lookup

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

init-risingwave:
	docker-compose exec risingwave psql -h localhost -p 4566 -f /sql/risingwave.sql

test-client:
	go run ./cmd/client -user user-0

test-batch:
	go run ./cmd/client -batch

test-point-lookup:
	go run ./cmd/lookup -mode point -user user-0

test-batch-lookup:
	go run ./cmd/lookup -mode batch -batch-users 5

test-history:
	go run ./cmd/lookup -mode history -user user-0 -feature click_count_5m

test-backfill:
	go run ./cmd/lookup -mode backfill -user user-0 -interval 3600

clean:
	docker-compose down -v
	rm -rf bin/
