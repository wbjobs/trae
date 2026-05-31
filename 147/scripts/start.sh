#!/bin/bash

set -e

echo "========================================="
echo "  Realtime Feature Store System"
echo "========================================="

echo ""
echo "[1/5] Starting Redpanda (Kafka)..."
docker-compose up -d redpanda

echo ""
echo "[2/5] Waiting for Redpanda to be ready..."
sleep 10

echo ""
echo "[3/5] Creating Kafka topics..."
docker-compose run --rm redpanda-init

echo ""
echo "[4/5] Starting Redis and RisingWave..."
docker-compose up -d redis risingwave

echo ""
echo "[5/5] Waiting for services to be ready..."
sleep 15

echo ""
echo "Initializing RisingWave SQL..."
docker-compose run --rm risingwave-init

echo ""
echo "========================================="
echo "  Services Started!"
echo "========================================="
echo ""
echo "  Redpanda (Kafka): localhost:9092"
echo "  RisingWave:      localhost:4566"
echo "  Redis:           localhost:6379"
echo ""
echo "  To start producer:  make up producer"
echo "  To start consumer:  make up consumer"
echo "  To start service:   make up feature-service"
echo ""
echo "  To run all services: docker-compose up -d"
echo ""
