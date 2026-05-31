import os
import json
import sqlite3
import threading
from datetime import datetime, timedelta
from collections import deque
from flask import Flask, render_template, jsonify
import paho.mqtt.client as mqtt
import yaml

app = Flask(__name__)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config', 'config.yaml')
with open(CONFIG_PATH, 'r') as f:
    config = yaml.safe_load(f)

DB_PATH = config['web']['database_path']
MQTT_BROKER = config['mqtt']['broker']
MQTT_PORT = config['mqtt']['port']
MQTT_TOPIC = config['web']['mqtt_topic']

USE_MULTI_CAMERA = config['system'].get('use_multi_camera', False)
NUM_CAMERAS = config['system'].get('num_cameras', 1)

recent_alarms = deque(maxlen=20)
latest_status = {
    'status': 'normal',
    'fall_probability': 0.0,
    'last_update': datetime.now().isoformat(),
    'detection_state': 'NORMAL',
    'recovery_progress': 0,
    'visible_cameras': 0,
    'total_cameras': NUM_CAMERAS,
    'hip_height_3d': 0.0,
    'vertical_velocity': 0.0,
    'body_aspect_ratio_3d': 0.0
}
alarm_count_today = 0
mqtt_connected = False

camera_status = [{'name': f'cam_{i}', 'status': 'unknown', 'last_seen': None} 
                  for i in range(NUM_CAMERAS)]

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS fall_events
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp TEXT NOT NULL,
                  confidence REAL NOT NULL,
                  device_id TEXT NOT NULL,
                  bbox_x REAL,
                  bbox_y REAL,
                  bbox_width REAL,
                  bbox_height REAL,
                  visible_cameras INTEGER,
                  total_cameras INTEGER,
                  hip_height_3d REAL,
                  vertical_velocity REAL,
                  horizontal_velocity REAL,
                  body_aspect_ratio_3d REAL,
                  fusion_confidence REAL,
                  event_type TEXT DEFAULT 'fall_detected')''')
    conn.commit()
    conn.close()

def insert_alarm(data):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    multi_cam = data.get('multi_camera', {})
    analysis_3d = data.get('3d_analysis', {})
    
    c.execute('''INSERT INTO fall_events 
                 (timestamp, confidence, device_id, bbox_x, bbox_y, bbox_width, bbox_height,
                  visible_cameras, total_cameras, hip_height_3d, vertical_velocity,
                  horizontal_velocity, body_aspect_ratio_3d, fusion_confidence, event_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (data.get('timestamp', datetime.now().isoformat()),
               data.get('confidence', 0.0),
               data.get('device_id', 'unknown'),
               data.get('bbox', {}).get('x', 0.0),
               data.get('bbox', {}).get('y', 0.0),
               data.get('bbox', {}).get('width', 0.0),
               data.get('bbox', {}).get('height', 0.0),
               multi_cam.get('visible_cameras', 0),
               multi_cam.get('total_cameras', 0),
               analysis_3d.get('hip_height', 0.0),
               analysis_3d.get('vertical_velocity', 0.0),
               analysis_3d.get('horizontal_velocity', 0.0),
               analysis_3d.get('body_aspect_ratio', 0.0),
               multi_cam.get('fusion_confidence', 0.0),
               data.get('event_type', 'fall_detected')))
    conn.commit()
    conn.close()

def get_today_count():
    today = datetime.now().strftime('%Y-%m-%d')
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''SELECT COUNT(*) FROM fall_events WHERE timestamp LIKE ? AND event_type = 'fall_detected' ''',
              (f'{today}%',))
    count = c.fetchone()[0]
    conn.close()
    return count

def get_weekly_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    stats = []
    for i in range(6, -1, -1):
        date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
        c.execute('''SELECT COUNT(*) FROM fall_events WHERE timestamp LIKE ? AND event_type = 'fall_detected' ''',
                  (f'{date}%',))
        count = c.fetchone()[0]
        stats.append({'date': date, 'count': count})
    
    conn.close()
    return stats

def get_hourly_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    today = datetime.now().strftime('%Y-%m-%d')
    stats = []
    for hour in range(24):
        hour_str = f'{hour:02d}'
        c.execute('''SELECT COUNT(*) FROM fall_events 
                     WHERE timestamp LIKE ? AND event_type = 'fall_detected' ''',
                  (f'{today} {hour_str}%',))
        count = c.fetchone()[0]
        stats.append({'hour': hour, 'count': count})
    
    conn.close()
    return stats

def get_recent_events(limit=50):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''SELECT * FROM fall_events ORDER BY timestamp DESC LIMIT ?''',
              (limit,))
    rows = c.fetchall()
    conn.close()
    
    events = []
    for row in rows:
        events.append({
            'id': row[0],
            'timestamp': row[1],
            'confidence': row[2],
            'device_id': row[3],
            'bbox': {
                'x': row[4],
                'y': row[5],
                'width': row[6],
                'height': row[7]
            },
            'visible_cameras': row[8],
            'total_cameras': row[9],
            'hip_height_3d': row[10],
            'vertical_velocity': row[11],
            'horizontal_velocity': row[12],
            'body_aspect_ratio_3d': row[13],
            'fusion_confidence': row[14],
            'event_type': row[15]
        })
    return events

def on_connect(client, userdata, flags, rc):
    global mqtt_connected
    if rc == 0:
        mqtt_connected = True
        client.subscribe(MQTT_TOPIC)
        print(f"MQTT connected to {MQTT_BROKER}:{MQTT_PORT}")
    else:
        mqtt_connected = False
        print(f"MQTT connection failed with code {rc}")

def on_message(client, userdata, msg):
    global latest_status, alarm_count_today, camera_status
    
    try:
        data = json.loads(msg.payload.decode())
        event_type = data.get('event_type', '')
        
        if event_type == 'fall_detected':
            alarm_data = {
                'timestamp': data.get('timestamp', datetime.now().isoformat()),
                'confidence': data.get('confidence', 0.0),
                'device_id': data.get('device_id', 'unknown'),
                'bbox': data.get('bbox', {}),
                'multi_camera': data.get('multi_camera', {}),
                '3d_analysis': data.get('3d_analysis', {}),
                'event_type': 'fall_detected'
            }
            
            insert_alarm(alarm_data)
            recent_alarms.appendleft(alarm_data)
            alarm_count_today = get_today_count()
            
            multi_cam = data.get('multi_camera', {})
            analysis_3d = data.get('3d_analysis', {})
            
            latest_status = {
                'status': 'alarm',
                'fall_probability': data.get('confidence', 0.0),
                'last_update': datetime.now().isoformat(),
                'detection_state': 'WAITING_FOR_RECOVERY',
                'recovery_progress': 0,
                'visible_cameras': multi_cam.get('visible_cameras', 0),
                'total_cameras': multi_cam.get('total_cameras', NUM_CAMERAS),
                'hip_height_3d': analysis_3d.get('hip_height', 0.0),
                'vertical_velocity': analysis_3d.get('vertical_velocity', 0.0),
                'body_aspect_ratio_3d': analysis_3d.get('body_aspect_ratio', 0.0),
                'alarm': alarm_data
            }
            
            print(f"[ALARM] Fall detected by {data.get('device_id', 'unknown')} "
                  f"with confidence {data.get('confidence', 0.0):.2f}")
            
        elif event_type == 'recovery_detected':
            device_id = data.get('device_id', 'unknown')
            recovery_time = datetime.now().isoformat()
            
            recovery_data = {
                'timestamp': recovery_time,
                'device_id': device_id,
                'event_type': 'recovery_detected'
            }
            recent_alarms.appendleft(recovery_data)
            
            latest_status = {
                'status': 'normal',
                'fall_probability': 0.0,
                'last_update': recovery_time,
                'detection_state': 'NORMAL',
                'recovery_progress': 0,
                'visible_cameras': latest_status.get('visible_cameras', 0),
                'total_cameras': NUM_CAMERAS,
                'hip_height_3d': 0.0,
                'vertical_velocity': 0.0,
                'body_aspect_ratio_3d': 0.0
            }
            
            print(f"[Recovery] {device_id} recovered at {recovery_time}")
            
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")

def mqtt_thread():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        client.loop_forever()
    except Exception as e:
        print(f"MQTT connection error: {e}")

@app.route('/')
def index():
    return render_template('index.html', 
                           use_multi_camera=USE_MULTI_CAMERA,
                           num_cameras=NUM_CAMERAS)

@app.route('/api/status')
def api_status():
    return jsonify({
        'status': latest_status.get('status', 'normal'),
        'fall_probability': latest_status.get('fall_probability', 0.0),
        'last_update': latest_status.get('last_update'),
        'mqtt_connected': mqtt_connected,
        'alarm_count_today': alarm_count_today,
        'detection_state': latest_status.get('detection_state', 'NORMAL'),
        'recovery_progress': latest_status.get('recovery_progress', 0),
        'use_multi_camera': USE_MULTI_CAMERA,
        'visible_cameras': latest_status.get('visible_cameras', 0),
        'total_cameras': latest_status.get('total_cameras', NUM_CAMERAS),
        'hip_height_3d': latest_status.get('hip_height_3d', 0.0),
        'vertical_velocity': latest_status.get('vertical_velocity', 0.0),
        'body_aspect_ratio_3d': latest_status.get('body_aspect_ratio_3d', 0.0)
    })

@app.route('/api/recent_alarms')
def api_recent_alarms():
    return jsonify(list(recent_alarms))

@app.route('/api/weekly_stats')
def api_weekly_stats():
    return jsonify(get_weekly_stats())

@app.route('/api/hourly_stats')
def api_hourly_stats():
    return jsonify(get_hourly_stats())

@app.route('/api/events')
def api_events():
    return jsonify(get_recent_events())

@app.route('/api/camera_status')
def api_camera_status():
    return jsonify({
        'cameras': camera_status,
        'use_multi_camera': USE_MULTI_CAMERA
    })

if __name__ == '__main__':
    init_db()
    alarm_count_today = get_today_count()
    
    mqtt_t = threading.Thread(target=mqtt_thread, daemon=True)
    mqtt_t.start()
    
    app.run(host=config['web']['host'],
            port=config['web']['port'],
            debug=False,
            threaded=True)
