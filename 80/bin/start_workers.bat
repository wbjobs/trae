@echo off
echo Starting MapReduce workers...

start "Worker 1" cmd /k "cd /d %~dp0.. && python -m mr.cli worker --worker-id worker1 --port 18861"
timeout /t 2 /nobreak >nul
start "Worker 2" cmd /k "cd /d %~dp0.. && python -m mr.cli worker --worker-id worker2 --port 18862"
timeout /t 2 /nobreak >nul
start "Worker 3" cmd /k "cd /d %~dp0.. && python -m mr.cli worker --worker-id worker3 --port 18863"

echo All workers started!
echo Run: mr submit examples/wordcount/job.yaml
