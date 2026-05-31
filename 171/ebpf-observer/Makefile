.PHONY: all build backend frontend generate clean run-sim run docker-build docker-run

all: build

generate:
	cd backend && go generate ./internal/ebpf/...

backend: generate
	cd backend && CGO_ENABLED=0 go build -ldflags="-s -w" -o ../dist/ebpf-observer ./cmd/observer

frontend:
	cd frontend && npm install && npm run build
	mkdir -p dist/frontend
	cp -r frontend/dist/* dist/frontend/

build: backend frontend

run-sim: build
	./dist/ebpf-observer --simulate --addr :8080

run: build
	sudo ./dist/ebpf-observer \
		--addr :8080 \
		--openssl /usr/lib/x86_64-linux-gnu/libssl.so.3 \
		--keylog ./sslkeylog.log

run-frontend-dev:
	cd frontend && npm run dev

docker-build:
	docker build -t ebpf-observer:latest .

docker-run:
	docker run --rm -p 8080:8080 --name ebpf-observer ebpf-observer:latest

docker-run-real:
	docker run --rm \
		--privileged \
		-pid host \
		-v /sys:/sys:ro \
		-v /proc:/proc:ro \
		-v /usr/lib:/usr/lib:ro \
		-v $(PWD)/sslkeylog.log:/sslkeylog.log \
		-p 8080:8080 \
		--name ebpf-observer \
		ebpf-observer:latest \
		--addr :8080 \
		--openssl /usr/lib/x86_64-linux-gnu/libssl.so.3 \
		--keylog /sslkeylog.log

clean:
	rm -rf dist/
	rm -f backend/internal/ebpf/bpf_*.go
	rm -f backend/internal/ebpf/bpf_*.o
	rm -f sslkeylog.log
