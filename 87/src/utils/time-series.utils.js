import dayjs from 'dayjs';
import { StatisticsUtils } from './statistics.utils.js';

export class TimeSeriesUtils {
  static groupByDate(data, dateField = 'record_time', valueField = 'runoff_value', format = 'day') {
    const groups = {};
    
    for (const item of data) {
      const date = dayjs(item[dateField]);
      let key;
      
      switch (format) {
        case 'year':
          key = date.format('YYYY');
          break;
        case 'month':
          key = date.format('YYYY-MM');
          break;
        case 'week':
          key = date.format('YYYY-[W]ww');
          break;
        case 'day':
        default:
          key = date.format('YYYY-MM-DD');
          break;
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item[valueField]);
    }
    
    return Object.entries(groups).map(([key, values]) => ({
      date: key,
      values,
      ...StatisticsUtils.summary(values)
    }));
  }

  static groupByYear(data, dateField, valueField) {
    return this.groupByDate(data, dateField, valueField, 'year');
  }

  static groupByMonth(data, dateField, valueField) {
    return this.groupByDate(data, dateField, valueField, 'month');
  }

  static groupByWeek(data, dateField, valueField) {
    return this.groupByDate(data, dateField, valueField, 'week');
  }

  static groupByDay(data, dateField, valueField) {
    return this.groupByDate(data, dateField, valueField, 'day');
  }

  static aggregateByPeriod(data, dateField = 'record_time', valueField = 'runoff_value', period = 'monthly') {
    const formatMap = {
      'yearly': 'year',
      'monthly': 'month',
      'weekly': 'week',
      'daily': 'day'
    };
    
    return this.groupByDate(data, dateField, valueField, formatMap[period] || 'day');
  }

  static calculateDailyStats(data, dateField, valueField) {
    const dailyData = this.groupByDay(data, dateField, valueField);
    return dailyData.map(d => ({
      date: d.date,
      avg: d.mean,
      max: d.max,
      min: d.min,
      sum: d.sum,
      count: d.count
    }));
  }

  static calculateMonthlyStats(data, dateField, valueField) {
    const monthlyData = this.groupByMonth(data, dateField, valueField);
    return monthlyData.map(d => ({
      month: d.date,
      avg: d.mean,
      max: d.max,
      min: d.min,
      sum: d.sum,
      count: d.count
    }));
  }

  static calculateYearlyStats(data, dateField, valueField) {
    const yearlyData = this.groupByYear(data, dateField, valueField);
    return yearlyData.map(d => ({
      year: d.date,
      avg: d.mean,
      max: d.max,
      min: d.min,
      sum: d.sum,
      count: d.count
    }));
  }

  static extractTimeSeries(data, dateField = 'record_time', valueField = 'runoff_value') {
    const sorted = [...data].sort((a, b) => 
      new Date(a[dateField]) - new Date(b[dateField])
    );
    
    return {
      times: sorted.map(d => d[dateField]),
      values: sorted.map(d => d[valueField])
    };
  }

  static fillTimeGaps(data, dateField = 'record_time', valueField = 'runoff_value', interval = 'day') {
    if (data.length === 0) return [];
    
    const sorted = [...data].sort((a, b) => 
      new Date(a[dateField]) - new Date(b[dateField])
    );
    
    const result = [];
    let current = dayjs(sorted[0][dateField]);
    const end = dayjs(sorted[sorted.length - 1][dateField]);
    
    let dataIndex = 0;
    while (current.isBefore(end) || current.isSame(end, interval)) {
      const currentStr = current.format('YYYY-MM-DD');
      const found = sorted.find(d => dayjs(d[dateField]).format('YYYY-MM-DD') === currentStr);
      
      if (found) {
        result.push({ ...found, _gapFilled: false });
      } else {
        result.push({
          [dateField]: current.format('YYYY-MM-DD HH:mm:ss'),
          [valueField]: null,
          _gapFilled: true
        });
      }
      
      current = current.add(1, interval);
    }
    
    return result;
  }

  static seasonalDecompose(data, dateField, valueField, period = 12) {
    const { values } = this.extractTimeSeries(data, dateField, valueField);
    const n = values.length;
    
    const trend = StatisticsUtils.movingAverage(values, period);
    
    const detrended = values.map((v, i) => v - trend[i]);
    
    const seasonal = new Array(n);
    for (let i = 0; i < period; i++) {
      const seasonalValues = [];
      for (let j = i; j < n; j += period) {
        seasonalValues.push(detrended[j]);
      }
      const seasonalMean = StatisticsUtils.mean(seasonalValues);
      for (let j = i; j < n; j += period) {
        seasonal[j] = seasonalMean;
      }
    }
    
    const residual = values.map((v, i) => v - trend[i] - seasonal[i]);
    
    return {
      original: values,
      trend,
      seasonal,
      residual
    };
  }

  static comparePeriods(data, dateField, valueField, period1, period2) {
    const period1Data = data.filter(d => {
      const date = dayjs(d[dateField]);
      return date.isAfter(dayjs(period1.start)) && date.isBefore(dayjs(period1.end));
    });
    
    const period2Data = data.filter(d => {
      const date = dayjs(d[dateField]);
      return date.isAfter(dayjs(period2.start)) && date.isBefore(dayjs(period2.end));
    });
    
    const values1 = period1Data.map(d => d[valueField]);
    const values2 = period2Data.map(d => d[valueField]);
    
    return {
      period1: {
        ...period1,
        stats: StatisticsUtils.summary(values1)
      },
      period2: {
        ...period2,
        stats: StatisticsUtils.summary(values2)
      },
      comparison: {
        meanChange: StatisticsUtils.mean(values2) - StatisticsUtils.mean(values1),
        meanChangePercent: ((StatisticsUtils.mean(values2) - StatisticsUtils.mean(values1)) / 
                           (StatisticsUtils.mean(values1) || 1)) * 100,
        totalChange: StatisticsUtils.sum(values2) - StatisticsUtils.sum(values1),
        correlation: StatisticsUtils.correlation(
          values1.slice(0, Math.min(values1.length, values2.length)),
          values2.slice(0, Math.min(values1.length, values2.length))
        )
      }
    };
  }
}

export default TimeSeriesUtils;
