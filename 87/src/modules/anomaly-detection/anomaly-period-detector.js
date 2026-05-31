import dayjs from 'dayjs';
import { StatisticsUtils } from '@utils/statistics.utils.js';
import { TimeSeriesUtils } from '@utils/time-series.utils.js';

export class AnomalyPeriodDetector {
  constructor(options = {}) {
    this.method = options.method || 'threshold';
    this.thresholdMultiplier = options.thresholdMultiplier || 2.0;
    this.minDuration = options.minDuration || 3;
    this.maxGap = options.maxGap || 2;
  }

  detectAnomalyPeriods(data, valueField = 'runoff_value', dateField = 'record_time') {
    if (!data || data.length === 0) return [];

    const sorted = [...data].sort((a, b) => new Date(a[dateField]) - new Date(b[dateField]));
    const values = sorted.map(d => d[valueField]);
    const anomalyFlags = this.detectAnomalies(values);

    const periods = this.groupAnomalyPeriods(sorted, anomalyFlags, dateField);
    
    return periods.map(period => this.enrichPeriod(period, valueField, dateField));
  }

  detectAnomalies(values) {
    switch (this.method) {
      case 'threshold':
        return this.thresholdMethod(values);
      case 'iqr':
        return this.iqrMethod(values);
      case 'z-score':
        return this.zScoreMethod(values);
      default:
        return this.thresholdMethod(values);
    }
  }

  thresholdMethod(values) {
    const mean = StatisticsUtils.mean(values);
    const std = StatisticsUtils.standardDeviation(values);
    const upperThreshold = mean + this.thresholdMultiplier * std;
    const lowerThreshold = mean - this.thresholdMultiplier * std;
    
    return values.map(v => v > upperThreshold || v < lowerThreshold);
  }

  iqrMethod(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = StatisticsUtils.percentile(sorted, 25);
    const q3 = StatisticsUtils.percentile(sorted, 75);
    const iqr = q3 - q1;
    const upperThreshold = q3 + this.thresholdMultiplier * iqr;
    const lowerThreshold = q1 - this.thresholdMultiplier * iqr;
    
    return values.map(v => v > upperThreshold || v < lowerThreshold);
  }

  zScoreMethod(values) {
    const mean = StatisticsUtils.mean(values);
    const std = StatisticsUtils.standardDeviation(values);
    
    return values.map(v => {
      const zScore = std > 0 ? Math.abs((v - mean) / std) : 0;
      return zScore > this.thresholdMultiplier;
    });
  }

  groupAnomalyPeriods(sortedData, anomalyFlags, dateField) {
    const periods = [];
    let currentPeriod = null;
    let gapCount = 0;

    for (let i = 0; i < sortedData.length; i++) {
      if (anomalyFlags[i]) {
        if (!currentPeriod) {
          currentPeriod = {
            startIndex: i,
            endIndex: i,
            data: [sortedData[i]]
          };
        } else {
          currentPeriod.endIndex = i;
          currentPeriod.data.push(sortedData[i]);
          gapCount = 0;
        }
      } else if (currentPeriod) {
        gapCount++;
        if (gapCount > this.maxGap) {
          if (currentPeriod.data.length >= this.minDuration) {
            periods.push(currentPeriod);
          }
          currentPeriod = null;
          gapCount = 0;
        } else {
          currentPeriod.endIndex = i;
          currentPeriod.data.push(sortedData[i]);
        }
      }
    }

    if (currentPeriod && currentPeriod.data.length >= this.minDuration) {
      periods.push(currentPeriod);
    }

    return periods;
  }

  enrichPeriod(period, valueField, dateField) {
    const values = period.data.map(d => d[valueField]);
    const mean = StatisticsUtils.mean(values);
    const max = StatisticsUtils.max(values);
    const min = StatisticsUtils.min(values);
    const std = StatisticsUtils.standardDeviation(values);
    
    return {
      start: period.data[0][dateField],
      end: period.data[period.data.length - 1][dateField],
      duration: period.data.length,
      values,
      stats: {
        mean,
        max,
        min,
        std,
        deviationFromBase: mean
      },
      data: period.data
    };
  }

  classifyAnomalyType(period, baselineMean) {
    const deviation = period.stats.deviationFromBase;
    if (deviation > 0.5) {
      return 'high';
    } else if (deviation < -0.3) {
      return 'low';
    }
    return 'moderate';
  }
}

export default AnomalyPeriodDetector;
