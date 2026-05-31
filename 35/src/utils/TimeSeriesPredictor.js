class TimeSeriesPredictor {
  constructor(options = {}) {
    this.minDataPoints = options.minDataPoints || 10;
    this.maxDataPoints = options.maxDataPoints || 1000;
    this.dataStore = new Map();
  }

  addDataPoint(key, timestamp, value) {
    if (!this.dataStore.has(key)) {
      this.dataStore.set(key, []);
    }
    
    const series = this.dataStore.get(key);
    const timeMs = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
    
    series.push({ time: timeMs, value });
    
    if (series.length > this.maxDataPoints) {
      series.shift();
    }
  }

  addBatchDataPoints(key, dataPoints) {
    for (const point of dataPoints) {
      this.addDataPoint(key, point.timestamp, point.value);
    }
  }

  linearRegression(key) {
    const series = this.dataStore.get(key);
    if (!series || series.length < this.minDataPoints) {
      return null;
    }

    const n = series.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    const firstTime = series[0].time;
    
    for (let i = 0; i < n; i++) {
      const x = (series[i].time - firstTime) / 1000;
      const y = series[i].value;
      
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = (n * sumXX - sumX * sumX);
    if (Math.abs(denominator) < 0.0001) {
      return {
        slope: 0,
        intercept: sumY / n,
        rSquared: 1,
        n,
        firstTime
      };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    let ssTotal = 0;
    let ssResidual = 0;
    const meanY = sumY / n;
    
    for (let i = 0; i < n; i++) {
      const x = (series[i].time - firstTime) / 1000;
      const y = series[i].value;
      const predictedY = slope * x + intercept;
      
      ssTotal += Math.pow(y - meanY, 2);
      ssResidual += Math.pow(y - predictedY, 2);
    }

    const rSquared = ssTotal === 0 ? 1 : (1 - ssResidual / ssTotal);

    return {
      slope,
      intercept,
      rSquared,
      n,
      firstTime
    };
  }

  predictNext(key, timeOffsetMs = 1000, noiseLevel = 0.05) {
    const model = this.linearRegression(key);
    if (!model) {
      const series = this.dataStore.get(key);
      if (series && series.length > 0) {
        return series[series.length - 1].value;
      }
      return 0;
    }

    const now = Date.now();
    const x = (now - model.firstTime) / 1000 + (timeOffsetMs / 1000);
    const baseValue = model.slope * x + model.intercept;
    
    const series = this.dataStore.get(key);
    const values = series.map(s => s.value);
    const stdDev = this.calculateStdDev(values);
    const noise = (Math.random() - 0.5) * 2 * stdDev * noiseLevel;
    
    let predictedValue = baseValue + noise;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const clampedMin = min - range * 0.2;
    const clampedMax = max + range * 0.2;
    
    predictedValue = Math.max(clampedMin, Math.min(clampedMax, predictedValue));
    
    return predictedValue;
  }

  predictBatch(key, count = 10, intervalMs = 1000, noiseLevel = 0.05) {
    const predictions = [];
    const model = this.linearRegression(key);
    
    if (!model) {
      const series = this.dataStore.get(key);
      if (series && series.length > 0) {
        const lastValue = series[series.length - 1].value;
        for (let i = 0; i < count; i++) {
          predictions.push({
            time: Date.now() + i * intervalMs,
            value: lastValue
          });
        }
      }
      return predictions;
    }

    const now = Date.now();
    const series = this.dataStore.get(key);
    const values = series.map(s => s.value);
    const stdDev = this.calculateStdDev(values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const clampedMin = min - range * 0.2;
    const clampedMax = max + range * 0.2;

    for (let i = 0; i < count; i++) {
      const time = now + i * intervalMs;
      const x = (time - model.firstTime) / 1000;
      const baseValue = model.slope * x + model.intercept;
      const noise = (Math.random() - 0.5) * 2 * stdDev * noiseLevel;
      
      let value = baseValue + noise;
      value = Math.max(clampedMin, Math.min(clampedMax, value));
      
      predictions.push({ time, value });
    }

    return predictions;
  }

  calculateStdDev(values) {
    if (values.length < 2) return 0;
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(avgSquaredDiff);
  }

  getPredictionConfidence(key) {
    const model = this.linearRegression(key);
    if (!model) return 0;
    return Math.max(0, Math.min(1, model.rSquared));
  }

  hasEnoughData(key) {
    const series = this.dataStore.get(key);
    return series && series.length >= this.minDataPoints;
  }

  getDataStats(key) {
    const series = this.dataStore.get(key);
    if (!series || series.length === 0) return null;
    
    const values = series.map(s => s.value);
    return {
      count: series.length,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      stdDev: this.calculateStdDev(values),
      timeSpan: series[series.length - 1].time - series[0].time
    };
  }

  clearData(key) {
    if (key) {
      this.dataStore.delete(key);
    } else {
      this.dataStore.clear();
    }
  }

  getAllKeys() {
    return Array.from(this.dataStore.keys());
  }
}

module.exports = TimeSeriesPredictor;
