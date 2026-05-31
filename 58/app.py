import os
import io
import base64
import tempfile
import uuid
import time
import threading
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import whisper
from transformers import pipeline
import pyttsx3
from collections import deque, defaultdict

app = Flask(__name__, static_folder='templates', static_url_path='')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=120, ping_interval=30)

print("正在加载AI模型...")
whisper_model = whisper.load_model("base")
sentiment_analyzer = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")
emotion_analyzer = pipeline("text-classification", model="j-hartmann/emotion-english-distilroberta-base", return_all_scores=True)
print("模型加载完成！")

tts_engine = pyttsx3.init()
tts_lock = threading.Lock()

recent_emotions = deque(maxlen=10)
recent_text_sentiments = deque(maxlen=5)

active_sessions = {}
session_lock = threading.Lock()

user_memory = {}
user_memory_lock = threading.Lock()

CHUNK_DURATION = 5
NEGATIVE_THRESHOLD = 3
MEMORY_HISTORY_SIZE = 10

EMOTION_MAP = {
    'happy': 'positive',
    'sad': 'negative',
    'angry': 'negative',
    'fearful': 'negative',
    'disgusted': 'negative',
    'surprised': 'neutral',
    'neutral': 'neutral'
}

RESPONSE_TEMPLATES = {
    'positive': [
        "太棒了！看到你心情这么好，我也很开心！有什么有趣的事情想分享吗？",
        "你的笑容真有感染力！今天一定是美好的一天，对吗？",
        "感觉你状态很不错！我们来聊点开心的话题吧。",
        "哇，你看起来很高兴！是什么让你这么开心呢？",
        "你的积极情绪太棒了！继续保持这份好心情吧！"
    ],
    'negative': [
        "我感觉你可能有点不开心，发生什么事了吗？我在这儿陪你。",
        "别难过，一切都会好起来的。想聊聊让你心烦的事情吗？",
        "看你的表情好像不太好，需要我帮忙吗？或者只是想倾诉一下？",
        "我能感觉到你情绪不太好，记住，困难都是暂时的。",
        "心情不好的时候，记得深呼吸。有什么我能为你做的吗？"
    ],
    'neutral': [
        "你好呀！今天想聊点什么呢？",
        "很高兴见到你！有什么我可以帮助你的吗？",
        "你看起来很平静呢。今天有什么计划吗？",
        "嗨！我注意到你了，想聊点什么有趣的事情吗？",
        "你好！我随时准备好倾听，想从哪里开始呢？"
    ]
}

COMFORT_TEMPLATES = {
    'positive': [
        "太好了！看到你的心情好转，我真的很开心！要记得，无论遇到什么困难，你都有能力克服它。",
        "你的笑容就是最好的良药！继续保持这份乐观，一切都会越来越好的。",
        "看到你状态回升真让人欣慰！记住，每一个美好的日子都值得珍惜。",
        "你积极的态度真的很棒！相信自己，你可以创造更多美好的时刻。",
        "你的好心情让我也被感染了！继续这份正能量，未来可期！"
    ],
    'negative': [
        "亲爱的朋友，我能感受到你此刻的心情不太好。请记住，你不是一个人在面对这一切，我一直在这里陪着你。",
        "有时候，生活确实会给我们带来很多挑战。但请相信，黑夜再长，黎明总会到来。想和我说说是什么让你这么难过吗？",
        "我知道现在的你可能感到很无助，但请允许我给你一个温暖的拥抱。无论发生什么，你的感受都是被理解和接纳的。",
        "看到你这样，我也很心疼。你已经很努力了，不要对自己太苛刻。有时候，允许自己难过也是一种勇气。",
        "亲爱的，每个人都会有低落的时候，这很正常。不用强迫自己立刻好起来，慢慢来，我会一直在这里倾听你。"
    ],
    'neutral': [
        "你今天看起来有些不一样呢。如果有什么心事，随时可以和我说，我会认真倾听的。",
        "无论你现在是什么样的心情，我都在这里。想聊聊吗？或者只是安静地待一会儿也可以。",
        "我注意到你似乎在思考什么。如果需要有人陪伴，我随时都在。",
        "今天的你看起来很平静。有时候平静也是一种力量。想分享点什么吗？",
        "你好呀，我能感受到你今天的状态比较平和。无论如何，记得照顾好自己。"
    ]
}

def get_session(session_id):
    with session_lock:
        if session_id not in active_sessions:
            active_sessions[session_id] = {
                'chunks': [],
                'partial_texts': [],
                'full_text': '',
                'start_time': time.time(),
                'chunk_count': 0,
                'is_complete': False,
                'temp_files': []
            }
        return active_sessions[session_id]

def cleanup_session(session_id):
    with session_lock:
        if session_id in active_sessions:
            session = active_sessions[session_id]
            for temp_file in session.get('temp_files', []):
                try:
                    if os.path.exists(temp_file):
                        os.unlink(temp_file)
                except:
                    pass
            del active_sessions[session_id]

def get_user_memory(user_id):
    with user_memory_lock:
        if user_id not in user_memory:
            user_memory[user_id] = {
                'emotion_history': deque(maxlen=MEMORY_HISTORY_SIZE),
                'consecutive_negative': 0,
                'comfort_mode': False,
                'comfort_mode_start': None,
                'total_interactions': 0,
                'positive_count': 0,
                'negative_count': 0,
                'neutral_count': 0,
                'last_interaction': None
            }
        return user_memory[user_id]

def update_emotion_memory(user_id, emotion, confidence, timestamp=None):
    if timestamp is None:
        timestamp = time.time()
    
    memory = get_user_memory(user_id)
    
    sentiment_value = {
        'positive': 1.0,
        'neutral': 0.0,
        'negative': -1.0
    }.get(emotion, 0.0)
    
    memory['emotion_history'].append({
        'emotion': emotion,
        'confidence': confidence,
        'value': sentiment_value,
        'timestamp': timestamp
    })
    
    memory['total_interactions'] += 1
    memory['last_interaction'] = timestamp
    
    if emotion == 'positive':
        memory['positive_count'] += 1
        memory['consecutive_negative'] = 0
        if memory['comfort_mode'] and memory['consecutive_negative'] == 0:
            if len(memory['emotion_history']) >= 3:
                recent = [h['emotion'] for h in list(memory['emotion_history'])[-3:]]
                if all(e == 'positive' for e in recent):
                    memory['comfort_mode'] = False
                    print(f"[{user_id}] 退出安慰模式")
    elif emotion == 'negative':
        memory['negative_count'] += 1
        memory['consecutive_negative'] += 1
        if memory['consecutive_negative'] >= NEGATIVE_THRESHOLD and not memory['comfort_mode']:
            memory['comfort_mode'] = True
            memory['comfort_mode_start'] = timestamp
            print(f"[{user_id}] 进入安慰模式 (连续{memory['consecutive_negative']}次消极)")
    else:
        memory['neutral_count'] += 1
    
    return memory

def get_emotion_summary(user_id):
    memory = get_user_memory(user_id)
    history = list(memory['emotion_history'])
    
    if not history:
        return {
            'avg_score': 0.0,
            'dominant_emotion': 'neutral',
            'comfort_mode': False,
            'consecutive_negative': 0,
            'total_interactions': 0
        }
    
    values = [h['value'] for h in history]
    avg_score = sum(values) / len(values)
    
    emotion_counts = {}
    for h in history:
        emotion_counts[h['emotion']] = emotion_counts.get(h['emotion'], 0) + 1
    dominant_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else 'neutral'
    
    return {
        'avg_score': avg_score,
        'dominant_emotion': dominant_emotion,
        'comfort_mode': memory['comfort_mode'],
        'consecutive_negative': memory['consecutive_negative'],
        'total_interactions': memory['total_interactions'],
        'positive_count': memory['positive_count'],
        'negative_count': memory['negative_count'],
        'neutral_count': memory['neutral_count'],
        'history_size': len(history)
    }

def get_client_ip():
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0]
    return request.remote_addr or 'unknown'

def analyze_text_sentiment(text):
    try:
        result = sentiment_analyzer(text)[0]
        label = result['label'].lower()
        score = result['score']
        
        emotion_result = emotion_analyzer(text)[0]
        emotions = {e['label']: e['score'] for e in emotion_result}
        
        if label == 'positive':
            return 'positive', score, emotions
        elif label == 'negative':
            return 'negative', score, emotions
        else:
            return 'neutral', score, emotions
    except Exception as e:
        print(f"文本情感分析错误: {e}")
        return 'neutral', 0.5, {}

def transcribe_chunk(audio_data, session_id):
    try:
        audio_bytes = base64.b64decode(audio_data)
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name
        
        with session_lock:
            if session_id in active_sessions:
                active_sessions[session_id]['temp_files'].append(temp_audio_path)
        
        result = whisper_model.transcribe(
            temp_audio_path,
            language="zh",
            fp16=False,
            verbose=False
        )
        
        return result['text'].strip()
    except Exception as e:
        print(f"分片转写错误: {e}")
        return ""

def fuse_emotions(face_emotion, text_sentiment, face_confidence=0.5, text_confidence=0.5):
    face_sentiment = EMOTION_MAP.get(face_emotion, 'neutral')
    
    weights = {
        'positive': {'positive': 1.0, 'neutral': 0.6, 'negative': 0.3},
        'neutral': {'positive': 0.7, 'neutral': 1.0, 'negative': 0.7},
        'negative': {'positive': 0.3, 'neutral': 0.6, 'negative': 1.0}
    }
    
    face_score = weights[face_sentiment]
    text_score = weights[text_sentiment]
    
    combined = {
        'positive': face_score['positive'] * face_confidence + text_score['positive'] * text_confidence,
        'neutral': face_score['neutral'] * face_confidence + text_score['neutral'] * text_confidence,
        'negative': face_score['negative'] * face_confidence + text_score['negative'] * text_confidence
    }
    
    return max(combined, key=combined.get), combined

def generate_response(combined_sentiment, face_emotion, text, comfort_mode=False):
    import random
    
    if comfort_mode:
        templates = COMFORT_TEMPLATES.get(combined_sentiment, COMFORT_TEMPLATES['neutral'])
    else:
        templates = RESPONSE_TEMPLATES.get(combined_sentiment, RESPONSE_TEMPLATES['neutral'])
    
    base_response = random.choice(templates)
    
    if text and len(text) > 2:
        if comfort_mode:
            if combined_sentiment == 'positive':
                return f"{base_response} 你刚才分享的\"{text}\"听起来很积极呢！"
            elif combined_sentiment == 'negative':
                return f"{base_response} 关于\"{text}\"，我想听听更多你的感受。"
            else:
                return f"{base_response} 你提到的\"{text}\"让我更好地了解你了。"
        else:
            if combined_sentiment == 'positive':
                return f"{base_response} 你刚才说的是：\"{text}\""
            elif combined_sentiment == 'negative':
                return f"{base_response} 关于\"{text}\"，想说点什么吗？"
            else:
                return f"{base_response} 你提到了\"{text}\"，能详细说说吗？"
    
    return base_response

def speak_text(text):
    def _speak():
        with tts_lock:
            try:
                tts_engine.say(text)
                tts_engine.runAndWait()
            except Exception as e:
                print(f"TTS错误: {e}")
    
    threading.Thread(target=_speak, daemon=True).start()

@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')

@socketio.on('connect')
def handle_connect():
    print('客户端已连接')
    emit('status', {'message': '已连接到情感分析服务器'})

@socketio.on('disconnect')
def handle_disconnect():
    print('客户端已断开')

@socketio.on('face_emotion')
def handle_face_emotion(data):
    emotion = data.get('emotion', 'neutral')
    confidence = data.get('confidence', 0.5)
    recent_emotions.append((emotion, confidence))

@socketio.on('start_recording')
def handle_start_recording(data):
    session_id = data.get('session_id', str(uuid.uuid4()))
    user_id = data.get('user_id') or get_client_ip()
    
    session = get_session(session_id)
    session['start_time'] = time.time()
    session['chunk_count'] = 0
    session['partial_texts'] = []
    session['full_text'] = ''
    session['is_complete'] = False
    session['user_id'] = user_id
    
    emotion_summary = get_emotion_summary(user_id)
    
    print(f"[{session_id}] 用户[{user_id}] 开始录音会话")
    emit('recording_started', {
        'session_id': session_id,
        'chunk_duration': CHUNK_DURATION,
        'user_id': user_id,
        'emotion_summary': emotion_summary
    })

@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    session_id = data.get('session_id', '')
    chunk_index = data.get('chunk_index', 0)
    audio_base64 = data.get('audio', '')
    is_final = data.get('is_final', False)
    
    if not session_id or not audio_base64:
        emit('chunk_error', {'session_id': session_id, 'error': '无效的分片数据'})
        return
    
    session = get_session(session_id)
    session['chunk_count'] = chunk_index + 1
    
    print(f"[{session_id}] 收到分片 {chunk_index + 1}, 大小: {len(audio_base64)} bytes")
    
    emit('chunk_received', {
        'session_id': session_id,
        'chunk_index': chunk_index,
        'status': 'processing'
    })
    
    partial_text = transcribe_chunk(audio_base64, session_id)
    
    if partial_text:
        session['partial_texts'].append(partial_text)
        session['full_text'] = ' '.join(session['partial_texts']).strip()
        
        print(f"[{session_id}] 分片 {chunk_index + 1} 转写: {partial_text}")
        
        emit('partial_result', {
            'session_id': session_id,
            'chunk_index': chunk_index,
            'partial_text': partial_text,
            'full_text': session['full_text']
        })
    
    if is_final:
        process_final_recording(session_id)

@socketio.on('stop_recording')
def handle_stop_recording(data):
    session_id = data.get('session_id', '')
    
    if not session_id:
        return
    
    print(f"[{session_id}] 收到停止录音指令")
    
    last_audio = data.get('last_audio', '')
    if last_audio:
        session = get_session(session_id)
        chunk_index = session['chunk_count']
        
        partial_text = transcribe_chunk(last_audio, session_id)
        if partial_text:
            session['partial_texts'].append(partial_text)
            session['full_text'] = ' '.join(session['partial_texts']).strip()
            
            emit('partial_result', {
                'session_id': session_id,
                'chunk_index': chunk_index,
                'partial_text': partial_text,
                'full_text': session['full_text']
            })
    
    process_final_recording(session_id)

def process_final_recording(session_id, user_id=None):
    session = get_session(session_id)
    
    if session['is_complete']:
        return
    
    session['is_complete'] = True
    
    full_text = session['full_text']
    duration = time.time() - session['start_time']
    
    if user_id is None:
        user_id = session.get('user_id', get_client_ip())
    
    print(f"[{session_id}] 用户[{user_id}] 录音完成, 时长: {duration:.1f}秒, 文本: {full_text}")
    
    if not full_text or len(full_text.strip()) < 2:
        emit('response', {
            'session_id': session_id,
            'transcribed_text': '',
            'response': '没有识别到语音内容，请再试一次',
            'combined_sentiment': 'neutral',
            'face_emotion': 'neutral',
            'text_sentiment': 'neutral',
            'duration': duration
        })
        cleanup_session(session_id)
        return
    
    text_sentiment, text_score, text_emotions = analyze_text_sentiment(full_text)
    recent_text_sentiments.append((text_sentiment, text_score))
    
    avg_face_emotion = 'neutral'
    avg_face_confidence = 0.5
    if recent_emotions:
        emotion_counts = {}
        for emo, conf in recent_emotions:
            emotion_counts[emo] = emotion_counts.get(emo, 0) + conf
        avg_face_emotion = max(emotion_counts, key=emotion_counts.get)
        avg_face_confidence = emotion_counts[avg_face_emotion] / sum(emotion_counts.values())
    
    combined_sentiment, scores = fuse_emotions(
        avg_face_emotion, text_sentiment,
        face_confidence=avg_face_confidence,
        text_confidence=text_score
    )
    
    memory = update_emotion_memory(user_id, combined_sentiment, max(avg_face_confidence, text_score))
    emotion_summary = get_emotion_summary(user_id)
    comfort_mode = emotion_summary['comfort_mode']
    
    response_text = generate_response(combined_sentiment, avg_face_emotion, full_text, comfort_mode=comfort_mode)
    
    comfort_status = ""
    if comfort_mode:
        comfort_status = " [安慰模式]"
    print(f"[{session_id}] 用户[{user_id}] 综合情感: {combined_sentiment}, 安慰模式: {comfort_mode}, 回复: {response_text}")
    
    speak_text(response_text)
    
    emit('response', {
        'session_id': session_id,
        'transcribed_text': full_text,
        'response': response_text,
        'combined_sentiment': combined_sentiment,
        'face_emotion': avg_face_emotion,
        'face_confidence': avg_face_confidence,
        'text_sentiment': text_sentiment,
        'text_confidence': text_score,
        'sentiment_scores': scores,
        'text_emotions': text_emotions,
        'duration': duration,
        'chunk_count': session['chunk_count'],
        'comfort_mode': comfort_mode,
        'emotion_summary': emotion_summary
    })
    
    cleanup_session(session_id)

@socketio.on('cancel_recording')
def handle_cancel_recording(data):
    session_id = data.get('session_id', '')
    if session_id:
        print(f"[{session_id}] 取消录音")
        cleanup_session(session_id)
        emit('recording_cancelled', {'session_id': session_id})

@socketio.on('audio_data')
def handle_audio_data(data):
    audio_base64 = data.get('audio', '')
    if not audio_base64:
        emit('response', {'error': '无音频数据'})
        return
    
    session_id = str(uuid.uuid4())
    session = get_session(session_id)
    session['start_time'] = time.time()
    
    print("收到音频数据（兼容模式），正在处理...")
    
    partial_text = transcribe_chunk(audio_base64, session_id)
    
    if not partial_text:
        emit('response', {
            'text': '',
            'message': '没有识别到语音内容，请再试一次',
            'combined_sentiment': 'neutral',
            'face_emotion': 'neutral',
            'text_sentiment': 'neutral'
        })
        cleanup_session(session_id)
        return
    
    session['full_text'] = partial_text
    process_final_recording(session_id)

@socketio.on('get_emotion_history')
def handle_get_history():
    emit('emotion_history', {
        'recent_emotions': list(recent_emotions),
        'recent_text_sentiments': list(recent_text_sentiments)
    })

@socketio.on('get_user_memory')
def handle_get_user_memory(data):
    user_id = data.get('user_id') or get_client_ip()
    summary = get_emotion_summary(user_id)
    memory = get_user_memory(user_id)
    
    emit('user_memory', {
        'user_id': user_id,
        'summary': summary,
        'history': list(memory['emotion_history'])
    })

def cleanup_expired_sessions():
    while True:
        try:
            now = time.time()
            expired_sessions = []
            with session_lock:
                for session_id, session in active_sessions.items():
                    if now - session['start_time'] > 300:
                        expired_sessions.append(session_id)
            
            for session_id in expired_sessions:
                cleanup_session(session_id)
        except Exception as e:
            print(f"清理过期会话错误: {e}")
        
        time.sleep(60)

cleanup_thread = threading.Thread(target=cleanup_expired_sessions, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    print("=" * 60)
    print("多模态情感交互系统 (流式分片版) 启动中...")
    print("分片时长: 5秒 | 支持长语音输入 | 实时转写")
    print("请在浏览器中访问: http://localhost:5000")
    print("=" * 60)
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
