import asyncio
import multiprocessing
import time
import websocket_server
import http_server
import uvicorn

def run_http_server():
    uvicorn.run(http_server.app, host="0.0.0.0", port=8000)

def run_websocket_server():
    asyncio.run(websocket_server.main())

if __name__ == "__main__":
    print("=" * 60)
    print("实时人脸模糊与语音字幕系统")
    print("=" * 60)
    print()
    
    http_process = multiprocessing.Process(target=run_http_server)
    ws_process = multiprocessing.Process(target=run_websocket_server)
    
    try:
        print("正在启动服务器...")
        print()
        
        http_process.start()
        time.sleep(1)
        ws_process.start()
        
        print("HTTP服务器已启动: http://localhost:8000
        print("WebSocket服务器已启动: ws://localhost:8765
        print()
        print("请在浏览器中打开 http://localhost:8000 访问系统
        print()
        print("按 Ctrl+C 停止服务器
        print("=" * 60)
        
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n正在停止服务器...")
        http_process.terminate()
        ws_process.terminate()
        http_process.join()
        ws_process.join()
        print("服务器已停止")
