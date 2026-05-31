import paho.mqtt.client as mqtt
import json
import time
import random
from datetime import datetime

def on_connect(client, userdata, flags, rc):
    print(f"Connected with result code {rc}")

def main():
    client = mqtt.Client("test_publisher")
    client.on_connect = on_connect
    
    try:
        client.connect("localhost", 1883, 60)
    except Exception as e:
        print(f"Connection failed: {e}")
        return
    
    print("Publishing test fall alarms...")
    print("Press Ctrl+C to stop")
    
    try:
        while True:
            alarm_data = {
                "timestamp": datetime.now().isoformat(),
                "confidence": random.uniform(0.85, 0.99),
                "device_id": "camera_0",
                "bbox": {
                    "x": random.uniform(0.2, 0.4),
                    "y": random.uniform(0.3, 0.5),
                    "width": random.uniform(0.2, 0.4),
                    "height": random.uniform(0.3, 0.6)
                },
                "event_type": "fall_detected"
            }
            
            payload = json.dumps(alarm_data)
            client.publish("fall_detection/alarm", payload, qos=1)
            print(f"Published: {payload[:80]}...")
            
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        client.disconnect()

if __name__ == "__main__":
    main()
