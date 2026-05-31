#!/bin/bash
echo "Starting MapReduce workers..."

cd "$(dirname "$0")/.."

python -m mr.cli worker --worker-id worker1 --port 18861 &
sleep 1
python -m mr.cli worker --worker-id worker2 --port 18862 &
sleep 1
python -m mr.cli worker --worker-id worker3 --port 18863 &

echo "All workers started!"
echo "Run: mr submit examples/wordcount/job.yaml"
