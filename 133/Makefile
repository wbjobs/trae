.PHONY: all build server cli clean docker-up docker-down

all: build

build: server cli

server:
	go build -o bin/wruntime-server ./cmd/server

cli:
	go build -o bin/wruntime ./cmd/wruntime

clean:
	rm -rf bin/
	rm -rf .cache/

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

example:
	GOOS=wasip1 GOARCH=wasm go build -o examples/handler.wasm ./examples/handler.go

test-invoke:
	curl -X POST http://localhost:8080/invoke/hello \
		-H "Content-Type: application/json" \
		-d '{"name":"test"}'

deploy-example:
	./bin/wruntime deploy \
		--name hello \
		--version 1.0.0 \
		--description "Hello World function" \
		--file examples/handler.wasm

install: build
	cp bin/wruntime /usr/local/bin/wruntime
