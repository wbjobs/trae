# Realtime Feature Store

A real-time feature store system using Redpanda (Kafka), RisingWave, and Redis with point-in-time feature lookups for model training data alignment.

## Architecture

```
User Events → Redpanda → RisingWave → Redis + PostgreSQL → gRPC Feature Service
                ↑            ↑             ↑                    ↑
          Event Producer  Stream     Consumer (Dual Write)   Real-time + Historical
                        Processing                           Lookups
```

## Components

1. **Event Producer**: Generates mock click/purchase events and sends to Redpanda
2. **Redpanda**: Kafka-compatible event streaming broker
3. **RisingWave**: Stream processing engine for real-time feature computation
4. **Redis**: Real-time feature storage with TTL-based automatic expiration
5. **PostgreSQL (TimescaleDB)**: Historical feature storage for point-in-time lookups
6. **Feature Service**: gRPC service for real-time and historical feature retrieval

## Features Computed

- `click_count_5m`: Number of clicks in the last 5 minutes (sliding window)
- `purchase_amount_1h`: Total purchase amount in the last 1 hour (sliding window)

## Key Features

### Real-time Feature Lookup
- Low-latency feature retrieval from Redis
- Batch support for multiple users

### Point-in-time Feature Lookup (Feature Time Travel)
- Query features as they existed at any historical timestamp
- Critical for ML model training data alignment
- Supports both single-user and batch queries

### Feature History Query
- Retrieve feature values over a time range
- Useful for feature analysis and monitoring

### Feature Backfill
- Generate feature snapshots at regular intervals for a time range
- Supports model training data preparation

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Go 1.21+ (for local development)
- protoc (for protobuf generation)

### Using Docker Compose

```bash
# Start all infrastructure
docker-compose up -d redpanda redis postgres risingwave

# Initialize RisingWave SQL
docker-compose exec risingwave psql -h localhost -p 4566 -f /sql/risingwave.sql

# Start all application services
docker-compose up -d producer consumer feature-service

# View logs
docker-compose logs -f producer consumer feature-service
```

### Local Development

```bash
# Generate protobuf code
make proto

# Build all binaries
make build

# Run producer locally
go run ./cmd/producer -interval 100ms

# Run consumer locally
go run ./cmd/consumer

# Run feature service locally
go run ./cmd/feature-service

# Test with client (real-time)
go run ./cmd/client -user user-0
go run ./cmd/client -batch

# Test point-in-time lookup
go run ./cmd/lookup -mode point -user user-0 -time "2024-01-15T14:00:00Z"
go run ./cmd/lookup -mode batch -batch-users 10 -time "2024-01-15T14:00:00Z"
go run ./cmd/lookup -mode history -user user-0 -feature click_count_5m
go run ./cmd/lookup -mode backfill -user user-0 -interval 3600
```

## gRPC API

### Real-time Feature Queries

#### GetFeatures

Get features for a single user.

```protobuf
rpc GetFeatures(GetFeaturesRequest) returns (GetFeaturesResponse);

message GetFeaturesRequest {
  string user_id = 1;
  repeated string feature_names = 2;
}
```

#### BatchGetFeatures

Get features for multiple users.

```protobuf
rpc BatchGetFeatures(BatchGetFeaturesRequest) returns (BatchGetFeaturesResponse);

message BatchGetFeaturesRequest {
  repeated string user_ids = 1;
  repeated string feature_names = 2;
}
```

### Point-in-time Feature Queries (for Model Training)

#### GetFeaturesAtTime

Get features as they existed at a specific historical timestamp.

```protobuf
rpc GetFeaturesAtTime(GetFeaturesAtTimeRequest) returns (GetFeaturesAtTimeResponse);

message GetFeaturesAtTimeRequest {
  string user_id = 1;
  repeated string feature_names = 2;
  int64 target_timestamp = 3;  // Unix timestamp
}

message GetFeaturesAtTimeResponse {
  repeated Feature features = 1;
  int64 target_timestamp = 2;
  int64 actual_timestamp = 3;  // Actual timestamp of the returned data
}
```

#### BatchGetFeaturesAtTime

Get point-in-time features for multiple users.

```protobuf
rpc BatchGetFeaturesAtTime(BatchGetFeaturesAtTimeRequest) returns (BatchGetFeaturesAtTimeResponse);

message BatchGetFeaturesAtTimeRequest {
  repeated string user_ids = 1;
  repeated string feature_names = 2;
  int64 target_timestamp = 3;
}
```

### Feature History Queries

#### GetFeatureHistory

Get feature values over a time range.

```protobuf
rpc GetFeatureHistory(GetFeatureHistoryRequest) returns (GetFeatureHistoryResponse);

message GetFeatureHistoryRequest {
  string user_id = 1;
  string feature_name = 2;
  int64 start_timestamp = 3;
  int64 end_timestamp = 4;
  int32 limit = 5;
}
```

### Feature Backfill

#### BackfillFeatures

Generate feature snapshots at regular intervals for a time range.

```protobuf
rpc BackfillFeatures(BackfillFeaturesRequest) returns (BackfillFeaturesResponse);

message BackfillFeaturesRequest {
  string user_id = 1;
  repeated string feature_names = 2;
  int64 start_timestamp = 3;
  int64 end_timestamp = 4;
  int64 interval_seconds = 5;
}

message BackfillFeaturesResponse {
  string status = 1;
  int32 total_points = 2;
  repeated Feature features = 3;
}
```

## Data Storage

### Redis (Real-time)

Features are stored with the following key pattern:

```
feature:{user_id}:{feature_name}
```

Value format: `{value}:{timestamp}`

Example:
```
feature:user-0:click_count_5m = "42.000000:1699999999"
feature:user-0:purchase_amount_1h = "125.500000:1699999999"
```

TTL: 10 minutes (configurable)

### PostgreSQL (Historical)

Table: `feature_history`

| Column | Type | Description |
|--------|------|-------------|
| user_id | VARCHAR(255) | User identifier |
| feature_name | VARCHAR(255) | Feature name |
| feature_value | DOUBLE PRECISION | Feature value |
| timestamp | BIGINT | Unix timestamp |
| created_at | TIMESTAMP WITH TIME ZONE | Record creation time |

Indexes:
- `(user_id, feature_name, timestamp DESC)` for point-in-time lookups
- `(timestamp DESC)` for time-range queries
- `(user_id, timestamp DESC)` for user history

Retention: 30 days (configurable)

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| REDPANDA_BROKERS | localhost:9092 | Redpanda/Kafka brokers |
| REDIS_ADDR | localhost:6379 | Redis address |
| REDIS_PASSWORD | (empty) | Redis password |
| REDIS_DB | 0 | Redis database number |
| POSTGRES_HOST | localhost | PostgreSQL host |
| POSTGRES_PORT | 5432 | PostgreSQL port |
| POSTGRES_USER | postgres | PostgreSQL user |
| POSTGRES_PASSWORD | postgres | PostgreSQL password |
| POSTGRES_DB | feature_store | PostgreSQL database |
| GRPC_PORT | :50051 | gRPC service port |
| HISTORY_RETENTION | 30 days | Historical data retention |

## Testing

### Real-time Queries

```bash
# Start all services
docker-compose up -d

# Wait for data to flow (~30 seconds)

# Query features for a single user
grpcurl -plaintext -d '{"user_id": "user-0", "feature_names": ["click_count_5m", "purchase_amount_1h"]}' \
  localhost:50051 featurestore.FeatureService/GetFeatures

# Query features for multiple users
grpcurl -plaintext -d '{"user_ids": ["user-0", "user-1", "user-2"], "feature_names": ["click_count_5m"]}' \
  localhost:50051 featurestore.FeatureService/BatchGetFeatures
```

### Point-in-time Queries (Model Training)

```bash
# Query features as they existed at a specific time
grpcurl -plaintext -d '{
  "user_id": "user-0",
  "feature_names": ["click_count_5m", "purchase_amount_1h"],
  "target_timestamp": 1705327200
}' \
  localhost:50051 featurestore.FeatureService/GetFeaturesAtTime

# Batch point-in-time query
grpcurl -plaintext -d '{
  "user_ids": ["user-0", "user-1", "user-2"],
  "feature_names": ["click_count_5m"],
  "target_timestamp": 1705327200
}' \
  localhost:50051 featurestore.FeatureService/BatchGetFeaturesAtTime
```

### Feature History

```bash
# Get feature history for a time range
grpcurl -plaintext -d '{
  "user_id": "user-0",
  "feature_name": "click_count_5m",
  "start_timestamp": 1705240800,
  "end_timestamp": 1705327200,
  "limit": 100
}' \
  localhost:50051 featurestore.FeatureService/GetFeatureHistory
```

### Backfill for Training Data

```bash
# Generate hourly feature snapshots for a day
grpcurl -plaintext -d '{
  "user_id": "user-0",
  "feature_names": ["click_count_5m", "purchase_amount_1h"],
  "start_timestamp": 1705240800,
  "end_timestamp": 1705327200,
  "interval_seconds": 3600
}' \
  localhost:50051 featurestore.FeatureService/BackfillFeatures
```

## Use Case: ML Model Training Data Alignment

Point-in-time lookups are critical for avoiding **data leakage** in ML training:

1. **Historical Data Collection**: Store all feature updates in PostgreSQL
2. **Training Sample Alignment**: For each training sample at time T, query features as they existed at T-1
3. **No Future Data Leakage**: Ensure model never sees data that wasn't available at prediction time

Example workflow:
```
Training sample: user clicked at T=1705327200
Query features at: T=1705327199 (1 second before)
Features returned: click_count_5m=15, purchase_amount_1h=99.99
These are the features the model would have seen at prediction time
```

## Project Structure

```
├── cmd/
│   ├── producer/          # Event producer
│   ├── consumer/          # Feature consumer (dual write to Redis + PostgreSQL)
│   ├── feature-service/   # gRPC feature service
│   ├── client/            # Real-time test client
│   └── lookup/            # Point-in-time lookup test client
├── internal/
│   ├── config/            # Configuration
│   ├── producer/          # Producer logic
│   ├── consumer/          # Consumer logic
│   ├── redisclient/       # Redis client wrapper
│   ├── historystore/      # PostgreSQL historical storage
│   └── service/           # gRPC service implementation
├── proto/                 # Protobuf definitions
├── sql/                   # RisingWave SQL
├── config/                # Service configs
└── docker-compose.yml     # Docker compose
```

## License

MIT
