#!/bin/bash

# 灰度规则热更新 502 问题测试脚本
# 用于验证修复效果：在配置更新期间是否有 502 错误

set -e

APISIX_HOST="http://localhost:9080"
API_HOST="http://localhost:3001"
TEST_DURATION=30  # 测试持续时间（秒）
REQUEST_INTERVAL=0.1  # 请求间隔（秒）

echo "=========================================="
echo "灰度路由热更新 502 问题测试"
echo "=========================================="
echo ""

# 检查服务是否可用
check_service() {
    echo "检查服务可用性..."
    curl -s -o /dev/null -w "%{http_code}" ${APISIX_HOST}/health
    echo ""
    curl -s -o /dev/null -w "%{http_code}" ${API_HOST}/api/health
    echo ""
}

# 创建测试规则
create_test_rule() {
    echo "创建测试规则..."
    RULE_ID="test-$(date +%s)"

    curl -s -X POST ${API_HOST}/api/rules \
        -H "Content-Type: application/json" \
        -d '{
            "name": "热更新测试规则",
            "description": "用于热更新测试的临时规则",
            "match": {
                "header": "x-version",
                "value": "v2",
                "percentage": 50,
                "hash_key": "test-key"
            },
            "upstream": {
                "type": "v2",
                "nodes": [
                    {"host": "backend-v2", "port": 80, "weight": 1}
                ]
            },
            "priority": 100,
            "enabled": true
        }'

    echo ""
    echo "规则 ID: ${RULE_ID}"
    export TEST_RULE_ID=${RULE_ID}
}

# 并发测试 - 持续发送请求
concurrent_test() {
    echo ""
    echo "=========================================="
    echo "开始并发测试（${TEST_DURATION} 秒）"
    echo "=========================================="
    echo ""

    local total_requests=0
    local success_count=0
    local error_502_count=0
    local error_other_count=0
    local start_time=$(date +%s)
    local end_time=$((start_time + TEST_DURATION))

    # 后台进程：频繁更新规则
    (
        while [ $(date +%s) -lt $end_time ]; do
            local priority=$((RANDOM % 1000))
            curl -s -X PUT ${API_HOST}/api/rules/${TEST_RULE_ID} \
                -H "Content-Type: application/json" \
                -d "{\"priority\": ${priority}}" > /dev/null 2>&1
            sleep 0.5
        done
        echo "后台更新进程完成"
    ) &
    local UPDATER_PID=$!

    # 主进程：发送测试请求
    echo "发送请求中... (每 ${REQUEST_INTERVAL} 秒一次)"

    while [ $(date +%s) -lt $end_time ]; do
        local response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "x-version: v2" \
            -H "x-user-id: user-${RANDOM}" \
            ${APISIX_HOST}/api 2>/dev/null || echo "000")

        total_requests=$((total_requests + 1))

        case $response in
            200)
                success_count=$((success_count + 1))
                ;;
            502)
                error_502_count=$((error_502_count + 1))
                echo "[$(date '+%H:%M:%S')] 发现 502 错误！"
                ;;
            000)
                echo "[$(date '+%H:%M:%S')] 连接失败"
                error_other_count=$((error_other_count + 1))
                ;;
            *)
                error_other_count=$((error_other_count + 1))
                echo "[$(date '+%H:%M:%S')] HTTP ${response}"
                ;;
        esac

        sleep ${REQUEST_INTERVAL}
    done

    # 等待后台进程结束
    wait ${UPDATER_PID} 2>/dev/null || true

    # 输出测试结果
    echo ""
    echo "=========================================="
    echo "测试结果"
    echo "=========================================="
    echo "总请求数:       ${total_requests}"
    echo "成功 (200):     ${success_count} ($(echo "scale=2; ${success_count}*100/${total_requests}" | bc)%)"
    echo "502 错误:       ${error_502_count} ($(echo "scale=2; ${error_502_count}*100/${total_requests}" | bc)%)"
    echo "其他错误:       ${error_other_count} ($(echo "scale=2; ${error_other_count}*100/${total_requests}" | bc)%)"
    echo ""

    if [ ${error_502_count} -eq 0 ]; then
        echo "✅ 测试通过：热更新期间没有 502 错误"
        return 0
    else
        echo "❌ 测试失败：热更新期间出现 ${error_502_count} 次 502 错误"
        return 1
    fi
}

# 验证响应头
verify_headers() {
    echo ""
    echo "=========================================="
    echo "验证响应头"
    echo "=========================================="
    echo ""

    local response=$(curl -s -I \
        -H "x-version: v2" \
        -H "x-user-id: test-user-123" \
        ${APISIX_HOST}/api 2>&1)

    echo "响应头:"
    echo "${response}"
    echo ""

    # 检查关键响应头
    if echo "${response}" | grep -q "x-gray-route:"; then
        echo "✅ x-gray-route 存在"
    else
        echo "❌ x-gray-route 缺失"
    fi

    if echo "${response}" | grep -q "x-gray-config-version:"; then
        echo "✅ x-gray-config-version 存在"
    else
        echo "❌ x-gray-config-version 缺失"
    fi

    if echo "${response}" | grep -q "x-gray-routing-version: 2.0"; then
        echo "✅ x-gray-routing-version: 2.0 (修复版本)"
    else
        echo "❌ x-gray-routing-version 不正确"
    fi
}

# 清理测试数据
cleanup() {
    echo ""
    echo "=========================================="
    echo "清理测试数据"
    echo "=========================================="
    echo ""

    if [ -n "${TEST_RULE_ID}" ]; then
        curl -s -X DELETE ${API_HOST}/api/rules/${TEST_RULE_ID} > /dev/null
        echo "已删除测试规则: ${TEST_RULE_ID}"
    fi
}

# 主流程
main() {
    check_service
    create_test_rule

    # 等待规则生效
    echo "等待 3 秒让规则生效..."
    sleep 3

    verify_headers
    concurrent_test
    local TEST_RESULT=$?

    cleanup

    echo ""
    if [ ${TEST_RESULT} -eq 0 ]; then
        echo "🎉 所有测试通过！热更新 502 问题已修复。"
    else
        echo "⚠️  测试未通过，请检查修复是否正确应用。"
    fi

    exit ${TEST_RESULT}
}

# 捕获退出信号进行清理
trap cleanup EXIT

# 运行主流程
main
