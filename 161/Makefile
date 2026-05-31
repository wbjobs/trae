BINARY=dapr-wasm-middleware
WASM_DIR=wasm/filters
WEB_DIR=web

.PHONY: all build build-wasm build-web run clean dev

all: build

build:
	go build -o $(BINARY).exe .

build-wasm:
	@echo "Building Wasm filters (requires TinyGo)..."
	@if command -v tinygo >/dev/null 2>&1; then \
		cd $(WASM_DIR)/jwt && tinygo build -o ../../jwt.wasm -target wasm -no-debug jwt.go; \
		cd ../rewrite && tinygo build -o ../../rewrite.wasm -target wasm -no-debug rewrite.go; \
		cd ../logger && tinygo build -o ../../logger.wasm -target wasm -no-debug logger.go; \
		echo "Wasm filters built."; \
	else \
		echo "TinyGo not found. Install TinyGo to build Wasm filters."; \
	fi

build-web:
	@echo "Building React frontend..."
	@cd $(WEB_DIR) && npm install && npm run build

run: build
	./$(BINARY).exe -c config.json -w ./wasm -g 50051 -p 8080

dev:
	@echo "Starting in dev mode..."
	go run . -c config.json -w ./wasm -g 50051 -p 8080

clean:
	rm -f $(BINARY).exe
	rm -f wasm/*.wasm
	rm -rf web/dist

test:
	go test ./pkg/... -v -count=1

vet:
	go vet ./...
