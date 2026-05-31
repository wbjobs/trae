#!/bin/bash
# 湖仓查询加速层 - 启动脚本
# 技术栈: Trino + Iceberg + MinIO

set -e

echo "=============================================="
echo "🚀 湖仓查询加速层 - 启动脚本"
echo "=============================================="
echo ""

echo "📦 启动 Docker 服务..."
docker compose up -d

echo ""
echo "⏳ 等待服务就绪..."
sleep 10

echo ""
echo "📋 检查服务状态..."
docker compose ps

echo ""
echo "✅ 服务启动完成!"
echo ""
echo "📌 服务端点:"
echo "   - MinIO Console: http://localhost:9001"
echo "   - MinIO API: http://localhost:9000"
echo "   - Trino: http://localhost:8080"
echo "   - Iceberg REST Catalog: http://localhost:8181"
echo ""
echo "🔐 默认凭证:"
echo "   - MinIO: minioadmin / minioadmin"
echo "   - Trino: admin (无密码)"
echo ""
echo "📚 使用说明:"
echo "   1. 生成示例数据: python src/generate_data.py"
echo "   2. 运行演示: python src/main.py --action demo"
echo "   3. 注册数据表: python src/main.py --action setup"
echo "   4. 执行查询: python src/main.py --action query --query 'SELECT ...'"
echo "   5. 可视化计划: python src/main.py --action visualize --query 'SELECT ...'"
echo "   6. 数据去重: python src/main.py --action deduplicate"
echo ""
echo "📖 示例查询: examples/queries.sql"
echo "=============================================="
