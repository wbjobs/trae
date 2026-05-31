const stats = require('stats-lite');

class StreamProcessor {
  constructor(config) {
    this.windowSizeMs = (config.windowSizeSeconds || 10) * 1000;
    this.sigmaThreshold = config.sigmaThreshold || 3;
    this.allowedLatenessMs = (config.allowedLatenessSeconds || 5) * 1000;
    this.rootCauseAnalysisWindowMs = (config.rootCauseAnalysisWindowSeconds || 10) * 1000;
    this.windows = new Map();
    this.historicalStats = [];
    this.maxHistoryWindows = 10;
    this.onAlertCallback = null;
    this.onStatsCallback = null;
    this.onRootCauseAnalysisCallback = null;
    this.lastWindowEnd = 0;

    this.currentWatermark = 0;
    this.maxObservedTimestamp = 0;
    this.totalDroppedMessages = 0;
    this.lastWatermarkUpdate = 0;

    this.recentTransactions = [];
    this.maxRecentTransactions = 50000;
  }

  setOnAlertCallback(callback) {
    this.onAlertCallback = callback;
  }

  setOnStatsCallback(callback) {
    this.onStatsCallback = callback;
  }

  setOnRootCauseAnalysisCallback(callback) {
    this.onRootCauseAnalysisCallback = callback;
  }

  getWatermark() {
    return this.currentWatermark;
  }

  updateWatermark(eventTimestamp) {
    if (eventTimestamp > this.maxObservedTimestamp) {
      this.maxObservedTimestamp = eventTimestamp;
    }

    const newWatermark = this.maxObservedTimestamp - this.allowedLatenessMs;

    if (newWatermark > this.currentWatermark) {
      this.currentWatermark = newWatermark;
      this.lastWatermarkUpdate = Date.now();
      return true;
    }
    return false;
  }

  processMessages(messages) {
    const processingTime = Date.now();
    let watermarkAdvanced = false;

    for (const msg of messages) {
      const eventTimestamp = msg.timestamp || processingTime;
      const amount = msg.amount;

      if (typeof amount !== 'number' || isNaN(amount)) {
        continue;
      }

      if (eventTimestamp < this.currentWatermark) {
        this.totalDroppedMessages++;
        if (this.totalDroppedMessages % 1000 === 0) {
          console.warn(`[Stream] Dropped ${this.totalDroppedMessages} late messages. ` +
            `Watermark: ${new Date(this.currentWatermark).toISOString()}, ` +
            `Event time: ${new Date(eventTimestamp).toISOString()}`);
        }
        continue;
      }

      watermarkAdvanced = this.updateWatermark(eventTimestamp) || watermarkAdvanced;

      const windowStart = Math.floor(eventTimestamp / this.windowSizeMs) * this.windowSizeMs;

      const transactionData = {
        amount,
        timestamp: eventTimestamp,
        transactionId: msg.transactionId,
        userId: msg.userId,
        merchant: msg.merchant,
        region: msg.region,
        deviceType: msg.deviceType
      };

      if (!this.windows.has(windowStart)) {
        this.windows.set(windowStart, []);
      }
      this.windows.get(windowStart).push(transactionData);

      this.recentTransactions.push(transactionData);
    }

    this.cleanOldTransactions();

    if (watermarkAdvanced || processingTime - this.lastWatermarkUpdate > 1000) {
      this.checkWindowsByWatermark();
    }
  }

  cleanOldTransactions() {
    const cutoffTime = Date.now() - (this.rootCauseAnalysisWindowMs + this.windowSizeMs + this.allowedLatenessMs);
    while (this.recentTransactions.length > 0 && this.recentTransactions[0].timestamp < cutoffTime) {
      this.recentTransactions.shift();
    }
    if (this.recentTransactions.length > this.maxRecentTransactions) {
      this.recentTransactions = this.recentTransactions.slice(-this.maxRecentTransactions);
    }
  }

  checkWindowsByWatermark() {
    const windowsToClose = [];

    for (const [windowStart, data] of this.windows.entries()) {
      const windowEnd = windowStart + this.windowSizeMs;

      if (windowEnd <= this.currentWatermark) {
        windowsToClose.push([windowStart, data]);
      }
    }

    for (const [windowStart, data] of windowsToClose) {
      this.processClosedWindow(windowStart, data);
      this.windows.delete(windowStart);
    }

    if (windowsToClose.length > 0) {
      console.log(`[Stream] Closed ${windowsToClose.length} windows. ` +
        `Watermark: ${new Date(this.currentWatermark).toISOString()}`);
    }
  }

  async processClosedWindow(windowStart, data) {
    if (data.length === 0) return;

    const amounts = data.map(d => d.amount);
    const windowMean = stats.mean(amounts);
    const windowStddev = stats.stdev(amounts);
    const windowCount = data.length;
    const windowEnd = windowStart + this.windowSizeMs;

    const statsPoint = {
      timestamp: windowEnd,
      mean: windowMean,
      stddev: windowStddev,
      count: windowCount,
      min: Math.min(...amounts),
      max: Math.max(...amounts)
    };

    this.historicalStats.push(statsPoint);
    if (this.historicalStats.length > this.maxHistoryWindows) {
      this.historicalStats.shift();
    }

    if (this.historicalStats.length >= 3) {
      const means = this.historicalStats.map(s => s.mean);
      const globalMean = stats.mean(means);
      const globalStddev = stats.stdev(means);

      if (globalStddev > 0) {
        const upperBound = globalMean + this.sigmaThreshold * globalStddev;
        const lowerBound = globalMean - this.sigmaThreshold * globalStddev;

        if (windowMean > upperBound || windowMean < lowerBound) {
          const anomalies = data.filter(d => {
            const zScore = globalStddev > 0 ? (d.amount - globalMean) / globalStddev : 0;
            return Math.abs(zScore) > this.sigmaThreshold;
          });

          if (anomalies.length > 0) {
            const alert = {
              id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: windowEnd,
              type: 'ANOMALY_DETECTED',
              severity: windowMean > upperBound ? 'HIGH' : 'MEDIUM',
              windowStart: windowStart,
              windowEnd: windowEnd,
              windowMean: windowMean,
              globalMean: globalMean,
              globalStddev: globalStddev,
              upperBound: upperBound,
              lowerBound: lowerBound,
              sigmaThreshold: this.sigmaThreshold,
              anomalyCount: anomalies.length,
              totalTransactions: windowCount,
              anomalies: anomalies.map(a => ({
                transactionId: a.transactionId,
                amount: a.amount,
                timestamp: a.timestamp,
                userId: a.userId,
                merchant: a.merchant,
                region: a.region,
                deviceType: a.deviceType,
                zScore: globalStddev > 0 ? (a.amount - globalMean) / globalStddev : 0
              }))
            };

            if (this.onRootCauseAnalysisCallback) {
              try {
                const rootCauseResult = await this.performRootCauseAnalysis(anomalies, windowStart, windowEnd);
                if (rootCauseResult) {
                  alert.rootCauseAnalysis = rootCauseResult;
                }
              } catch (error) {
                console.error('[Stream] Root cause analysis error:', error.message);
              }
            }

            if (this.onAlertCallback) {
              this.onAlertCallback(alert);
            }
          }
        }
      }
    }

    if (this.onStatsCallback) {
      this.onStatsCallback(statsPoint);
    }

    console.log(`[Stream] Window ${new Date(windowStart).toISOString()} - ` +
      `Count: ${windowCount}, Mean: ${windowMean.toFixed(2)}, StdDev: ${windowStddev.toFixed(2)}`);
  }

  async performRootCauseAnalysis(anomalies, windowStart, windowEnd) {
    if (!this.onRootCauseAnalysisCallback) {
      return null;
    }

    const analysisStart = windowStart - this.rootCauseAnalysisWindowMs;

    const relevantTransactions = this.recentTransactions.filter(tx =>
      tx.timestamp >= analysisStart && tx.timestamp <= windowEnd
    );

    return await this.onRootCauseAnalysisCallback(anomalies, relevantTransactions, windowStart, windowEnd);
  }

  getCurrentStats() {
    const now = Date.now();
    const latestWindowStart = this.getLatestWindowStart();

    if (latestWindowStart === null) {
      return null;
    }

    const currentData = this.windows.get(latestWindowStart) || [];

    if (currentData.length === 0) {
      return null;
    }

    const amounts = currentData.map(d => d.amount);
    return {
      timestamp: now,
      mean: stats.mean(amounts),
      stddev: stats.stdev(amounts),
      count: currentData.length,
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      isPartial: true,
      watermark: this.currentWatermark
    };
  }

  getLatestWindowStart() {
    if (this.windows.size === 0) {
      return null;
    }

    let maxStart = -Infinity;
    for (const windowStart of this.windows.keys()) {
      if (windowStart > maxStart) {
        maxStart = windowStart;
      }
    }
    return maxStart;
  }

  getStatus() {
    return {
      watermark: this.currentWatermark,
      maxObservedTimestamp: this.maxObservedTimestamp,
      openWindows: this.windows.size,
      totalDroppedMessages: this.totalDroppedMessages,
      allowedLatenessMs: this.allowedLatenessMs,
      windowSizeMs: this.windowSizeMs
    };
  }
}

module.exports = StreamProcessor;
