import { StatisticsUtils } from './statistics.utils.js';
import { TimeSeriesUtils } from './time-series.utils.js';

export class HydrologyUtils {
  static calculateRunoffCoefficient(runoff, rainfall) {
    if (rainfall === 0) return 0;
    return runoff / rainfall;
  }

  static calculateFlowDurationCurve(data, valueField = 'runoff_value') {
    const values = data.map(d => d[valueField]).sort((a, b) => b - a);
    const n = values.length;
    
    return values.map((value, index) => ({
      value,
      exceedanceProbability: ((index + 1) / n) * 100,
      nonExceedanceProbability: 100 - ((index + 1) / n) * 100,
      returnPeriod: n / (index + 1)
    }));
  }

  static getFlowPercentile(fdc, percentile) {
    const target = percentile / 100;
    const sorted = [...fdc].sort((a, b) => a.exceedanceProbability - b.exceedanceProbability);
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].exceedanceProbability <= target && sorted[i + 1].exceedanceProbability >= target) {
        const ratio = (target - sorted[i].exceedanceProbability) / 
                      (sorted[i + 1].exceedanceProbability - sorted[i].exceedanceProbability);
        return sorted[i].value + ratio * (sorted[i + 1].value - sorted[i].value);
      }
    }
    
    return sorted[0].value;
  }

  static calculateBaseFlowIndex(data, valueField = 'runoff_value') {
    const values = data.map(d => d[valueField]);
    const sorted = [...values].sort((a, b) => a - b);
    const q90 = StatisticsUtils.percentile(values, 90);
    const q50 = StatisticsUtils.percentile(values, 50);
    
    return q90 / q50;
  }

  static calculateRichardsBakerIndex(data, valueField = 'runoff_value', dateField = 'record_time') {
    const daily = TimeSeriesUtils.calculateDailyStats(data, dateField, valueField);
    const flows = daily.map(d => d.avg);
    
    let sumAbsDiff = 0;
    for (let i = 1; i < flows.length; i++) {
      sumAbsDiff += Math.abs(flows[i] - flows[i - 1]);
    }
    
    const sumFlow = StatisticsUtils.sum(flows);
    
    return sumFlow > 0 ? (sumAbsDiff / sumFlow) * 100 : 0;
  }

  static calculateAnnualRunoffVolume(data, valueField = 'runoff_value') {
    const yearly = TimeSeriesUtils.calculateYearlyStats(data, 'record_time', valueField);
    const secondsPerYear = 365 * 24 * 3600;
    
    return yearly.map(y => ({
      year: y.year,
      avgFlow: y.avg,
      volume: y.avg * secondsPerYear
    }));
  }

  static calculateRunoffYield(data, area, valueField = 'runoff_value') {
    const yearly = TimeSeriesUtils.calculateYearlyStats(data, 'record_time', valueField);
    const conversionFactor = 31536000 / 1000000;
    
    return yearly.map(y => ({
      year: y.year,
      yield: (y.avg * conversionFactor) / area
    }));
  }

  static calculateFlowDurationIndex(data, valueField = 'runoff_value') {
    const fdc = this.calculateFlowDurationCurve(data, valueField);
    const q25 = this.getFlowPercentile(fdc, 25);
    const q75 = this.getFlowPercentile(fdc, 75);
    const q50 = this.getFlowPercentile(fdc, 50);
    
    return {
      slope: (Math.log10(q25) - Math.log10(q75)) / 0.5,
      q25,
      q50,
      q75,
      variability: q75 > 0 ? q25 / q75 : 0
    };
  }

  static calculateCoefficientOfVariation(data, valueField = 'runoff_value') {
    const values = data.map(d => d[valueField]);
    return StatisticsUtils.coefficientOfVariation(values);
  }

  static calculateSeasonalVariation(data, valueField = 'runoff_value', dateField = 'record_time') {
    const monthly = TimeSeriesUtils.calculateMonthlyStats(data, dateField, valueField);
    
    const monthStats = {};
    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, '0');
      const monthData = monthly.filter(d => d.month.endsWith(`-${monthStr}`));
      monthStats[m] = StatisticsUtils.summary(monthData.map(d => d.avg));
    }
    
    return monthStats;
  }

  static calculateLowFlowIndices(data, valueField = 'runoff_value', dateField = 'record_time') {
    const daily = TimeSeriesUtils.calculateDailyStats(data, dateField, valueField);
    const values = daily.map(d => d.avg);
    
    const q90 = StatisticsUtils.percentile(values, 90);
    const q95 = StatisticsUtils.percentile(values, 95);
    const q99 = StatisticsUtils.percentile(values, 99);
    
    let min7Day = Infinity;
    for (let i = 0; i < values.length - 7; i++) {
      const avg7 = StatisticsUtils.mean(values.slice(i, i + 7));
      if (avg7 < min7Day) min7Day = avg7;
    }
    
    let min30Day = Infinity;
    for (let i = 0; i < values.length - 30; i++) {
      const avg30 = StatisticsUtils.mean(values.slice(i, i + 30));
      if (avg30 < min30Day) min30Day = avg30;
    }
    
    return {
      q90,
      q95,
      q99,
      min7Day,
      min30Day
    };
  }

  static calculateFloodIndices(data, valueField = 'runoff_value', dateField = 'record_time') {
    const daily = TimeSeriesUtils.calculateDailyStats(data, dateField, valueField);
    const values = daily.map(d => d.avg);
    
    const q10 = StatisticsUtils.percentile(values, 10);
    const q5 = StatisticsUtils.percentile(values, 5);
    const q1 = StatisticsUtils.percentile(values, 1);
    
    let max1Day = -Infinity;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > max1Day) max1Day = values[i];
    }
    
    let max3Day = -Infinity;
    for (let i = 0; i < values.length - 3; i++) {
      const avg3 = StatisticsUtils.mean(values.slice(i, i + 3));
      if (avg3 > max3Day) max3Day = avg3;
    }
    
    let max7Day = -Infinity;
    for (let i = 0; i < values.length - 7; i++) {
      const avg7 = StatisticsUtils.mean(values.slice(i, i + 7));
      if (avg7 > max7Day) max7Day = avg7;
    }
    
    return {
      q10,
      q5,
      q1,
      max1Day,
      max3Day,
      max7Day
    };
  }
}

export default HydrologyUtils;
