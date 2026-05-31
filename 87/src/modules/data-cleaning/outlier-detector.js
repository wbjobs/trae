export class OutlierDetector {
  constructor(options = {}) {
    this.method = options.method || 'iqr';
    this.threshold = options.threshold || 2.5;
    this.iqrMultiplier = options.iqrMultiplier || 1.5;
    this.windowSize = options.windowSize || 30;
  }

  detect(data, valueField = 'runoff_value') {
    if (!data || data.length === 0) return [];

    const values = data.map(d => d[valueField]);
    let flags;

    switch (this.method) {
      case 'z-score':
        flags = this.zScoreMethod(values);
        break;
      case 'iqr':
        flags = this.iqrMethod(values);
        break;
      case 'modified-z-score':
        flags = this.modifiedZScoreMethod(values);
        break;
      case 'rolling-z-score':
        flags = this.rollingZScoreMethod(values, this.windowSize);
        break;
      default:
        flags = this.iqrMethod(values);
    }

    return data.map((d, i) => ({
      ...d,
      _isOutlier: flags[i],
      _outlierMethod: this.method
    }));
  }

  zScoreMethod(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
    return values.map(v => Math.abs((v - mean) / std) > this.threshold);
  }

  iqrMethod(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q3 = this.percentile(sorted, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - this.iqrMultiplier * iqr;
    const upperBound = q3 + this.iqrMultiplier * iqr;
    return values.map(v => v < lowerBound || v > upperBound);
  }

  modifiedZScoreMethod(values) {
    const median = this.median(values);
    const mad = this.median(values.map(v => Math.abs(v - median)));
    const threshold = this.threshold * 1.4826;
    return values.map(v => Math.abs(0.6745 * (v - median) / mad) > threshold);
  }

  rollingZScoreMethod(values, windowSize) {
    const n = values.length;
    const flags = new Array(n).fill(false);

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(n - 1, i + windowSize);
      const window = values.slice(start, end + 1);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const std = Math.sqrt(window.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / window.length);
      const zScore = std > 0 ? Math.abs((values[i] - mean) / std) : 0;
      flags[i] = zScore > this.threshold;
    }

    return flags;
  }

  percentile(sorted, p) {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  removeOutliers(data, valueField = 'runoff_value') {
    const detected = this.detect(data, valueField);
    return detected.filter(d => !d._isOutlier);
  }

  replaceOutliers(data, valueField = 'runoff_value', method = 'median') {
    const detected = this.detect(data, valueField);
    const values = detected.filter(d => !d._isOutlier).map(d => d[valueField]);
    let replacementValue;

    switch (method) {
      case 'median':
        replacementValue = this.median(values);
        break;
      case 'mean':
        replacementValue = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      default:
        replacementValue = this.median(values);
    }

    return detected.map(d => ({
      ...d,
      [valueField]: d._isOutlier ? replacementValue : d[valueField],
      _outlierReplaced: d._isOutlier
    }));
  }
}

export default OutlierDetector;
