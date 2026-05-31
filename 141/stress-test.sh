#!/bin/bash

BASE_URL="${1:-http://localhost:8080}"
ITEM_COUNT="${2:-1000}"

echo "=========================================="
echo "Bulk Operation Stress Test"
echo "Base URL: $BASE_URL"
echo "Item count: $ITEM_COUNT"
echo "=========================================="

echo ""
echo "=== Step 1: Bulk Set Test ==="
ITEMS_JSON="{"
for i in $(seq 1 $ITEM_COUNT); do
  if [ $i -gt 1 ]; then
    ITEMS_JSON="${ITEMS_JSON},"
  fi
  ITEMS_JSON="${ITEMS_JSON}\"key_${i}\":\"value_${i}\""
done
ITEMS_JSON="${ITEMS_JSON}}"

START_TIME=$(date +%s%N)
curl -s -X POST "$BASE_URL/api/v1/state/bulk_set" \
  -H "Content-Type: application/json" \
  -d "{\"items\":$ITEMS_JSON}"
END_TIME=$(date +%s%N)
ELAPSED=$((($END_TIME - $START_TIME) / 1000000))
echo "Bulk Set $ITEM_COUNT items completed in ${ELAPSED}ms"

echo ""
echo "=== Step 2: Bulk Get Test ==="
KEYS_JSON="["
for i in $(seq 1 $ITEM_COUNT); do
  if [ $i -gt 1 ]; then
    KEYS_JSON="${KEYS_JSON},"
  fi
  KEYS_JSON="${KEYS_JSON}\"key_${i}\""
done
KEYS_JSON="${KEYS_JSON}]"

START_TIME=$(date +%s%N)
curl -s -X POST "$BASE_URL/api/v1/state/bulk_get" \
  -H "Content-Type: application/json" \
  -d "{\"keys\":$KEYS_JSON}"
END_TIME=$(date +%s%N)
ELAPSED=$((($END_TIME - $START_TIME) / 1000000))
echo "Bulk Get $ITEM_COUNT items completed in ${ELAPSED}ms"

echo ""
echo "=== Step 3: Metrics Check ==="
curl -s "$BASE_URL/api/v1/metrics" | python3 -m json.tool

echo ""
echo "=== Step 4: Bulk Delete Cleanup ==="
START_TIME=$(date +%s%N)
curl -s -X POST "$BASE_URL/api/v1/state/bulk_delete" \
  -H "Content-Type: application/json" \
  -d "{\"keys\":$KEYS_JSON}"
END_TIME=$(date +%s%N)
ELAPSED=$((($END_TIME - $START_TIME) / 1000000))
echo "Bulk Delete $ITEM_COUNT items completed in ${ELAPSED}ms"

echo ""
echo "=========================================="
echo "Test Complete!"
echo "=========================================="
