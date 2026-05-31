class SensorDataInterface {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'http://localhost:8080/api';
    this.endpoints = {
      pressure: '/sensors/pressure',
      flow: '/sensors/flow',
      temperature: '/sensors/temperature',
      valve: '/valves/status',
      pump: '/pumps/status',
      alarms: '/alarms',
    };
    this.isConnected = false;
    this.connectionTimeout = options.timeout || 5000;
    this.reconnectInterval = options.reconnectInterval || 10000;
    this.onDataCallbacks = {};
    this.onErrorCallbacks = [];
    this.onConnectionChangeCallbacks = [];
  }

  async connect() {
    try {
      this.isConnected = true;
      this.onConnectionChangeCallbacks.forEach(cb => cb(true));
      return true;
    } catch (error) {
      this.isConnected = false;
      this.onConnectionChangeCallbacks.forEach(cb => cb(false));
      this.onErrorCallbacks.forEach(cb => cb(error));
      return false;
    }
  }

  disconnect() {
    this.isConnected = false;
    this.onConnectionChangeCallbacks.forEach(cb => cb(false));
  }

  async fetch(endpoint, options = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to sensor data server');
    }

    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getPressureData(sensorId = null) {
    const endpoint = sensorId
      ? `${this.endpoints.pressure}/${sensorId}`
      : this.endpoints.pressure;
    return await this.fetch(endpoint);
  }

  async getFlowData(sensorId = null) {
    const endpoint = sensorId
      ? `${this.endpoints.flow}/${sensorId}`
      : this.endpoints.flow;
    return await this.fetch(endpoint);
  }

  async getTemperatureData(sensorId = null) {
    const endpoint = sensorId
      ? `${this.endpoints.temperature}/${sensorId}`
      : this.endpoints.temperature;
    return await this.fetch(endpoint);
  }

  async getValveStatus(valveId = null) {
    const endpoint = valveId
      ? `${this.endpoints.valve}/${valveId}`
      : this.endpoints.valve;
    return await this.fetch(endpoint);
  }

  async getPumpStatus(pumpId = null) {
    const endpoint = pumpId
      ? `${this.endpoints.pump}/${pumpId}`
      : this.endpoints.pump;
    return await this.fetch(endpoint);
  }

  async getAlarms(activeOnly = true) {
    const endpoint = activeOnly
      ? `${this.endpoints.alarms}?active=true`
      : this.endpoints.alarms;
    return await this.fetch(endpoint);
  }

  async getAllSensorData() {
    const [pressure, flow, temperature, valves, pumps, alarms] = await Promise.all([
      this.getPressureData().catch(() => ({ data: [] })),
      this.getFlowData().catch(() => ({ data: [] })),
      this.getTemperatureData().catch(() => ({ data: [] })),
      this.getValveStatus().catch(() => ({ data: [] })),
      this.getPumpStatus().catch(() => ({ data: [] })),
      this.getAlarms().catch(() => ({ data: [] })),
    ]);

    return {
      pressure,
      flow,
      temperature,
      valves,
      pumps,
      alarms,
      timestamp: Date.now(),
    };
  }

  subscribe(type, callback) {
    if (!this.onDataCallbacks[type]) {
      this.onDataCallbacks[type] = [];
    }
    this.onDataCallbacks[type].push(callback);
  }

  unsubscribe(type, callback) {
    if (this.onDataCallbacks[type]) {
      const index = this.onDataCallbacks[type].indexOf(callback);
      if (index > -1) {
        this.onDataCallbacks[type].splice(index, 1);
      }
    }
  }

  onError(callback) {
    this.onErrorCallbacks.push(callback);
  }

  onConnectionChange(callback) {
    this.onConnectionChangeCallbacks.push(callback);
  }

  emitData(type, data) {
    if (this.onDataCallbacks[type]) {
      this.onDataCallbacks[type].forEach(cb => cb(data));
    }
  }
}

export default SensorDataInterface;
