const mqtt = require('mqtt');
const log = require('electron-log');
const EventEmitter = require('events');

class MqttClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isSimulating = false;
    this.simulationIntervals = [];
    this.simulationDevices = this.createSimulationDevices();
  }

  createSimulationDevices() {
    const baseLat = 39.9042;
    const baseLng = 116.4074;
    
    return [
      {
        deviceId: 'sim_001',
        nickname: '设备A',
        color: '#EF4444',
        lat: baseLat + 0.001,
        lng: baseLng + 0.001,
        targetLat: baseLat + 0.002,
        targetLng: baseLng + 0.002,
        speed: 0.0001,
        heading: 45,
      },
      {
        deviceId: 'sim_002',
        nickname: '设备B',
        color: '#10B981',
        lat: baseLat - 0.001,
        lng: baseLng - 0.001,
        targetLat: baseLat - 0.002,
        targetLng: baseLng - 0.002,
        speed: 0.00008,
        heading: 225,
      },
      {
        deviceId: 'sim_003',
        nickname: '设备C',
        color: '#3B82F6',
        lat: baseLat + 0.002,
        lng: baseLng - 0.001,
        targetLat: baseLat,
        targetLng: baseLng,
        speed: 0.00012,
        heading: 315,
      },
    ];
  }

  async connect() {
    const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';
    
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(mqttUrl, {
        clientId: `electron_${Math.random().toString(16).substr(2, 8)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 5000,
        retry: true,
      });

      this.client.on('connect', () => {
        log.info('MQTT client connected');
        resolve();
      });

      this.client.on('error', (err) => {
        log.error('MQTT client error:', err);
        if (!this.client.connected) {
          reject(err);
        }
      });

      this.client.on('message', (topic, message) => {
        try {
          const data = JSON.parse(message.toString());
          this.emit('gpsUpdate', data);
        } catch (err) {
          log.error('Failed to parse MQTT message:', err);
        }
      });

      this.client.subscribe('gps/simulate/#', (err) => {
        if (err) {
          log.error('Failed to subscribe to GPS topics:', err);
        } else {
          log.info('Subscribed to gps/simulate/#');
        }
      });
    });
  }

  updateDevicePosition(device) {
    const latDiff = device.targetLat - device.lat;
    const lngDiff = device.targetLng - device.lng;
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

    if (distance < 0.0001) {
      device.targetLat = device.lat + (Math.random() - 0.5) * 0.004;
      device.targetLng = device.lng + (Math.random() - 0.5) * 0.004;
    }

    device.lat += latDiff * 0.1;
    device.lng += lngDiff * 0.1;

    device.heading = Math.atan2(lngDiff, latDiff) * (180 / Math.PI);
    if (device.heading < 0) device.heading += 360;
  }

  startSimulation() {
    if (this.isSimulating) {
      log.warn('GPS simulation already running');
      return;
    }

    this.isSimulating = true;
    log.info('Starting GPS simulation...');

    const interval = setInterval(() => {
      this.simulationDevices.forEach(device => {
        this.updateDevicePosition(device);

        const gpsData = {
          deviceId: device.deviceId,
          nickname: device.nickname,
          color: device.color,
          latitude: device.lat + (Math.random() - 0.5) * 0.0001,
          longitude: device.lng + (Math.random() - 0.5) * 0.0001,
          accuracy: 3 + Math.random() * 2,
          speed: 2 + Math.random() * 3,
          heading: device.heading + (Math.random() - 0.5) * 10,
          timestamp: Date.now(),
        };

        if (this.client && this.client.connected) {
          this.client.publish(
            `gps/simulate/${device.deviceId}`,
            JSON.stringify(gpsData)
          );
        }

        this.emit('gpsUpdate', gpsData);
      });
    }, 1000);

    this.simulationIntervals.push(interval);
  }

  stopSimulation() {
    if (!this.isSimulating) {
      log.warn('GPS simulation not running');
      return;
    }

    this.isSimulating = false;
    this.simulationIntervals.forEach(interval => clearInterval(interval));
    this.simulationIntervals = [];
    log.info('GPS simulation stopped');
  }

  async disconnect() {
    this.stopSimulation();
    
    if (this.client) {
      await new Promise(resolve => {
        this.client.end(false, {}, resolve);
      });
    }
    log.info('MQTT client disconnected');
  }
}

module.exports = MqttClient;
