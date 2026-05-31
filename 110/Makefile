TARGET := http-mirror
PKG := http-mirror
CMD_DIR := ./cmd/http-mirror
BPF_DIR := ./bpf
EBPF_GEN_DIR := ./internal/ebpf

.PHONY: all build clean generate-bpf run

all: build

generate-bpf:
	@echo "Generating eBPF code..."
	cd $(EBPF_GEN_DIR) && go generate

build: generate-bpf
	@echo "Building $(TARGET)..."
	go build -o $(TARGET) $(CMD_DIR)

run: build
	@echo "Running $(TARGET)..."
	sudo ./$(TARGET)

clean:
	@echo "Cleaning..."
	rm -f $(TARGET)
	rm -f $(EBPF_GEN_DIR)/bpf_bpf*.go
	rm -f $(EBPF_GEN_DIR)/bpf_bpf*.o

docker-build:
	@echo "Building with Docker..."
	docker run --rm \
		-v $(PWD):/src \
		-w /src \
		--privileged \
		golang:1.21-bookworm \
		bash -c "apt-get update && apt-get install -y clang llvm libelf-dev && make build"
