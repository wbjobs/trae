import dayjs from 'dayjs';
import { AnomalyPeriodDetector } from './anomaly-period-detector.js';
import { StatisticsUtils } from '@utils/statistics.utils.js';

export class AnomalyPeriodAggregator {
  constructor(options = {}) {
    this.detector = new AnomalyPeriodDetector(options.detectorOptions || {});
    this.aggregationPeriod = options.aggregationPeriod || 'monthly';
  }

  aggregateAnomalies(data, valueField = 'runoff_value', dateField = 'record_time') {
    const periods = this.detector.detectAnomalyPeriods(data, valueField, dateField);
    const allValues = data.map(d => d[valueField]);
    const baselineMean = StatisticsUtils.mean(allValues);
    const baselineStd = StatisticsUtils.standardDeviation(allValues);
    
    const enrichedPeriods = periods.map(period => {
      const periodMean = period.stats.mean;
      const deviationFromBaseline = baselineMean > 0 
        ? ((periodMean - baselineMean) / baselineMean)
        : 0;
      
      return {
        ...period,
        stats: {
          ...period.stats,
          deviationFromBase: deviationFromBaseline,
          zScore: baselineStd > 0 ? (periodMean - baselineMean) / baselineStd : 0
        },
        type: this.detector.classifyAnomalyType({ ...period, stats: { ...period.stats, deviationFromBase: deviationFromBaseline } }, baselineMean),
        severity: this.calculateSeverity({ ...period, stats: { ...period.stats, deviationFromBase: deviationFromBaseline } }, baselineMean),
        impact: null
      };
    });

    enrichedPeriods.forEach(p => {
      p.impact = this.assessImpact(p);
    });

    return {
      totalPeriods: enrichedPeriods.length,
      periods: enrichedPeriods,
      summary: this.generateSummary(enrichedPeriods, data, valueField),
      byType: this.groupByType(enrichedPeriods),
      bySeverity: this.groupBySeverity(enrichedPeriods),
      temporalDistribution: this.analyzeTemporalDistribution(enrichedPeriods, dateField)
    };
  }

  calculateSeverity(period, baselineMean) {
    const deviation = period.stats.deviationFromBase;
    const duration = period.duration;
    const magnitude = Math.abs(deviation);
    
    let severity;
    if (magnitude > 1.0 || (magnitude > 0.5 && duration > 7)) {
      severity = 'critical';
    } else if (magnitude > 0.5 || (magnitude > 0.3 && duration > 5)) {
      severity = 'high';
    } else if (magnitude > 0.3 || (magnitude > 0.15 && duration > 3)) {
      severity = 'moderate';
    } else {
      severity = 'low';
    }
    
    return {
      level: severity,
      score: magnitude * duration,
      magnitude,
      duration
    };
  }

  assessImpact(period) {
    const type = period.type;
    const severity = period.severity;
    const duration = period.duration;
    
    let ecologicalImpact = 'low';
    let operationalImpact = 'low';
    
    if (type === 'low' && (severity === 'critical' || severity === 'high')) {
      ecologicalImpact = 'high';
      operationalImpact = duration > 7 ? 'high' : 'moderate';
    } else if (type === 'high' && severity === 'critical') {
      ecologicalImpact = 'high';
      operationalImpact = 'high';
    } else if (severity === 'moderate') {
      ecologicalImpact = 'moderate';
      operationalImpact = duration > 10 ? 'moderate' : 'low';
    }
    
    return {
      ecologicalImpact,
      operationalImpact,
      recommendedAction: this.getRecommendedAction(ecologicalImpact, operationalImpact)
    };
  }

  getRecommendedAction(ecologicalImpact, operationalImpact) {
    if (ecologicalImpact === 'high' || operationalImpact === 'high') {
      return '立即采取措施：发布预警通知，启动应急预案';
    } else if (ecologicalImpact === 'moderate' || operationalImpact === 'moderate') {
      return '密切关注：加强监测频率，评估潜在影响';
    }
    return '常规监测：继续跟踪数据变化';
  }

  generateSummary(periods, data, valueField) {
    if (periods.length === 0) {
      return {
        totalDuration: 0,
        percentage: 0,
        avgDuration: 0,
        maxDuration: 0,
        criticalCount: 0,
        highCount: 0
      };
    }

    const totalDuration = periods.reduce((sum, p) => sum + p.duration, 0);
    const durations = periods.map(p => p.duration);
    
    return {
      totalDuration,
      percentage: (totalDuration / data.length) * 100,
      avgDuration: StatisticsUtils.mean(durations),
      maxDuration: StatisticsUtils.max(durations),
      criticalCount: periods.filter(p => p.severity.level === 'critical').length,
      highCount: periods.filter(p => p.severity.level === 'high').length,
      moderateCount: periods.filter(p => p.severity.level === 'moderate').length,
      lowCount: periods.filter(p => p.severity.level === 'low').length
    };
  }

  groupByType(periods) {
    return {
      high: periods.filter(p => p.type === 'high'),
      low: periods.filter(p => p.type === 'low'),
      moderate: periods.filter(p => p.type === 'moderate')
    };
  }

  groupBySeverity(periods) {
    return {
      critical: periods.filter(p => p.severity.level === 'critical'),
      high: periods.filter(p => p.severity.level === 'high'),
      moderate: periods.filter(p => p.severity.level === 'moderate'),
      low: periods.filter(p => p.severity.level === 'low')
    };
  }

  analyzeTemporalDistribution(periods, dateField) {
    const distribution = {
      byMonth: {},
      byYear: {},
      bySeason: { spring: 0, summer: 0, autumn: 0, winter: 0 }
    };

    for (const period of periods) {
      const startDate = dayjs(period.start);
      const month = startDate.month() + 1;
      const year = startDate.year();
      
      distribution.byMonth[month] = (distribution.byMonth[month] || 0) + 1;
      distribution.byYear[year] = (distribution.byYear[year] || 0) + 1;
      
      const season = this.getSeason(month);
      distribution.bySeason[season]++;
    }

    return distribution;
  }

  getSeason(month) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }

  comparePeriods(period1Data, period2Data, valueField) {
    const anomalies1 = this.aggregateAnomalies(period1Data, valueField);
    const anomalies2 = this.aggregateAnomalies(period2Data, valueField);

    return {
      period1: anomalies1,
      period2: anomalies2,
      comparison: {
        countChange: anomalies2.totalPeriods - anomalies1.totalPeriods,
        countChangePercent: anomalies1.totalPeriods > 0 
          ? ((anomalies2.totalPeriods - anomalies1.totalPeriods) / anomalies1.totalPeriods) * 100 
          : anomalies2.totalPeriods * 100,
        durationChange: anomalies2.summary.totalDuration - anomalies1.summary.totalDuration,
        criticalChange: (anomalies2.summary.criticalCount || 0) - (anomalies1.summary.criticalCount || 0)
      }
    };
  }
}

export const anomalyPeriodAggregator = new AnomalyPeriodAggregator();
export default AnomalyPeriodAggregator;
