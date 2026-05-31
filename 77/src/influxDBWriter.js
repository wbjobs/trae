const { InfluxDB, Point } = require('@influxdata/influxdb-client');

class InfluxDBWriter {
  constructor(config) {
    this.url = config.url;
    this.token = config.token;
    this.org = config.org;
    this.bucket = config.bucket;
    this.enabled = config.enabled !== false;
    this.writeApi = null;
    this.queryApi = null;
    this.pendingPoints = [];
    this.batchSize = 100;
    this.flushInterval = null;

    if (this.enabled && this.url && this.token) {
      this.init();
    } else {
      console.warn('[InfluxDB] Disabled or missing configuration. Running in mock mode.');
    }
  }

  init() {
    try {
      const influxDB = new InfluxDB({ url: this.url, token: this.token });
      this.writeApi = influxDB.getWriteApi(this.org, this.bucket);
      this.writeApi.useDefaultTags({ service: 'trading-dashboard' });
      this.queryApi = influxDB.getQueryApi(this.org);
      console.log(`[InfluxDB] Connected to ${this.url}, bucket: ${this.bucket}`);

      this.flushInterval = setInterval(() => this.flush(), 5000);
    } catch (error) {
      console.error('[InfluxDB] Initialization error:', error.message);
      this.enabled = false;
    }
  }

  writeStats(stats) {
    if (!this.enabled) return;

    const point = new Point('transaction_stats')
      .floatField('mean', stats.mean)
      .floatField('stddev', stats.stddev)
      .intField('count', stats.count)
      .floatField('min', stats.min)
      .floatField('max', stats.max);

    if (stats.timestamp) {
      point.timestamp(new Date(stats.timestamp));
    }

    this.queuePoint(point);
  }

  writeAlert(alert) {
    if (!this.enabled) return;

    const point = new Point('anomaly_alerts')
      .tag('severity', alert.severity)
      .tag('type', alert.type)
      .stringField('alert_id', alert.id)
      .floatField('window_mean', alert.windowMean)
      .floatField('global_mean', alert.globalMean)
      .floatField('global_stddev', alert.globalStddev)
      .floatField('upper_bound', alert.upperBound)
      .floatField('lower_bound', alert.lowerBound)
      .floatField('sigma_threshold', alert.sigmaThreshold)
      .intField('anomaly_count', alert.anomalyCount)
      .intField('total_transactions', alert.totalTransactions)
      .intField('window_start', alert.windowStart)
      .intField('window_end', alert.windowEnd);

    if (alert.timestamp) {
      point.timestamp(new Date(alert.timestamp));
    }

    this.queuePoint(point);

    for (const anomaly of alert.anomalies) {
      const anomalyPoint = new Point('anomalous_transactions')
        .tag('alert_id', alert.id)
        .tag('severity', alert.severity)
        .stringField('transaction_id', anomaly.transactionId || '')
        .stringField('user_id', anomaly.userId || '')
        .stringField('merchant', anomaly.merchant || '')
        .floatField('amount', anomaly.amount)
        .floatField('z_score', anomaly.zScore);

      if (anomaly.timestamp) {
        anomalyPoint.timestamp(new Date(anomaly.timestamp));
      }

      this.queuePoint(anomalyPoint);
    }
  }

  writeTransaction(tx) {
    if (!this.enabled) return;

    const point = new Point('transactions')
      .stringField('transaction_id', tx.transactionId || '')
      .stringField('user_id', tx.userId || '')
      .stringField('merchant', tx.merchant || '')
      .floatField('amount', tx.amount);

    if (tx.timestamp) {
      point.timestamp(new Date(tx.timestamp));
    }

    this.queuePoint(point);
  }

  queuePoint(point) {
    if (!this.writeApi) return;

    this.pendingPoints.push(point);
    if (this.pendingPoints.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush() {
    if (!this.writeApi || this.pendingPoints.length === 0) return;

    try {
      this.writeApi.writePoints(this.pendingPoints);
      await this.writeApi.flush();
      console.log(`[InfluxDB] Flushed ${this.pendingPoints.length} points`);
      this.pendingPoints = [];
    } catch (error) {
      console.error('[InfluxDB] Flush error:', error.message);
    }
  }

  async close() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    if (this.writeApi) {
      try {
        await this.flush();
        await this.writeApi.close();
        console.log('[InfluxDB] Connection closed');
      } catch (error) {
        console.error('[InfluxDB] Close error:', error.message);
      }
    }
  }
}

module.exports = InfluxDBWriter;
