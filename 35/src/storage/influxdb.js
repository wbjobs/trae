const Influx = require('influx');
const config = require('../config/config');

class InfluxDBStorage {
  constructor() {
    this.client = null;
    this.connected = false;
    this.memoryStorage = [];
    this.maxMemoryPoints = 10000;
    this.useMemoryFallback = true;
    this.init();
  }

  init() {
    try {
      this.client = new Influx.InfluxDB({
        host: config.influxdb.host,
        port: config.influxdb.port,
        database: config.influxdb.database,
        username: config.influxdb.username,
        password: config.influxdb.password
      });
      
      this.testConnection();
    } catch (error) {
      console.warn('[InfluxDB] Initialization failed, using memory fallback:', error.message);
      this.useMemoryFallback = true;
    }
  }

  async testConnection() {
    try {
      const databases = await this.client.getDatabaseNames();
      if (!databases.includes(config.influxdb.database)) {
        console.log(`[InfluxDB] Database ${config.influxdb.database} not found, creating...`);
        await this.client.createDatabase(config.influxdb.database);
      }
      this.connected = true;
      this.useMemoryFallback = false;
      console.log('[InfluxDB] Connected successfully');
    } catch (error) {
      console.warn('[InfluxDB] Connection failed, using memory fallback:', error.message);
      this.connected = false;
      this.useMemoryFallback = true;
    }
  }

  async writePoint(measurement, tags, fields, timestamp = new Date()) {
    const point = {
      measurement,
      tags,
      fields,
      timestamp
    };

    if (this.useMemoryFallback) {
      this.memoryStorage.push(point);
      if (this.memoryStorage.length > this.maxMemoryPoints) {
        this.memoryStorage.shift();
      }
      return;
    }

    try {
      await this.client.writePoints([
        {
          measurement,
          tags,
          fields,
          timestamp
        }
      ]);
    } catch (error) {
      console.warn('[InfluxDB] Write failed, falling back to memory:', error.message);
      this.memoryStorage.push(point);
      if (this.memoryStorage.length > this.maxMemoryPoints) {
        this.memoryStorage.shift();
      }
    }
  }

  async writePlcData(plcId, tagName, value, timestamp = new Date()) {
    const tags = { plcId, tagName };
    const fields = { value: parseFloat(value) };
    await this.writePoint('plc_data', tags, fields, timestamp);
  }

  async writeAlert(alertData) {
    const tags = {
      plcId: alertData.plcId,
      tagName: alertData.tagName,
      ruleId: alertData.ruleId,
      severity: alertData.severity,
      type: alertData.type
    };
    const fields = {
      value: parseFloat(alertData.value),
      threshold: parseFloat(alertData.threshold || 0),
      description: alertData.description
    };
    await this.writePoint('alerts', tags, fields, alertData.timestamp || new Date());
  }

  async queryPlcData(plcId, tagName, startTime, endTime, limit = 1000) {
    if (this.useMemoryFallback) {
      return this.queryMemoryData(plcId, tagName, startTime, endTime, limit);
    }

    try {
      const query = `
        SELECT value, time
        FROM plc_data
        WHERE plcId = '${plcId}' 
        AND tagName = '${tagName}'
        AND time >= '${startTime.toISOString()}'
        AND time <= '${endTime.toISOString()}'
        ORDER BY time ASC
        LIMIT ${limit}
      `;
      
      const results = await this.client.query(query);
      return results.map(row => ({
        value: row.value,
        timestamp: row.time
      }));
    } catch (error) {
      console.error('[InfluxDB] Query failed:', error.message);
      return this.queryMemoryData(plcId, tagName, startTime, endTime, limit);
    }
  }

  queryMemoryData(plcId, tagName, startTime, endTime, limit = 1000) {
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();
    
    const filtered = this.memoryStorage
      .filter(point => 
        point.measurement === 'plc_data' &&
        point.tags.plcId === plcId &&
        point.tags.tagName === tagName &&
        point.timestamp.getTime() >= startMs &&
        point.timestamp.getTime() <= endMs
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(-limit)
      .map(point => ({
        value: point.fields.value,
        timestamp: point.timestamp
      }));
    
    return filtered;
  }

  async queryLatestData(plcId, tagName) {
    if (this.useMemoryFallback) {
      const data = this.memoryStorage
        .filter(point => 
          point.measurement === 'plc_data' &&
          point.tags.plcId === plcId &&
          point.tags.tagName === tagName
        )
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 1);
      
      return data.length > 0 ? {
        value: data[0].fields.value,
        timestamp: data[0].timestamp
      } : null;
    }

    try {
      const query = `
        SELECT value, time
        FROM plc_data
        WHERE plcId = '${plcId}' 
        AND tagName = '${tagName}'
        ORDER BY time DESC
        LIMIT 1
      `;
      
      const results = await this.client.query(query);
      return results.length > 0 ? {
        value: results[0].value,
        timestamp: results[0].time
      } : null;
    } catch (error) {
      console.error('[InfluxDB] Query latest failed:', error.message);
      return null;
    }
  }

  async queryAlerts(startTime, endTime, severity = null, limit = 100) {
    if (this.useMemoryFallback) {
      return this.queryMemoryAlerts(startTime, endTime, severity, limit);
    }

    try {
      let severityFilter = '';
      if (severity) {
        severityFilter = `AND severity = '${severity}'`;
      }
      
      const query = `
        SELECT *
        FROM alerts
        WHERE time >= '${startTime.toISOString()}'
        AND time <= '${endTime.toISOString()}'
        ${severityFilter}
        ORDER BY time DESC
        LIMIT ${limit}
      `;
      
      const results = await this.client.query(query);
      return results.map(row => ({
        plcId: row.plcId,
        tagName: row.tagName,
        ruleId: row.ruleId,
        severity: row.severity,
        type: row.type,
        value: row.value,
        threshold: row.threshold,
        description: row.description,
        timestamp: row.time
      }));
    } catch (error) {
      console.error('[InfluxDB] Query alerts failed:', error.message);
      return this.queryMemoryAlerts(startTime, endTime, severity, limit);
    }
  }

  queryMemoryAlerts(startTime, endTime, severity = null, limit = 100) {
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();
    
    const filtered = this.memoryStorage
      .filter(point => {
        if (point.measurement !== 'alerts') return false;
        if (severity && point.tags.severity !== severity) return false;
        const ts = point.timestamp.getTime();
        return ts >= startMs && ts <= endMs;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map(point => ({
        plcId: point.tags.plcId,
        tagName: point.tags.tagName,
        ruleId: point.tags.ruleId,
        severity: point.tags.severity,
        type: point.tags.type,
        value: point.fields.value,
        threshold: point.fields.threshold,
        description: point.fields.description,
        timestamp: point.timestamp
      }));
    
    return filtered;
  }

  async queryAggregatedData(plcId, tagName, startTime, endTime, aggregation = 'mean', window = '1m') {
    if (this.useMemoryFallback) {
      return this.queryMemoryAggregated(plcId, tagName, startTime, endTime, aggregation);
    }

    try {
      const query = `
        SELECT ${aggregation}(value) as value
        FROM plc_data
        WHERE plcId = '${plcId}' 
        AND tagName = '${tagName}'
        AND time >= '${startTime.toISOString()}'
        AND time <= '${endTime.toISOString()}'
        GROUP BY time(${window})
        ORDER BY time ASC
      `;
      
      const results = await this.client.query(query);
      return results
        .filter(row => row.value !== null)
        .map(row => ({
          value: row.value,
          timestamp: row.time
        }));
    } catch (error) {
      console.error('[InfluxDB] Aggregation query failed:', error.message);
      return this.queryMemoryAggregated(plcId, tagName, startTime, endTime, aggregation);
    }
  }

  queryMemoryAggregated(plcId, tagName, startTime, endTime, aggregation) {
    const data = this.queryMemoryData(plcId, tagName, startTime, endTime, 10000);
    
    if (data.length === 0) return [];
    
    const values = data.map(d => d.value);
    let aggregatedValue;
    
    switch (aggregation) {
      case 'mean':
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      default:
        aggregatedValue = values[values.length - 1];
    }
    
    return [{
      value: aggregatedValue,
      timestamp: data[data.length - 1].timestamp
    }];
  }

  getStatus() {
    return {
      connected: this.connected,
      useMemoryFallback: this.useMemoryFallback,
      memoryPoints: this.memoryStorage.length,
      maxMemoryPoints: this.maxMemoryPoints
    };
  }
}

const influxStorage = new InfluxDBStorage();

module.exports = influxStorage;
module.exports.InfluxDBStorage = InfluxDBStorage;
