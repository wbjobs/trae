import asyncio
import json
import os
import time
import websockets
from dotenv import load_dotenv
from speech_recognition_service import SpeechRecognitionService

load_dotenv()

HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('PORT', 8765))

class WebSocketServer:
    def __init__(self):
        self.connected_clients = set()
        self.client_sessions = {}
        
    async def handle_client(self, websocket, path):
        client_id = id(websocket)
        print(f"新客户端连接: {client_id}")
        
        self.connected_clients.add(websocket)
        
        speech_service = SpeechRecognitionService()
        
        session = {
            'websocket': websocket,
            'speech_service': speech_service,
            'last_ping': time.time(),
            'audio_chunks_received': 0
        }
        self.client_sessions[client_id] = session
        
        def on_transcript(text, is_final):
            asyncio.create_task(self.send_transcript(websocket, text, is_final))
        
        await speech_service.start_recognition(on_transcript)
        
        try:
            async for message in websocket:
                await self.handle_message(websocket, message, session)
                
        except websockets.exceptions.ConnectionClosed:
            print(f"客户端断开连接: {client_id}")
        except Exception as e:
            print(f"客户端错误 {client_id}: {e}")
        finally:
            await self.cleanup_client(websocket, client_id)
    
    async def handle_message(self, websocket, message, session):
        try:
            data = json.loads(message)
            message_type = data.get('type')
            
            if message_type == 'audio':
                session['audio_chunks_received'] += 1
                audio_data = bytes(data.get('data', []))
                sample_rate = data.get('sampleRate', 44100)
                session['speech_service'].add_audio_chunk(audio_data, sample_rate)
                
            elif message_type == 'ping':
                session['last_ping'] = time.time()
                await self.send_message(websocket, {
                    'type': 'pong',
                    'timestamp': data.get('timestamp', 0)
                })
                
            elif message_type == 'pong':
                pass
                
        except json.JSONDecodeError:
            print("收到无效JSON消息")
        except Exception as e:
            print(f"处理消息错误: {e}")
    
    async def send_transcript(self, websocket, text, is_final=False):
        await self.send_message(websocket, {
            'type': 'transcript',
            'text': text,
            'is_final': is_final,
            'timestamp': int(time.time() * 1000)
        })
    
    async def send_message(self, websocket, message):
        try:
            await websocket.send(json.dumps(message))
        except Exception as e:
            print(f"发送消息错误: {e}")
    
    async def cleanup_client(self, websocket, client_id):
        if websocket in self.connected_clients:
            self.connected_clients.remove(websocket)
        
        if client_id in self.client_sessions:
            session = self.client_sessions[client_id]
            session['speech_service'].stop()
            del self.client_sessions[client_id]
        
        print(f"客户端已清理: {client_id}")
    
    async def start(self):
        print(f"WebSocket服务器启动在 {HOST}:{PORT}")
        print(f"模拟语音识别模式: {'启用' if os.getenv('USE_MOCK_RECOGNITION', 'true').lower() == 'true' else '禁用'}")
        
        async with websockets.serve(self.handle_client, HOST, PORT):
            await asyncio.Future()

def main():
    server = WebSocketServer()
    asyncio.run(server.start())

if __name__ == '__main__':
    main()
