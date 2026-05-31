#!/bin/bash

set -e

echo "=============================================="
echo "  实时舆情监控系统 - 启动脚本"
echo "=============================================="
echo ""

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "错误: 请先安装 Docker"
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo "错误: 请先安装 Docker Compose"
        exit 1
    fi
}

start_all() {
    echo "[1/4] 启动 Zookeeper 和 Kafka..."
    docker compose up -d zookeeper kafka

    echo ""
    echo "[2/4] 等待 Kafka 就绪..."
    sleep 15

    echo ""
    echo "[3/4] 启动 Druid 集群..."
    docker compose up -d druid-coordinator druid-overlord druid-broker druid-router druid-historical druid-middleManager

    echo ""
    echo "[4/4] 启动监控应用..."
    docker compose up -d sentiment-app

    echo ""
    echo "=============================================="
    echo "  系统启动完成！"
    echo "=============================================="
    echo ""
    echo "服务地址:"
    echo "  监控面板:     http://localhost:8080"
    echo "  Kafka UI:     http://localhost:8081"
    echo "  Druid 控制台: http://localhost:8888"
    echo "  Druid Broker: http://localhost:8088"
    echo ""
    echo "API 端点:"
    echo "  GET  /api/dashboard?window=5m    仪表盘数据"
    echo "  GET  /api/sentiment/trend        情感趋势"
    echo "  GET  /api/entities/top           热门实体"
    echo "  GET  /api/geo/distribution       地理分布"
    echo "  POST /api/analyze                分析文本"
    echo ""
    echo "使用 'docker compose logs -f sentiment-app' 查看日志"
    echo "使用 'docker compose down' 停止所有服务"
}

stop_all() {
    echo "停止所有服务..."
    docker compose down
    echo "已停止"
}

status() {
    docker compose ps
}

case "${1:-start}" in
    start)
        check_docker
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        start_all
        ;;
    status)
        status
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
