const WebSocket = require('ws');

class WebSocketServer {
  constructor(config) {
    this.port = config.port || 8080;
    this.wss = null;
    this.clients = new Set();
    this.recentStats = [];
    this.recentAlerts = [];
    this.maxStatsHistory = config.maxDataPoints || 100;
    this.maxAlertHistory = config.maxAlerts || 50;
    this.transactionRate = 0;
    this.transactionCount = 0;
    this.lastRateUpdate = Date.now();
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', (ws) => {
          console.log(`[WebSocket] New client connected. Total: ${this.clients.size + 1}`);
          this.clients.add(ws);

          const initMessage = {
            type: 'INIT',
            data: {
              stats: this.recentStats,
              alerts: this.recentAlerts,
              currentRate: this.transactionRate
            }
          };
          ws.send(JSON.stringify(initMessage));

          ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`[WebSocket] Client disconnected. Total: ${this.clients.size}`);
          });

          ws.on('error', (error) => {
            console.error('[WebSocket] Client error:', error.message);
            this.clients.delete(ws);
          });

          ws.on('message', (message) => {
            try {
              const data = JSON.parse(message.toString());
              if (data.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
              }
            } catch (e) {
              console.warn('[WebSocket] Invalid message received');
            }
          });
        });

        this.wss.on('listening', () => {
          console.log(`[WebSocket] Server running on port ${this.port}`);
          resolve();
        });

        this.wss.on('error', (error) => {
          console.error('[WebSocket] Server error:', error.message);
          reject(error);
        });

        setInterval(() => this.updateTransactionRate(), 1000);

      } catch (error) {
        reject(error);
      }
    });
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, (error) => {
          if (error) {
            console.error('[WebSocket] Broadcast error:', error.message);
          }
        });
      }
    }
  }

  sendStats(stats) {
    this.recentStats.push(stats);
    if (this.recentStats.length > this.maxStatsHistory) {
      this.recentStats.shift();
    }

    this.broadcast({
      type: 'STATS_UPDATE',
      data: stats
    });
  }

  sendAlert(alert) {
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > this.maxAlertHistory) {
      this.recentAlerts.pop();
    }

    this.broadcast({
      type: 'ALERT',
      data: alert
    });

    console.log(`[WebSocket] Alert broadcasted: ${alert.id} (${alert.severity})`);
  }

  updateTransactionCount(count) {
    this.transactionCount += count;
  }

  updateTransactionRate() {
    const now = Date.now();
    const elapsed = (now - this.lastRateUpdate) / 1000;

    if (elapsed > 0) {
      this.transactionRate = Math.round(this.transactionCount / elapsed);
      this.transactionCount = 0;
      this.lastRateUpdate = now;

      this.broadcast({
        type: 'RATE_UPDATE',
        data: {
          rate: this.transactionRate,
          timestamp: now
        }
      });
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.wss) {
        for (const client of this.clients) {
          client.close();
        }
        this.wss.close(() => {
          console.log('[WebSocket] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = WebSocketServer;
