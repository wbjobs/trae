import { StatisticsUtils } from '@utils/statistics.utils.js';
import { TimeSeriesUtils } from '@utils/time-series.utils.js';
import { EcologicalFlowCalculator } from './ecological-flow-calculator.js';

export class EcologicalCoefficientCalculator {
  constructor(options = {}) {
    this.ecologicalFlowCalculator = new EcologicalFlowCalculator(options.flowOptions || {});
    this.period = options.period || 'monthly';
  }

  calculateRunoffCoefficient(runoffData, rainfallData) {
    const runoffValues = runoffData.map(d => d.runoff_value);
    const rainfallValues = rainfallData.map(d => d.rainfall_value);
    
    const totalRunoff = StatisticsUtils.sum(runoffValues);
    const totalRainfall = StatisticsUtils.sum(rainfallValues);
    
    return {
      coefficient: totalRainfall > 0 ? totalRunoff / totalRainfall : 0,
      totalRunoff,
      totalRainfall
    };
  }

  calculateEcologicalRunoffCoefficient(runoffData, zoneConfig) {
    if (!runoffData || runoffData.length === 0) {
      return {
        coefficient: 0,
        meanAnnualFlow: 0,
        ecologicalFlow: 0,
        ecologicalFlowDetails: null,
        zoneId: zoneConfig.id,
        zoneName: zoneConfig.name
      };
    }

    const ecologicalFlow = this.ecologicalFlowCalculator.calculateEcologicalFlow(runoffData, zoneConfig);
    const values = runoffData.map(d => d.runoff_value);
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v) && v >= 0);
    
    if (validValues.length === 0) {
      return {
        coefficient: 0,
        meanAnnualFlow: 0,
        ecologicalFlow: ecologicalFlow.annualOptimal || ecologicalFlow.ecologicalFlow || 0,
        ecologicalFlowDetails: ecologicalFlow,
        zoneId: zoneConfig.id,
        zoneName: zoneConfig.name
      };
    }

    const meanAnnualFlow = StatisticsUtils.mean(validValues);
    const ecoFlow = ecologicalFlow.annualOptimal || ecologicalFlow.ecologicalFlow || ecologicalFlow.baseFlow || 0;
    const coefficient = meanAnnualFlow > 0 ? ecoFlow / meanAnnualFlow : 0;
    
    return {
      coefficient,
      meanAnnualFlow,
      ecologicalFlow: ecoFlow,
      ecologicalFlowDetails: ecologicalFlow,
      zoneId: zoneConfig.id,
      zoneName: zoneConfig.name
    };
  }

  calculateAnnualCoefficients(runoffData, zoneConfig) {
    if (!runoffData || runoffData.length === 0) return [];
    
    const yearly = TimeSeriesUtils.calculateYearlyStats(runoffData, 'record_time', 'runoff_value');
    
    return yearly.map(y => {
      const yearData = runoffData.filter(d => {
        const recordDate = new Date(d.record_time);
        return recordDate.getFullYear().toString() === y.year;
      });
      
      if (yearData.length === 0) {
        return {
          year: y.year,
          avgFlow: 0,
          totalFlow: 0,
          coefficient: 0,
          ecologicalFlow: 0
        };
      }
      
      const ecoCoeff = this.calculateEcologicalRunoffCoefficient(yearData, zoneConfig);
      return {
        year: y.year,
        avgFlow: y.avg,
        totalFlow: y.sum,
        coefficient: ecoCoeff.coefficient,
        ecologicalFlow: ecoCoeff.ecologicalFlow
      };
    });
  }

  calculateMonthlyCoefficients(runoffData, zoneConfig) {
    if (!runoffData || runoffData.length === 0) return [];
    
    const monthly = TimeSeriesUtils.calculateMonthlyStats(runoffData, 'record_time', 'runoff_value');
    
    return monthly.map(m => {
      const monthData = runoffData.filter(d => {
        const recordDate = new Date(d.record_time);
        const yearMonth = `${recordDate.getFullYear()}-${(recordDate.getMonth() + 1).toString().padStart(2, '0')}`;
        return yearMonth === m.month;
      });
      
      if (monthData.length === 0) {
        return {
          month: m.month,
          avgFlow: 0,
          totalFlow: 0,
          coefficient: 0,
          ecologicalFlow: 0
        };
      }
      
      const ecoCoeff = this.calculateEcologicalRunoffCoefficient(monthData, zoneConfig);
      return {
        month: m.month,
        avgFlow: m.avg,
        totalFlow: m.sum,
        coefficient: ecoCoeff.coefficient,
        ecologicalFlow: ecoCoeff.ecologicalFlow
      };
    });
  }

  calculateSeasonalCoefficients(runoffData, zoneConfig) {
    const seasons = {
      spring: [3, 4, 5],
      summer: [6, 7, 8],
      autumn: [9, 10, 11],
      winter: [12, 1, 2]
    };
    
    const results = {};
    
    for (const [season, months] of Object.entries(seasons)) {
      const seasonData = runoffData.filter(d => {
        const month = new Date(d.record_time).getMonth() + 1;
        return months.includes(month);
      });
      
      if (seasonData.length > 0) {
        const ecoCoeff = this.calculateEcologicalRunoffCoefficient(seasonData, zoneConfig);
        results[season] = {
          season,
          months,
          dataCount: seasonData.length,
          avgFlow: StatisticsUtils.mean(seasonData.map(d => d.runoff_value)),
          coefficient: ecoCoeff.coefficient,
          ecologicalFlow: ecoCoeff.ecologicalFlow
        };
      }
    }
    
    return results;
  }

  calculateMultipleZonesCoefficients(zonesData) {
    const results = [];
    
    for (const zoneData of zonesData) {
      const coefficient = this.calculateEcologicalRunoffCoefficient(
        zoneData.data,
        zoneData.zoneConfig
      );
      results.push({
        ...coefficient,
        dataPeriod: {
          start: zoneData.data[0]?.record_time,
          end: zoneData.data[zoneData.data.length - 1]?.record_time,
          dataCount: zoneData.data.length
        }
      });
    }
    
    return results;
  }

  analyzeCoefficientTrend(coeffData) {
    const values = coeffData.map(d => d.coefficient);
    const years = coeffData.map(d => d.year);
    
    const trend = this.calculateTrend(values);
    const variability = StatisticsUtils.coefficientOfVariation(values);
    
    return {
      values,
      years,
      trend,
      variability,
      meanCoefficient: StatisticsUtils.mean(values),
      maxCoefficient: StatisticsUtils.max(values),
      minCoefficient: StatisticsUtils.min(values)
    };
  }

  calculateTrend(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
    
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;
    
    const meanX = StatisticsUtils.mean(x);
    const meanY = StatisticsUtils.mean(y);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (x[i] - meanX) * (y[i] - meanY);
      denominator += Math.pow(x[i] - meanX, 2);
    }
    
    const slope = denominator > 0 ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;
    
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
    
    return {
      slope,
      intercept,
      rSquared,
      direction: slope > 0.001 ? 'increasing' : slope < -0.001 ? 'decreasing' : 'stable'
    };
  }

  generateCoefficientReport(runoffData, zoneConfig) {
    const annual = this.calculateAnnualCoefficients(runoffData, zoneConfig);
    const monthly = this.calculateMonthlyCoefficients(runoffData, zoneConfig);
    const seasonal = this.calculateSeasonalCoefficients(runoffData, zoneConfig);
    const trend = this.analyzeCoefficientTrend(annual);
    const overall = this.calculateEcologicalRunoffCoefficient(runoffData, zoneConfig);
    
    return {
      zoneInfo: {
        id: zoneConfig.id,
        name: zoneConfig.name,
        area: zoneConfig.area
      },
      overall,
      annual,
      monthly,
      seasonal,
      trend,
      summary: {
        dataPeriod: {
          start: runoffData[0]?.record_time,
          end: runoffData[runoffData.length - 1]?.record_time,
          totalRecords: runoffData.length
        },
        avgAnnualCoefficient: trend.meanCoefficient,
        coefficientVariability: trend.variability,
        trendDirection: trend.trend.direction
      }
    };
  }
}

export const ecologicalCoefficientCalculator = new EcologicalCoefficientCalculator();
export default EcologicalCoefficientCalculator;
