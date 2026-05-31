class DataSimulator {
  constructor(options = {}) {
    this.pipeIds = [];
    this.valveIds = [];
    this.pumpIds = [];
    this.updateInterval = options.updateInterval || 1000;
    this.isRunning = false;
    this.intervalId = null;
    this.onDataCallbacks = [];
    this.onAlarmCallbacks = [];
    this.dataCache = {
      pressure: {},
      flow: {},
      temperature: {},
      valves: {},
      pumps: {},
      alarms: [],
    };
    this.basePressure = options.basePressure || 2.0;
    this.baseFlow = options.baseFlow || 1.0;
    this.baseTemperature = options.baseTemperature || 40;
    this.faultChance = options.faultChance || 0.02;
  }

  setPipeIds(ids) {
    this.pipeIds = ids;
    ids.forEach(id => {
      this.dataCache.pressure[id] = this.basePressure + (Math.random() - 0.5) * 0.5;
      this.dataCache.flow[id] = this.baseFlow + (Math.random() - 0.5) * 0.3;
      this.dataCache.temperature[id] = this.baseTemperature + (Math.random() - 0.5) * 10;
    });
  }

  setValveIds(ids) {
    this.valveIds = ids;
    ids.forEach(id => {
      this.dataCache.valves[id] = {
        isOpen: Math.random() > 0.1,
        position: Math.random() > 0.1 ? 100 : 0,
      };
    });
  }

  setPumpIds(ids) {
    this.pumpIds = ids;
    ids.forEach(id => {
      this.dataCache.pumps[id] = {
        isRunning: Math.random() > 0.2,
        power: Math.random() > 0.2 ? 50 + Math.random() * 50 : 0,
        vibration: Math.random() * 5,
      };
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.update(), this.updateInterval);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  update() {
    this.pipeIds.forEach(id => {
      const variation = (Math.random() - 0.5) * 0.1;
      this.dataCache.pressure[id] = Math.max(
        0.1,
        this.dataCache.pressure[id] + variation
      );

      const flowVariation = (Math.random() - 0.5) * 0.1;
      this.dataCache.flow[id] = Math.max(
        0,
        this.dataCache.flow[id] + flowVariation
      );

      const tempVariation = (Math.random() - 0.5) * 2;
      this.dataCache.temperature[id] = Math.max(
        10,
        Math.min(100, this.dataCache.temperature[id] + tempVariation)
      );

      if (Math.random() < this.faultChance) {
        this.generateRandomFault(id);
      }
    });

    this.valveIds.forEach(id => {
      if (Math.random() < 0.01) {
        this.dataCache.valves[id].isOpen = !this.dataCache.valves[id].isOpen;
        this.dataCache.valves[id].position = this.dataCache.valves[id].isOpen ? 100 : 0;
      }
    });

    this.pumpIds.forEach(id => {
      if (Math.random() < 0.005) {
        this.dataCache.pumps[id].isRunning = !this.dataCache.pumps[id].isRunning;
        this.dataCache.pumps[id].power = this.dataCache.pumps[id].isRunning ? 50 + Math.random() * 50 : 0;
      }
      if (this.dataCache.pumps[id].isRunning) {
        this.dataCache.pumps[id].vibration = 2 + Math.random() * 4;
      }
    });

    this.cleanupOldAlarms();

    const data = {
      pressure: { ...this.dataCache.pressure },
      flow: { ...this.dataCache.flow },
      temperature: { ...this.dataCache.temperature },
      valves: { ...this.dataCache.valves },
      pumps: { ...this.dataCache.pumps },
      alarms: [...this.dataCache.alarms],
      timestamp: Date.now(),
    };

    this.onDataCallbacks.forEach(cb => cb(data));
  }

  generateRandomFault(pipeId) {
    const faultTypes = [
      { type: 'pressure_high', severity: 'high', threshold: 4.0 },
      { type: 'pressure_low', severity: 'medium', threshold: 0.5 },
      { type: 'flow_low', severity: 'medium', threshold: 0.2 },
      { type: 'temperature_high', severity: 'high', threshold: 80 },
    ];

    const fault = faultTypes[Math.floor(Math.random() * faultTypes.length)];

    switch (fault.type) {
      case 'pressure_high':
        this.dataCache.pressure[pipeId] = fault.threshold + Math.random() * 2;
        break;
      case 'pressure_low':
        this.dataCache.pressure[pipeId] = fault.threshold - Math.random() * 0.3;
        break;
      case 'flow_low':
        this.dataCache.flow[pipeId] = Math.max(0, fault.threshold - Math.random() * 0.1);
        break;
      case 'temperature_high':
        this.dataCache.temperature[pipeId] = fault.threshold + Math.random() * 20;
        break;
    }

    const alarm = {
      id: `alarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      componentId: pipeId,
      type: fault.type,
      severity: fault.severity,
      message: this.getAlarmMessage(fault.type, pipeId),
      timestamp: Date.now(),
      active: true,
    };

    this.dataCache.alarms.push(alarm);
    this.onAlarmCallbacks.forEach(cb => cb(alarm));
  }

  getAlarmMessage(type, componentId) {
    const messages = {
      pressure_high: `管道 ${componentId} 压力过高`,
      pressure_low: `管道 ${componentId} 压力过低`,
      flow_low: `管道 ${componentId} 流量过低`,
      temperature_high: `管道 ${componentId} 温度过高`,
    };
    return messages[type] || `组件 ${componentId} 异常`;
  }

  cleanupOldAlarms() {
    const now = Date.now();
    const maxAge = 30000;
    this.dataCache.alarms = this.dataCache.alarms.filter(alarm => {
      if (!alarm.active) return now - alarm.timestamp < maxAge;
      return true;
    });
  }

  acknowledgeAlarm(alarmId) {
    const alarm = this.dataCache.alarms.find(a => a.id === alarmId);
    if (alarm) {
      alarm.active = false;
      alarm.acknowledged = true;
      alarm.acknowledgedAt = Date.now();
    }
  }

  clearAlarm(alarmId) {
    const index = this.dataCache.alarms.findIndex(a => a.id === alarmId);
    if (index > -1) {
      this.dataCache.alarms.splice(index, 1);
    }
  }

  getCurrentData() {
    return {
      pressure: { ...this.dataCache.pressure },
      flow: { ...this.dataCache.flow },
      temperature: { ...this.dataCache.temperature },
      valves: { ...this.dataCache.valves },
      pumps: { ...this.dataCache.pumps },
      alarms: [...this.dataCache.alarms],
      timestamp: Date.now(),
    };
  }

  onData(callback) {
    this.onDataCallbacks.push(callback);
  }

  onAlarm(callback) {
    this.onAlarmCallbacks.push(callback);
  }

  setPipePressure(pipeId, value) {
    this.dataCache.pressure[pipeId] = value;
  }

  setPipeFlow(pipeId, value) {
    this.dataCache.flow[pipeId] = value;
  }

  setValveState(valveId, isOpen) {
    if (this.dataCache.valves[valveId]) {
      this.dataCache.valves[valveId].isOpen = isOpen;
      this.dataCache.valves[valveId].position = isOpen ? 100 : 0;
    }
  }

  setPumpState(pumpId, isRunning) {
    if (this.dataCache.pumps[pumpId]) {
      this.dataCache.pumps[pumpId].isRunning = isRunning;
      this.dataCache.pumps[pumpId].power = isRunning ? 50 + Math.random() * 50 : 0;
    }
  }

  dispose() {
    this.stop();
    this.onDataCallbacks = [];
    this.onAlarmCallbacks = [];
  }
}

export default DataSimulator;
