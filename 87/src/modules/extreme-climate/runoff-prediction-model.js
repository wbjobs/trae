import { StatisticsUtils } from '@utils/statistics.utils.js';
import { TimeSeriesUtils } from '@utils/time-series.utils.js';
import { ExtremeClimateSimulator, EXTREME_CLIMATE_TYPES } from './extreme-climate-simulator.js';

export class RunoffPredictionModel {
  constructor(options = {}) {
    this.options = options;
    this.modelType = options.modelType || 'hybrid';
    this.climateSimulator = new ExtremeClimateSimulator(options.climateOptions || {});
  }

  predictRunoff(historicalData, predictionDays = 30, climateScenario = null) {
    if (!historicalData || historicalData.length < 30) {
      return {
        prediction: [],
        confidence: 'low',
        message: '历史数据不足，无法进行可靠预测'
      };
    }

    const processedData = this.prepareData(historicalData);
    const basePrediction = this.generateBasePrediction(processedData, predictionDays);
    
    if (climateScenario) {
      const climateAdjusted = this.applyClimateScenario(
        basePrediction,
        climateScenario,
        processedData
      );
      return climateAdjusted;
    }

    const confidence = this.calculateConfidence(processedData);
    const predictionWithIntervals = this.addConfidenceIntervals(basePrediction, confidence);

    return {
      prediction: predictionWithIntervals,
      confidence,
      metrics: this.calculatePredictionMetrics(processedData, predictionWithIntervals),
      trend: this.analyzeTrend(processedData),
      seasonality: this.analyzeSeasonality(processedData)
    };
  }

  prepareData(historicalData) {
    const sorted = [...historicalData].sort((a, b) => 
      new Date(a.record_time) - new Date(b.record_time)
    );

    const values = sorted.map(d => d.runoff_value).filter(v => v !== null && !isNaN(v));
    const stats = StatisticsUtils.summary(values);

    return {
      rawData: sorted,
      values,
      stats,
      dailyStats: TimeSeriesUtils.groupByDay(sorted, 'record_time', 'runoff_value'),
      monthlyStats: TimeSeriesUtils.groupByMonth(sorted, 'record_time', 'runoff_value')
    };
  }

  generateBasePrediction(processedData, predictionDays) {
    const { dailyStats, stats } = processedData;
    const predictions = [];
    
    const lastDate = processedData.rawData[processedData.rawData.length - 1].record_time;
    const startDate = new Date(lastDate);

    const recentDays = Math.min(90, dailyStats.length);
    const recentData = dailyStats.slice(-recentDays);

    const dayOfYearPattern = this.extractDayOfYearPattern(processedData.rawData);

    for (let i = 0; i < predictionDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i + 1);
      const dayOfYear = this.getDayOfYear(date);

      const seasonalFactor = dayOfYearPattern[dayOfYear] || 1.0;
      const trendFactor = this.calculateTrendFactor(recentData, i, predictionDays);
      const randomFactor = 0.95 + Math.random() * 0.1;

      const predictedValue = stats.mean * seasonalFactor * trendFactor * randomFactor;

      predictions.push({
        record_time: date.toISOString().replace('T', ' ').substring(0, 19),
        forecast_date: date.toISOString().split('T')[0],
        runoff_value: Number(Math.max(0, predictedValue).toFixed(3)),
        forecast_day: i + 1,
        horizon: i < 7 ? 'short' : i < 30 ? 'medium' : 'long',
        seasonal_factor: Number(seasonalFactor.toFixed(3)),
        trend_factor: Number(trendFactor.toFixed(3))
      });
    }

    return predictions;
  }

  extractDayOfYearPattern(rawData) {
    const pattern = {};
    const dayValues = {};

    for (const item of rawData) {
      const date = new Date(item.record_time);
      const dayOfYear = this.getDayOfYear(date);
      
      if (!dayValues[dayOfYear]) {
        dayValues[dayOfYear] = [];
      }
      dayValues[dayOfYear].push(item.runoff_value);
    }

    const allMean = StatisticsUtils.mean(rawData.map(d => d.runoff_value));

    for (const [day, values] of Object.entries(dayValues)) {
      if (values.length >= 2) {
        pattern[day] = StatisticsUtils.mean(values) / allMean;
      }
    }

    return this.smoothPattern(pattern);
  }

  smoothPattern(pattern) {
    const smoothed = {};
    const days = Object.keys(pattern).map(Number).sort((a, b) => a - b);

    for (const day of days) {
      const neighbors = [];
      for (let offset = -3; offset <= 3; offset++) {
        const neighborDay = ((day + offset - 1) % 365 + 365) % 365 + 1;
        if (pattern[neighborDay] !== undefined) {
          neighbors.push(pattern[neighborDay]);
        }
      }
      if (neighbors.length > 0) {
        smoothed[day] = StatisticsUtils.mean(neighbors);
      }
    }

    return smoothed;
  }

  getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  calculateTrendFactor(recentData, dayIndex, totalDays) {
    if (recentData.length < 7) return 1.0;

    const values = recentData.map(d => d.mean);
    const slope = this.calculateSlope(values);
    
    const trendProjection = slope * (dayIndex + 1) * 0.1;
    const damping = 1 - (dayIndex / totalDays) * 0.5;
    
    return 1 + trendProjection * damping;
  }

  calculateSlope(values) {
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = StatisticsUtils.mean(values);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }
    
    return denominator > 0 ? numerator / denominator / yMean : 0;
  }

  applyClimateScenario(basePrediction, climateScenario, processedData) {
    const { stats } = processedData;
    const climateResult = this.climateSimulator.simulateExtremeRunoff(
      processedData.rawData,
      climateScenario.climateType,
      climateScenario.intensity,
      basePrediction.length
    );

    const adjustedPrediction = basePrediction.map((pred, i) => {
      const climateData = climateResult.simulatedData[i];
      if (!climateData) return pred;

      const weight = Math.min(1, (i + 1) / 7);
      const adjustedValue = pred.runoff_value * (1 - weight) + climateData.runoff_value * weight;

      return {
        ...pred,
        runoff_value: Number(adjustedValue.toFixed(3)),
        climate_adjusted: true,
        climate_type: climateScenario.climateType,
        climate_intensity: climateScenario.intensity,
        anomaly_ratio: Number((adjustedValue / stats.mean).toFixed(2))
      };
    });

    const confidence = this.calculateConfidence(processedData, climateScenario);

    return {
      prediction: adjustedPrediction,
      confidence,
      climateScenario: {
        type: climateScenario.climateType,
        intensity: climateScenario.intensity,
        description: climateResult.climateParams.name
      },
      riskAssessment: climateResult.riskAssessment,
      impactAnalysis: climateResult.impactAnalysis,
      returnPeriod: climateResult.returnPeriod,
      metrics: this.calculatePredictionMetrics(processedData, adjustedPrediction)
    };
  }

  addConfidenceIntervals(prediction, confidence) {
    const confidenceLevels = {
      high: 0.1,
      medium: 0.2,
      low: 0.35
    };

    const errorRatio = confidenceLevels[confidence] || 0.25;

    return prediction.map(pred => ({
      ...pred,
      confidence_lower: Number(Math.max(0, pred.runoff_value * (1 - errorRatio)).toFixed(3)),
      confidence_upper: Number(pred.runoff_value * (1 + errorRatio)).toFixed(3),
      confidence_level: confidence
    }));
  }

  calculateConfidence(processedData, climateScenario = null) {
    const { dailyStats, values } = processedData;
    let confidence = 'medium';
    let score = 50;

    if (dailyStats.length >= 365) {
      score += 20;
    } else if (dailyStats.length >= 180) {
      score += 10;
    } else if (dailyStats.length >= 90) {
      score += 5;
    }

    const cv = StatisticsUtils.standardDeviation(values) / StatisticsUtils.mean(values);
    if (cv < 0.2) {
      score += 15;
    } else if (cv < 0.4) {
      score += 10;
    } else if (cv < 0.6) {
      score += 5;
    }

    if (climateScenario) {
      score -= 15;
    }

    if (score >= 75) confidence = 'high';
    else if (score >= 45) confidence = 'medium';
    else confidence = 'low';

    return confidence;
  }

  calculatePredictionMetrics(processedData, prediction) {
    const { stats } = processedData;
    const predictedValues = prediction.map(p => p.runoff_value);

    return {
      min: StatisticsUtils.min(predictedValues),
      max: StatisticsUtils.max(predictedValues),
      mean: StatisticsUtils.mean(predictedValues),
      std: StatisticsUtils.standardDeviation(predictedValues),
      totalRunoff: StatisticsUtils.sum(predictedValues),
      deviationFromHistorical: Number((StatisticsUtils.mean(predictedValues) / stats.mean).toFixed(3)),
      trend: this.calculateTrend(predictedValues),
      peakOccurrence: this.findPeakOccurrence(prediction)
    };
  }

  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstMean = StatisticsUtils.mean(firstHalf);
    const secondMean = StatisticsUtils.mean(secondHalf);
    const change = (secondMean - firstMean) / firstMean;
    
    if (change > 0.1) return 'rising';
    if (change < -0.1) return 'falling';
    return 'stable';
  }

  findPeakOccurrence(prediction) {
    let maxValue = -Infinity;
    let maxIndex = 0;

    for (let i = 0; i < prediction.length; i++) {
      if (prediction[i].runoff_value > maxValue) {
        maxValue = prediction[i].runoff_value;
        maxIndex = i;
      }
    }

    return {
      value: maxValue,
      day: maxIndex + 1,
      date: prediction[maxIndex]?.forecast_date
    };
  }

  analyzeTrend(processedData) {
    const { monthlyStats } = processedData;
    if (monthlyStats.length < 6) return { direction: 'insufficient_data' };

    const values = monthlyStats.map(m => m.mean);
    const slope = this.calculateSlope(values);

    let direction;
    if (slope > 0.01) direction = 'increasing';
    else if (slope < -0.01) direction = 'decreasing';
    else direction = 'stable';

    return {
      direction,
      slope: Number(slope.toFixed(5)),
      magnitude: Math.abs(slope) > 0.05 ? 'significant' : 'moderate'
    };
  }

  analyzeSeasonality(processedData) {
    const { monthlyStats } = processedData;
    if (monthlyStats.length < 12) return { pattern: 'insufficient_data' };

    const monthlyMeans = {};
    for (const stat of monthlyStats) {
      const month = stat.date.split('-')[1];
      if (!monthlyMeans[month]) {
        monthlyMeans[month] = [];
      }
      monthlyMeans[month].push(stat.mean);
    }

    const seasonalPattern = {};
    for (const [month, values] of Object.entries(monthlyMeans)) {
      seasonalPattern[month] = {
        mean: StatisticsUtils.mean(values),
        std: StatisticsUtils.standardDeviation(values)
      };
    }

    const allValues = Object.values(seasonalPattern).map(v => v.mean);
    const overallMean = StatisticsUtils.mean(allValues);

    const peakMonth = Object.entries(seasonalPattern)
      .reduce((a, b) => a[1].mean > b[1].mean ? a : b)[0];
    const lowMonth = Object.entries(seasonalPattern)
      .reduce((a, b) => a[1].mean < b[1].mean ? a : b)[0];

    return {
      pattern: 'strong',
      seasonalVariation: Number((StatisticsUtils.standardDeviation(allValues) / overallMean).toFixed(3)),
      peakMonth,
      lowMonth,
      monthlyPattern: seasonalPattern
    };
  }
}

export const runoffPredictionModel = new RunoffPredictionModel();
export default RunoffPredictionModel;
