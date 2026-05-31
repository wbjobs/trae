import dayjs from 'dayjs';

export class StatisticsUtils {
  static sum(values) {
    return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }

  static mean(values) {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }

  static min(values) {
    if (values.length === 0) return 0;
    let min = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i] < min) min = values[i];
    }
    return min;
  }

  static max(values) {
    if (values.length === 0) return 0;
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i] > max) max = values[i];
    }
    return max;
  }

  static range(values) {
    return this.max(values) - this.min(values);
  }

  static median(values, preSorted = false) {
    if (values.length === 0) return 0;
    const sorted = preSorted ? values : [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  static variance(values, meanValue = null) {
    if (values.length === 0) return 0;
    const mean = meanValue !== null ? meanValue : this.mean(values);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += Math.pow(values[i] - mean, 2);
    }
    return sum / values.length;
  }

  static standardDeviation(values) {
    return Math.sqrt(this.variance(values));
  }

  static coefficientOfVariation(values) {
    const mean = this.mean(values);
    if (mean === 0) return 0;
    return this.standardDeviation(values) / mean;
  }

  static percentile(values, p, preSorted = false) {
    if (values.length === 0) return 0;
    const sorted = preSorted ? values : [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  static quantiles(values) {
    return {
      q1: this.percentile(values, 25),
      q2: this.median(values),
      q3: this.percentile(values, 75)
    };
  }

  static skew(values) {
    if (values.length < 3) return 0;
    const mean = this.mean(values);
    const std = this.standardDeviation(values);
    if (std === 0) return 0;
    const n = values.length;
    const cubedDiffs = values.map(v => Math.pow((v - mean) / std, 3));
    const sum = this.sum(cubedDiffs);
    return (n / ((n - 1) * (n - 2))) * sum;
  }

  static kurtosis(values) {
    if (values.length < 4) return 0;
    const mean = this.mean(values);
    const std = this.standardDeviation(values);
    if (std === 0) return 0;
    const n = values.length;
    const fourthDiffs = values.map(v => Math.pow((v - mean) / std, 4));
    const sum = this.sum(fourthDiffs);
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - 
           (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  }

  static covariance(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    const meanX = this.mean(x);
    const meanY = this.mean(y);
    const products = x.map((xi, i) => (xi - meanX) * (y[i] - meanY));
    return this.sum(products) / x.length;
  }

  static correlation(x, y) {
    const cov = this.covariance(x, y);
    const stdX = this.standardDeviation(x);
    const stdY = this.standardDeviation(y);
    if (stdX === 0 || stdY === 0) return 0;
    return cov / (stdX * stdY);
  }

  static autocorrelation(values, lag = 1) {
    if (values.length <= lag) return 0;
    const shifted = values.slice(lag);
    const original = values.slice(0, -lag);
    return this.correlation(original, shifted);
  }

  static movingAverage(values, windowSize) {
    const result = [];
    const halfWindow = Math.floor(windowSize / 2);
    
    for (let i = 0; i < values.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - halfWindow); j <= Math.min(values.length - 1, i + halfWindow); j++) {
        sum += values[j];
        count++;
      }
      result.push(sum / count);
    }
    return result;
  }

  static cumulativeSum(values) {
    const result = [];
    let sum = 0;
    for (const v of values) {
      sum += v;
      result.push(sum);
    }
    return result;
  }

  static rateOfChange(values) {
    if (values.length < 2) return [];
    const result = [0];
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      result.push(prev === 0 ? 0 : (values[i] - prev) / prev * 100);
    }
    return result;
  }

  static summary(values) {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        mean: 0,
        min: 0,
        max: 0,
        range: 0,
        median: 0,
        variance: 0,
        std: 0,
        cv: 0,
        q1: 0,
        q3: 0
      };
    }

    const count = values.length;
    const sum = this.sum(values);
    const mean = sum / count;
    const min = this.min(values);
    const max = this.max(values);
    const sorted = [...values].sort((a, b) => a - b);
    const median = this.median(sorted, true);
    const q1 = this.percentile(sorted, 25, true);
    const q3 = this.percentile(sorted, 75, true);
    const variance = this.variance(values, mean);
    const std = Math.sqrt(variance);
    const cv = mean === 0 ? 0 : std / mean;

    return {
      count,
      sum,
      mean,
      min,
      max,
      range: max - min,
      median,
      variance,
      std,
      cv,
      q1,
      q3
    };
  }
}

export default StatisticsUtils;
