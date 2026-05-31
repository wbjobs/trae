const opcua = require('node-opcua');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const BatchProcessor = require('../utils/BatchProcessor');
const SimulationManager = require('./SimulationManager');

const { OPCUAClient, MessageSecurityMode, SecurityPolicy, UserIdentityTokenType } = opcua;

class OpcUaClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.client = null;
    this.session = null;
    this.subscription = null;
    this.monitoredItems = new Map();
    this.isConnected = false;
    this.reconnectDelay = 5000;
    this.useBatchProcessing = options.useBatchProcessing !== false;
    this.enableSimulation = options.enableSimulation !== false;
    
    if (this.useBatchProcessing) {
      this.batchProcessor = new BatchProcessor({
        bufferCapacity: options.bufferCapacity || 50000,
        batchSize: options.batchSize || 500,
        flushIntervalMs: options.flushIntervalMs || 100,
        maxBatchDelayMs: options.maxBatchDelayMs || 500,
        backpressureThreshold: options.backpressureThreshold || 0.8,
        stalenessThresholdMs: options.stalenessThresholdMs || 5000
      });
      
      this.batchProcessor.on('data_batch', (batch) => this.emit('data_batch', batch));
      this.batchProcessor.on('alert_batch', (batch) => this.emit('alert_batch', batch));
      this.batchProcessor.on('websocket_batch', (batch) => this.emit('websocket_batch', batch));
      this.batchProcessor.on('batch_processed', (stats) => this.emit('batch_processed', stats));
      this.batchProcessor.on('backpressure_start', (info) => this.emit('backpressure_start', info));
      this.batchProcessor.on('backpressure_end', (info) => this.emit('backpressure_end', info));
      this.batchProcessor.on('data_dropped', (item) => this.emit('data_dropped', item));
    }
    
    if (this.enableSimulation) {
      this.simulationManager = new SimulationManager({
        enabled: true,
        autoSwitch: options.autoSimulationSwitch !== false,
        switchoverDelayMs: options.switchoverDelayMs || 5000,
        heartbeatTimeoutMs: options.heartbeatTimeoutMs || 10000,
        simulationIntervalMs: options.simulationIntervalMs || 500,
        noiseLevel: options.simulationNoiseLevel || 0.08
      });
      
      this.simulationManager.init(config.plcDevices);
      
      this.simulationManager.on('simulated_data', (data) => {
        if (this.useBatchProcessing && this.batchProcessor) {
          this.batchProcessor.write(data);
        } else {
          this.emit('data_changed', data);
        }
      });
      
      this.simulationManager.on('simulation_started', (info) => {
        this.emit('simulation_started', info);
      });
      
      this.simulationManager.on('simulation_stopped', (info) => {
        this.emit('simulation_stopped', info);
      });
    }
  }

  async connect() {
    try {
      const securityPolicy = this.getSecurityPolicy(config.opcua.client.securityPolicy);
      const securityMode = this.getMessageSecurityMode(config.opcua.client.messageSecurityMode);

      const clientOptions = {
        securityMode: securityMode,
        securityPolicy: securityPolicy,
        connectionStrategy: {
          maxRetry: 10,
          initialDelay: 1000,
          maxDelay: 10000
        },
        keepSessionAlive: true,
        requestedSessionTimeout: 60000,
        endpointMustExist: false
      };

      const certPath = path.join(__dirname, '../../certificates/client_cert.pem');
      const privateKeyPath = path.join(__dirname, '../../certificates/client_key.pem');

      if (fs.existsSync(certPath) && fs.existsSync(privateKeyPath)) {
        clientOptions.certificateFile = certPath;
        clientOptions.privateKeyFile = privateKeyPath;
        console.log('[OPC UA Client] Using certificate authentication');
      } else {
        console.log('[OPC UA Client] No certificates found, using anonymous mode');
      }

      this.client = OPCUAClient.create(clientOptions);

      this.client.on('connection_reestablished', () => {
        console.log('[OPC UA Client] Connection reestablished');
        this.emit('connection_reestablished');
      });

      this.client.on('connection_lost', () => {
        console.warn('[OPC UA Client] Connection lost');
        this.isConnected = false;
        this.emit('connection_lost');
      });

      this.client.on('close', () => {
        console.log('[OPC UA Client] Connection closed');
        this.isConnected = false;
        this.emit('close');
      });

      console.log(`[OPC UA Client] Connecting to ${config.opcua.server.endpoint}...`);
      await this.client.connect(config.opcua.server.endpoint);

      this.session = await this.client.createSession();
      this.isConnected = true;
      
      console.log('[OPC UA Client] Connected and session created');
      this.emit('connected');

      return true;
    } catch (error) {
      console.error('[OPC UA Client] Connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  getSecurityPolicy(policy) {
    switch (policy) {
      case 'Basic128Rsa15': return SecurityPolicy.Basic128Rsa15;
      case 'Basic256': return SecurityPolicy.Basic256;
      case 'Basic256Sha256': return SecurityPolicy.Basic256Sha256;
      case 'Aes128_Sha256_RsaOaep': return SecurityPolicy.Aes128_Sha256_RsaOaep;
      case 'Aes256_Sha256_RsaPss': return SecurityPolicy.Aes256_Sha256_RsaPss;
      default: return SecurityPolicy.None;
    }
  }

  getMessageSecurityMode(mode) {
    switch (mode) {
      case 'Sign': return MessageSecurityMode.Sign;
      case 'SignAndEncrypt': return MessageSecurityMode.SignAndEncrypt;
      default: return MessageSecurityMode.None;
    }
  }

  async createSubscription(publishingInterval = 500) {
    if (!this.session) {
      throw new Error('Session not established');
    }

    const subscriptionOptions = {
      requestedPublishingInterval: publishingInterval,
      requestedLifetimeCount: 1000,
      requestedMaxKeepAliveCount: 12,
      maxNotificationsPerPublish: 1000,
      publishingEnabled: true,
      priority: 10
    };

    this.subscription = opcua.ClientSubscription.create(this.session, subscriptionOptions);

    this.subscription.on('started', () => {
      console.log(`[OPC UA Client] Subscription started (ID: ${this.subscription.subscriptionId})`);
    });

    this.subscription.on('keepalive', () => {
      this.emit('subscription_keepalive');
    });

    this.subscription.on('terminated', () => {
      console.warn('[OPC UA Client] Subscription terminated');
      this.emit('subscription_terminated');
    });

    this.subscription.on('error', (error) => {
      console.error('[OPC UA Client] Subscription error:', error);
      this.emit('subscription_error', error);
    });

    return this.subscription;
  }

  async monitorNode(nodeId, plcId, tagName, samplingInterval = 500) {
    if (!this.subscription) {
      await this.createSubscription();
    }

    const itemToMonitor = {
      nodeId: nodeId,
      attributeId: opcua.AttributeIds.Value
    };

    const monitoringParameters = {
      samplingInterval: samplingInterval,
      queueSize: 10,
      discardOldest: true
    };

    const monitoredItem = opcua.ClientMonitoredItem.create(
      this.subscription,
      itemToMonitor,
      monitoringParameters,
      opcua.TimestampsToReturn.Both
    );

    monitoredItem.on('changed', (dataValue) => {
      const timestamp = dataValue.serverTimestamp || new Date();
      const value = dataValue.value ? dataValue.value.value : null;
      const statusCode = dataValue.statusCode;

      if (statusCode.isGood()) {
        const data = {
          plcId,
          tagName,
          value,
          timestamp,
          status: 'good'
        };
        
        if (this.enableSimulation && this.simulationManager) {
          this.simulationManager.recordRealData(plcId, tagName, value, timestamp);
        }
        
        if (this.useBatchProcessing && this.batchProcessor) {
          this.batchProcessor.write(data);
        } else {
          this.emit('data_changed', data);
        }
      }
    });

    monitoredItem.on('err', (error) => {
      console.error(`[OPC UA Client] Monitored item error (${nodeId}):`, error.message);
      this.emit('monitor_error', { nodeId, plcId, tagName, error });
    });

    const key = `${plcId}:${tagName}`;
    this.monitoredItems.set(key, monitoredItem);
    console.log(`[OPC UA Client] Started monitoring ${key} (${nodeId})`);

    return monitoredItem;
  }

  async monitorAllTags() {
    const monitorPromises = [];
    
    config.plcDevices.forEach(plc => {
      Object.entries(plc.tags).forEach(([tagName, tagInfo]) => {
        monitorPromises.push(
          this.monitorNode(tagInfo.nodeId, plc.id, tagName, 500)
        );
      });
    });

    await Promise.all(monitorPromises);
    console.log(`[OPC UA Client] Started monitoring ${this.monitoredItems.size} tags`);
  }

  async readNode(nodeId) {
    if (!this.session) {
      throw new Error('Session not established');
    }

    const dataValue = await this.session.read({
      nodeId: nodeId,
      attributeId: opcua.AttributeIds.Value
    });

    return {
      value: dataValue.value ? dataValue.value.value : null,
      timestamp: dataValue.serverTimestamp || new Date(),
      status: dataValue.statusCode.isGood() ? 'good' : 'bad'
    };
  }

  async readAllTags() {
    const nodesToRead = [];
    
    config.plcDevices.forEach(plc => {
      Object.entries(plc.tags).forEach(([tagName, tagInfo]) => {
        nodesToRead.push({
          nodeId: tagInfo.nodeId,
          attributeId: opcua.AttributeIds.Value,
          plcId: plc.id,
          tagName
        });
      });
    });

    const dataValues = await this.session.read(nodesToRead);
    
    const results = [];
    nodesToRead.forEach((node, index) => {
      const dataValue = dataValues[index];
      results.push({
        plcId: node.plcId,
        tagName: node.tagName,
        value: dataValue.value ? dataValue.value.value : null,
        timestamp: dataValue.serverTimestamp || new Date(),
        status: dataValue.statusCode.isGood() ? 'good' : 'bad'
      });
    });

    return results;
  }

  startBatchProcessing() {
    if (this.batchProcessor && !this.batchProcessor.isRunning) {
      this.batchProcessor.start();
    }
  }

  stopBatchProcessing() {
    if (this.batchProcessor && this.batchProcessor.isRunning) {
      this.batchProcessor.stop();
    }
  }

  async disconnect() {
    try {
      if (this.batchProcessor) {
        this.stopBatchProcessing();
      }

      if (this.simulationManager) {
        this.simulationManager.shutdown();
      }

      if (this.monitoredItems.size > 0) {
        console.log('[OPC UA Client] Removing monitored items...');
        this.monitoredItems.clear();
      }

      if (this.subscription) {
        console.log('[OPC UA Client] Terminating subscription...');
        await this.subscription.terminate();
        this.subscription = null;
      }

      if (this.session) {
        console.log('[OPC UA Client] Closing session...');
        await this.session.close();
        this.session = null;
      }

      if (this.client) {
        console.log('[OPC UA Client] Disconnecting...');
        await this.client.disconnect();
        this.client = null;
      }

      this.isConnected = false;
      console.log('[OPC UA Client] Disconnected successfully');
      this.emit('disconnected');
    } catch (error) {
      console.error('[OPC UA Client] Error during disconnect:', error);
    }
  }

  getStatus() {
    const status = {
      isConnected: this.isConnected,
      monitoredItems: this.monitoredItems.size,
      hasSession: !!this.session,
      hasSubscription: !!this.subscription,
      useBatchProcessing: this.useBatchProcessing,
      enableSimulation: this.enableSimulation
    };

    if (this.batchProcessor) {
      status.batchProcessor = this.batchProcessor.getStats();
    }

    if (this.simulationManager) {
      status.simulation = this.simulationManager.getStatus();
    }

    return status;
  }

  getBatchStats() {
    if (this.batchProcessor) {
      return this.batchProcessor.getStats();
    }
    return null;
  }

  getSimulationStatus() {
    if (this.simulationManager) {
      return this.simulationManager.getStatus();
    }
    return null;
  }

  manualStartSimulation() {
    if (this.simulationManager) {
      return this.simulationManager.manualStartSimulation();
    }
    return false;
  }

  manualStopSimulation() {
    if (this.simulationManager) {
      return this.simulationManager.manualStopSimulation();
    }
    return false;
  }

  getTagPredictionStats(plcId, tagName) {
    if (this.simulationManager) {
      return this.simulationManager.getTagPredictionStats(plcId, tagName);
    }
    return null;
  }
}

const opcuaClient = new OpcUaClient();

module.exports = opcuaClient;
module.exports.OpcUaClient = OpcUaClient;
