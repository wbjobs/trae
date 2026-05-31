const EventEmitter = require('events');
const TimeSeriesPredictor = require('../utils/TimeSeriesPredictor');
const config = require('../config/config');

class SimulationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.enabled = options.enabled !== false;
    this.autoSwitch = options.autoSwitch !== false;
    this.switchoverDelayMs = options.switchoverDelayMs || 5000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs || 10000;
    this.simulationIntervalMs = options.simulationIntervalMs || 500;
    this.noiseLevel = options.noiseLevel || 0.08;
    
    this.isSimulating = false;
    this.isRealConnected = false;
    this.lastDataTime = 0;
    this.switchoverAttempts = 0;
    this.maxSwitchoverAttempts = 5;
    
    this.predictor = new TimeSeriesPredictor({
      minDataPoints: 20,
      maxDataPoints: 500
    });
    
    this.simulationTimer = null;
    this.watchdogTimer = null;
    this.reconnectTimer = null;
    
    this.monitoredTags = new Map();
    this.simulatedValues = new Map();
    
    this.stats = {
      simulationSessions: 0,
      totalSimulationTimeMs: 0,
      simulationStartTime: null,
      totalGeneratedDataPoints: 0,
      switchoverCount: 0,
      switchbackCount: 0
    };
  }

  init(plcDevices) {
    for (const plc of plcDevices) {
      for (const [tagName, tagInfo] of Object.entries(plc.tags)) {
        const key = `${plc.id}:${tagName}`;
        this.monitoredTags.set(key, {
          plcId: plc.id,
          tagName,
          nodeId: tagInfo.nodeId,
          dataType: tagInfo.dataType,
          unit: tagInfo.unit
        });
      }
    }
    
    this.startWatchdog();
    console.log(`[SimulationManager] Initialized with ${this.monitoredTags.size} monitored tags`);
  }

  startWatchdog() {
    if (this.watchdogTimer) return;
    
    this.watchdogTimer = setInterval(() => {
      this.checkConnection();
    }, this.heartbeatTimeoutMs / 2);
    
    console.log('[SimulationManager] Watchdog started');
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
      console.log('[SimulationManager] Watchdog stopped');
    }
  }

  recordRealData(plcId, tagName, value, timestamp) {
    const key = `${plcId}:${tagName}`;
    this.predictor.addDataPoint(key, timestamp, value);
    this.lastDataTime = Date.now();
    this.isRealConnected = true;
    
    if (this.isSimulating && this.autoSwitch) {
      this.scheduleSwitchback();
    }
  }

  checkConnection() {
    if (!this.enabled || !this.autoSwitch) return;
    
    const timeSinceLastData = Date.now() - this.lastDataTime;
    
    if (this.isRealConnected && timeSinceLastData > this.heartbeatTimeoutMs) {
      console.warn(`[SimulationManager] No data received for ${timeSinceLastData}ms, assuming real PLC disconnected`);
      this.isRealConnected = false;
      
      if (!this.isSimulating) {
        this.enterSimulationMode();
      }
    }
  }

  enterSimulationMode() {
    if (this.isSimulating) return;
    
    console.log('\n========================================');
    console.log('⚠️  检测到真实PLC断连，切换到模拟模式');
    console.log('========================================\n');
    
    this.isSimulating = true;
    this.stats.simulationSessions++;
    this.stats.simulationStartTime = Date.now();
    this.stats.switchoverCount++;
    
    for (const [key, tagInfo] of this.monitoredTags) {
      const lastValue = this.getLastKnownValue(key);
      if (lastValue !== null) {
        this.simulatedValues.set(key, lastValue);
      }
    }
    
    this.startSimulation();
    
    this.emit('simulation_started', {
      reason: 'real_connection_lost',
      monitoredTags: this.monitoredTags.size
    });
  }

  exitSimulationMode() {
    if (!this.isSimulating) return;
    
    console.log('\n========================================');
    console.log('✅ 真实PLC恢复连接，切回正常模式');
    console.log('========================================\n');
    
    this.stopSimulation();
    
    if (this.stats.simulationStartTime) {
      this.stats.totalSimulationTimeMs += Date.now() - this.stats.simulationStartTime;
    }
    
    this.isSimulating = false;
    this.stats.switchbackCount++;
    
    this.emit('simulation_stopped', {
      reason: 'real_connection_restored',
      durationMs: Date.now() - this.stats.simulationStartTime,
      generatedPoints: this.stats.totalGeneratedDataPoints
    });
  }

  scheduleSwitchback() {
    if (this.reconnectTimer) return;
    
    this.switchoverAttempts++;
    
    if (this.switchoverAttempts >= this.maxSwitchoverAttempts) {
      this.reconnectTimer = setTimeout(() => {
        this.switchoverAttempts = 0;
        this.reconnectTimer = null;
        this.exitSimulationMode();
      }, this.switchoverDelayMs);
    }
  }

  startSimulation() {
    if (this.simulationTimer) return;
    
    console.log('[SimulationManager] Starting simulated data generation');
    
    this.simulationTimer = setInterval(() => {
      this.generateSimulatedData();
    }, this.simulationIntervalMs);
  }

  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
      console.log('[SimulationManager] Stopped simulated data generation');
    }
  }

  generateSimulatedData() {
    const now = new Date();
    
    for (const [key, tagInfo] of this.monitoredTags) {
      let predictedValue;
      
      if (this.predictor.hasEnoughData(key)) {
        predictedValue = this.predictor.predictNext(key, this.simulationIntervalMs, this.noiseLevel);
      } else {
        const lastValue = this.simulatedValues.get(key) || this.getLastKnownValue(key) || 50;
        const variation = (Math.random() - 0.5) * lastValue * this.noiseLevel * 2;
        predictedValue = lastValue + variation;
      }
      
      if (tagInfo.dataType === 'Int32') {
        predictedValue = Math.round(predictedValue);
      }
      
      this.simulatedValues.set(key, predictedValue);
      this.stats.totalGeneratedDataPoints++;
      
      const simulatedData = {
        plcId: tagInfo.plcId,
        tagName: tagInfo.tagName,
        value: predictedValue,
        timestamp: now,
        status: 'simulated',
        isSimulated: true
      };
      
      this.emit('simulated_data', simulatedData);
    }
  }

  getLastKnownValue(key) {
    const stats = this.predictor.getDataStats(key);
    return stats ? stats.mean : null;
  }

  getPredictionConfidence(key) {
    return this.predictor.getPredictionConfidence(key);
  }

  getSimulatedValue(plcId, tagName) {
    const key = `${plcId}:${tagName}`;
    return this.simulatedValues.get(key) || null;
  }

  getTagPredictionStats(plcId, tagName) {
    const key = `${plcId}:${tagName}`;
    return {
      hasEnoughData: this.predictor.hasEnoughData(key),
      confidence: this.getPredictionConfidence(key),
      dataStats: this.predictor.getDataStats(key),
      lastSimulatedValue: this.simulatedValues.get(key)
    };
  }

  getStatus() {
    return {
      enabled: this.enabled,
      autoSwitch: this.autoSwitch,
      isSimulating: this.isSimulating,
      isRealConnected: this.isRealConnected,
      lastDataTime: this.lastDataTime > 0 ? new Date(this.lastDataTime).toISOString() : null,
      timeSinceLastDataMs: Date.now() - this.lastDataTime,
      monitoredTags: this.monitoredTags.size,
      stats: {
        ...this.stats,
        currentSessionDurationMs: this.isSimulating && this.stats.simulationStartTime 
          ? Date.now() - this.stats.simulationStartTime 
          : 0
      }
    };
  }

  manualStartSimulation() {
    if (!this.isSimulating) {
      this.enterSimulationMode();
      return true;
    }
    return false;
  }

  manualStopSimulation() {
    if (this.isSimulating) {
      this.exitSimulationMode();
      return true;
    }
    return false;
  }

  shutdown() {
    this.stopWatchdog();
    this.stopSimulation();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    console.log('[SimulationManager] Shutdown complete');
  }
}

module.exports = SimulationManager;
