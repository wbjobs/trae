#!/bin/bash
echo "=== 自定义巡检脚本示例 ==="
echo "主机名: $(hostname)"
echo "系统负载: $(uptime | awk -F'load average:' '{print $2}')"
echo "内存使用: $(free -h | awk '/Mem:/ {print $3 "/" $2}')"
echo "连接数: $(netstat -an | grep ESTABLISHED | wc -l)"

load_avg=$(cat /proc/loadavg | awk '{print $1}')
threshold=2.0
if (( $(echo "$load_avg > $threshold" | bc -l) )); then
    echo "WARN: 系统负载过高: $load_avg"
fi
