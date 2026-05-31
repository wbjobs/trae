import os
import asyncio
import numpy as np
from typing import Optional, Callable
from dotenv import load_dotenv

load_dotenv()

USE_MOCK = os.getenv('USE_MOCK_RECOGNITION', 'true').lower() == 'true'

if not USE_MOCK:
    try:
        from aip import AipSpeech
        BAIDU_APP_ID = os.getenv('BAIDU_APP_ID')
        BAIDU_API_KEY = os.getenv('BAIDU_API_KEY')
        BAIDU_SECRET_KEY = os.getenv('BAIDU_SECRET_KEY')
        
        if BAIDU_APP_ID and BAIDU_API_KEY and BAIDU_SECRET_KEY:
            client = AipSpeech(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY)
        else:
            print("警告: 百度语音识别API配置不完整，将使用模拟模式")
            USE_MOCK = True
    except ImportError:
        print("警告: 未安装baidu-aip库，将使用模拟模式")
        USE_MOCK = True


class SpeechRecognitionService:
    def __init__(self):
        self.use_mock = USE_MOCK
        self.audio_buffer = []
        self.sample_rate = int(os.getenv('SAMPLE_RATE', 16000))
        self.is_recording = False
        self.mock_phrases = [
            "你好，这是语音识别测试",
            "今天天气真好",
            "欢迎使用实时字幕系统",
            "人脸模糊功能已启用",
            "WebSocket连接正常",
            "正在处理视频流",
            "检测到人脸进行像素化处理",
            "语音转文字中",
            "感谢使用本系统",
            "实时字幕渲染中"
        ]
        self.mock_index = 0
        
    async def start_recognition(self, on_result: Callable[[str, bool], None]):
        self.is_recording = True
        self.on_result = on_result
        
        if self.use_mock:
            asyncio.create_task(self._mock_recognition_loop())
    
    def add_audio_chunk(self, audio_data: bytes, sample_rate: int = 44100):
        self.audio_buffer.append(audio_data)
        
        if len(self.audio_buffer) > 50:
            self.audio_buffer.pop(0)
    
    async def process_audio(self):
        if self.use_mock or not self.audio_buffer:
            return
        
        combined_audio = b''.join(self.audio_buffer)
        self.audio_buffer = []
        
        try:
            result = await asyncio.to_thread(
                self._baidu_recognize,
                combined_audio
            )
            
            if result and self.on_result:
                self.on_result(result, True)
                
        except Exception as e:
            print(f"语音识别错误: {e}")
    
    def _baidu_recognize(self, audio_data: bytes) -> Optional[str]:
        try:
            result = client.asr(
                audio_data,
                'pcm',
                self.sample_rate,
                {
                    'dev_pid': 1537,
                }
            )
            
            if result.get('err_no') == 0:
                return result['result'][0]
            return None
            
        except Exception as e:
            print(f"百度语音识别错误: {e}")
            return None
    
    async def _mock_recognition_loop(self):
        while self.is_recording:
            await asyncio.sleep(3)
            
            if self.on_result and self.is_recording:
                phrase = self.mock_phrases[self.mock_index]
                self.mock_index = (self.mock_index + 1) % len(self.mock_phrases)
                
                self.on_result(phrase, True)
    
    def stop(self):
        self.is_recording = False
        self.audio_buffer = []
        self.mock_index = 0
