.PHONY: test clean docker-build

test:
	go test ./... -v -cover

clean:
	rm -rf bin/

docker-build:
	docker build -t database-backup-operator:latest .

run:
	go run ./cmd/main.go \
		--metrics-bind-address=:8080 \
		--health-probe-bind-address=:8081 \
		--api-bind-address=:8082 \
		--backup-dir=/tmp/backups
