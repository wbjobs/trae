import multiprocessing
import subprocess
import sys
import os


def run_main():
    subprocess.run([sys.executable, "main.py"], cwd=os.path.dirname(__file__))


def run_worker():
    subprocess.run([sys.executable, "worker.py"], cwd=os.path.dirname(__file__))


def main():
    print("=" * 60)
    print("  股票异常检测系统 - 启动脚本")
    print("=" * 60)
    print()
    
    main_proc = multiprocessing.Process(target=run_main, name="MainServer")
    worker_proc = multiprocessing.Process(target=run_worker, name="AnomalyWorker")
    
    main_proc.daemon = True
    worker_proc.daemon = True
    
    print("[Launcher] 启动主服务 (FastAPI + 数据生成器)...")
    main_proc.start()
    
    import time
    time.sleep(2)
    
    print("[Launcher] 启动异常检测Worker...")
    worker_proc.start()
    
    print()
    print("[Launcher] 所有服务已启动!")
    print("  - API:     http://localhost:8000")
    print("  - Docs:    http://localhost:8000/docs")
    print("  - WS:      ws://localhost:8000/ws/stock")
    print()
    print("[Launcher] 按 Ctrl+C 停止所有服务")
    print("=" * 60)
    
    try:
        while True:
            time.sleep(1)
            if not main_proc.is_alive():
                print("[Launcher] 主服务已退出")
                break
            if not worker_proc.is_alive():
                print("[Launcher] Worker已退出")
                break
    except KeyboardInterrupt:
        print("\n[Launcher] 正在停止所有服务...")
    finally:
        if main_proc.is_alive():
            main_proc.terminate()
            main_proc.join(timeout=3)
        if worker_proc.is_alive():
            worker_proc.terminate()
            worker_proc.join(timeout=3)
        print("[Launcher] 所有服务已停止")


if __name__ == "__main__":
    main()
