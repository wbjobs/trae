const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('../config/config');
const influxStorage = require('../storage/influxdb');
const opcuaClient = require('../opcua/client');
const alertEngine = require('../alert/alertEngine');

class ApiServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.clients = new Set();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../public')));
  }

  setupRoutes() {
    this.app.get('/api/devices', (req, res) => {
      res.json(config.plcDevices);
    });

    this.app.get('/api/devices/:plcId/tags/:tagName/data', async (req, res) => {
      try {
        const { plcId, tagName } = req.params;
        const { startTime, endTime, limit } = req.query;
        
        const start = startTime ? new Date(startTime) : new Date(Date.now() - 3600000);
        const end = endTime ? new Date(endTime) : new Date();
        const dataLimit = limit ? parseInt(limit) : 1000;
        
        const data = await influxStorage.queryPlcData(plcId, tagName, start, end, dataLimit);
        
        res.json({
          success: true,
          data: data.map(d => ({
            value: d.value,
            timestamp: d.timestamp instanceof Date ? d.timestamp.toISOString() : d.timestamp
          }))
        });
      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/devices/:plcId/tags/:tagName/latest', async (req, res) => {
      try {
        const { plcId, tagName } = req.params;
        const data = await influxStorage.queryLatestData(plcId, tagName);
        
        res.json({
          success: true,
          data: data ? {
            value: data.value,
            timestamp: data.timestamp instanceof Date ? data.timestamp.toISOString() : data.timestamp
          } : null
        });
      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/data/query', async (req, res) => {
      try {
        const { plcId, tagName, startTime, endTime, aggregation, window, limit } = req.query;
        
        const start = startTime ? new Date(startTime) : new Date(Date.now() - 3600000);
        const end = endTime ? new Date(endTime) : new Date();
        
        let data;
        if (aggregation) {
          data = await influxStorage.queryAggregatedData(
            plcId, tagName, start, end, aggregation, window || '1m'
          );
        } else {
          const dataLimit = limit ? parseInt(limit) : 1000;
          data = await influxStorage.queryPlcData(plcId, tagName, start, end, dataLimit);
        }
        
        res.json({
          success: true,
          data: data.map(d => ({
            value: d.value,
            timestamp: d.timestamp instanceof Date ? d.timestamp.toISOString() : d.timestamp
          }))
        });
      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/alerts', async (req, res) => {
      try {
        const { startTime, endTime, severity, limit } = req.query;
        
        const start = startTime ? new Date(startTime) : new Date(Date.now() - 86400000);
        const end = endTime ? new Date(endTime) : new Date();
        const dataLimit = limit ? parseInt(limit) : 100;
        
        const alerts = await influxStorage.queryAlerts(start, end, severity, dataLimit);
        
        res.json({
          success: true,
          data: alerts
        });
      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/alerts/active', (req, res) => {
      res.json({
        success: true,
        data: alertEngine.getActiveAlerts()
      });
    });

    this.app.get('/api/rules', (req, res) => {
      res.json({
        success: true,
        data: alertEngine.getRules()
      });
    });

    this.app.post('/api/rules', (req, res) => {
      try {
        const rule = req.body;
        if (!rule.id || !rule.plcId || !rule.tag || !rule.type) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        alertEngine.addRule(rule);
        res.json({ success: true, data: rule });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.delete('/api/rules/:ruleId', (req, res) => {
      try {
        alertEngine.removeRule(req.params.ruleId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/status', (req, res) => {
      res.json({
        success: true,
        data: {
          opcua: opcuaClient.getStatus(),
          influxdb: influxStorage.getStatus(),
          alerts: {
            active: alertEngine.getActiveAlerts().length,
            totalRules: alertEngine.getRules().length
          },
          websocket: {
            connectedClients: this.clients.size
          }
        }
      });
    });

    this.app.get('/api/current-values', (req, res) => {
      res.json({
        success: true,
        data: alertEngine.getAllCurrentValues()
      });
    });

    this.app.get('/api/simulation/status', (req, res) => {
      res.json({
        success: true,
        data: opcuaClient.getSimulationStatus()
      });
    });

    this.app.post('/api/simulation/start', (req, res) => {
      const success = opcuaClient.manualStartSimulation();
      res.json({
        success,
        message: success ? 'Simulation started' : 'Simulation already active'
      });
    });

    this.app.post('/api/simulation/stop', (req, res) => {
      const success = opcuaClient.manualStopSimulation();
      res.json({
        success,
        message: success ? 'Simulation stopped' : 'Simulation not active'
      });
    });

    this.app.get('/api/simulation/prediction/:plcId/:tagName', (req, res) => {
      const { plcId, tagName } = req.params;
      const stats = opcuaClient.getTagPredictionStats(plcId, tagName);
      res.json({
        success: true,
        data: stats
      });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('[WebSocket] New client connected');
      this.clients.add(ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (e) {
          console.error('[WebSocket] Invalid message:', message);
        }
      });

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        this.clients.delete(ws);
      });
    });

    console.log('[WebSocket] Server initialized');
  }

  broadcastData(type, payload) {
    const message = JSON.stringify({
      type,
      data: payload,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  broadcastPlcData(plcId, tagName, value, timestamp) {
    this.broadcastData('plc_data', {
      plcId,
      tagName,
      value,
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp
    });
  }

  broadcastAlert(alert) {
    this.broadcastData('alert', alert);
  }

  start() {
    this.server.listen(config.api.port, () => {
      console.log(`[API Server] Started on port ${config.api.port}`);
      console.log(`[API Server] Web dashboard: http://localhost:${config.api.port}`);
    });
  }

  stop() {
    this.wss.close();
    this.server.close();
    console.log('[API Server] Stopped');
  }
}

const apiServer = new ApiServer();

module.exports = apiServer;
module.exports.ApiServer = ApiServer;
