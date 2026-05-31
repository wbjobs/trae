.PHONY: all build docker-build deploy undeploy

OPERATOR_IMAGE ?= database-backup-operator:latest
WEB_IMAGE ?= database-backup-web:latest

all: build

build:
	cd operator && go build -o bin/manager ./cmd/main.go

docker-build:
	docker build -t $(OPERATOR_IMAGE) ./operator
	docker build -t $(WEB_IMAGE) ./web

docker-push:
	docker push $(OPERATOR_IMAGE)
	docker push $(WEB_IMAGE)

deploy-crd:
	kubectl apply -f deploy/crd.yaml

deploy-rbac:
	kubectl apply -f deploy/rbac.yaml

deploy-minio:
	kubectl apply -f deploy/minio.yaml

deploy-operator:
	kubectl apply -f deploy/operator.yaml

deploy-web:
	kubectl apply -f deploy/web.yaml

deploy: deploy-crd deploy-rbac deploy-minio
	@echo "Waiting for MinIO to be ready..."
	@sleep 5
	kubectl apply -f deploy/operator.yaml
	kubectl apply -f deploy/web.yaml

undeploy:
	kubectl delete -f deploy/web.yaml || true
	kubectl delete -f deploy/operator.yaml || true
	kubectl delete -f deploy/minio.yaml || true
	kubectl delete -f deploy/rbac.yaml || true
	kubectl delete -f deploy/crd.yaml || true

example-backup:
	kubectl apply -f deploy/example-backup.yaml

web-dev:
	cd web && npm run dev
