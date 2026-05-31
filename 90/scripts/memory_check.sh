#!/bin/bash
mem_total=$(free -m | awk '/Mem:/ {print $2}')
mem_used=$(free -m | awk '/Mem:/ {print $3}')
mem_usage=$((mem_used * 100 / mem_total))

echo "内存使用率: ${mem_usage}%"

if [ $mem_usage -gt 80 ]; then
    echo "MEMORY_HIGH:${mem_usage}%"
fi

swap_usage=$(free | awk '/Swap:/ {if($2 > 0) print $3*100/$2; else print 0}')
swap_usage_int=${swap_usage%.*}
if [ $swap_usage_int -gt 50 ]; then
    echo "SWAP_HIGH:${swap_usage_int}%"
fi
