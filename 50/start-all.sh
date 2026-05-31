#!/bin/bash

echo "========================================"
echo "  实时数据流异常检测平台 - 启动脚本"
echo "========================================"

echo ""
echo "[1/5] 启动基础设施 (ZooKeeper, Kafka, Redis)..."
docker-compose up -d zookeeper kafka redis

echo ""
echo "等待 Kafka 就绪..."
sleep 15

echo ""
echo "[2/5] 创建 Kafka 主题..."
docker exec kafka kafka-topics.sh --create --bootstrap-server localhost:9092 --topic metrics-input --partitions 3 --replication-factor 1
docker exec kafka kafka-topics.sh --create --bootstrap-server localhost:9092 --topic anomaly-output --partitions 3 --replication-factor 1
docker exec kafka kafka-topics.sh --create --bootstrap-server localhost:9092 --topic anomaly-alerts --partitions 3 --replication-factor 1

echo ""
echo "[3/5] 构建后端服务..."
mvn clean package -DskipTests

echo ""
echo "[4/5] 启动所有服务..."
docker-compose up -d ml-detection alert-service websocket-server frontend

echo ""
echo "[5/5] 提交 Flink 作业..."
FLINK_JOB_JAR=flink-processing/target/flink-processing-1.0.0.jar
if [ -f "$FLINK_JOB_JAR" ]; then
    docker cp $FLINK_JOB_JAR flink-jobmanager:/tmp/
    docker exec flink-jobmanager flink run /tmp/flink-processing-1.0.0.jar
else
    echo "警告: Flink 作业 JAR 不存在，请先构建: mvn -pl flink-processing package"
fi

echo ""
echo "========================================"
echo "  所有服务已启动！"
echo "========================================"
echo ""
echo "访问地址:"
echo "  - 前端监控看板: http://localhost:3000"
echo "  - Kafka UI: http://localhost:8080"
echo "  - Flink Dashboard: http://localhost:8081"
echo "  - WebSocket服务: ws://localhost:8083/ws/anomaly"
echo ""
echo "启动数据生成器:"
echo "  cd data-generator && mvn exec:java -Dexec.mainClass=com.anomaly.generator.DataGenerator"
echo ""
